const pool = require('../config/db');

// Create Ticket
exports.createTicket = async (req, res) => {
  const {
    serial_number, brand, model, initial_condition, priority, initial_cost,
    assigned_team_id, assigned_user_id, processor, ram, storage
  } = req.body;

  try {
    // Get first stage
    const stageResult = await pool.query(
      'SELECT stage_id, team_id, stage_name FROM stages ORDER BY stage_order ASC LIMIT 1'
    );

    if (stageResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No stages configured in system'
      });
    }

    const firstStage = stageResult.rows[0];

    // Determine assignments
    // Default to first stage defaults
    let finalTeamId = firstStage.team_id;
    let finalStageId = firstStage.stage_id;
    let finalUserId = req.user.user_id;

    // Override if Floor Manager/Admin and provided specific assignments
    if ((req.user.role === 'floor_manager' || req.user.role === 'admin') && assigned_team_id) {
      finalTeamId = assigned_team_id;
      // User ID is optional but can be assigned if provided
      finalUserId = assigned_user_id || null;

      // Find the stage corresponding to this team
      const stageForTeam = await pool.query(
        'SELECT stage_id FROM stages WHERE team_id = $1 ORDER BY stage_order ASC LIMIT 1',
        [assigned_team_id]
      );

      if (stageForTeam.rows.length > 0) {
        finalStageId = stageForTeam.rows[0].stage_id;
      }
    }


    // Fetch Machine Number and Specs if exists
    let machine_number = null;
    let inv_processor = processor;
    let inv_ram = ram;
    let inv_storage = storage;

    const invRes = await pool.query('SELECT machine_number, processor, ram, storage FROM inventory WHERE serial_number = $1', [serial_number]);
    if (invRes.rows.length > 0) {
      machine_number = invRes.rows[0].machine_number;
      inv_processor = inv_processor || invRes.rows[0].processor;
      inv_ram = inv_ram || invRes.rows[0].ram;
      inv_storage = inv_storage || invRes.rows[0].storage;
    }

    // Create ticket
    const result = await pool.query(
      `INSERT INTO tickets 
       (serial_number, brand, model, initial_condition, priority, current_stage_id, assigned_team_id, assigned_user_id, initial_cost, machine_number, processor, ram, storage) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
       RETURNING *`,
      [serial_number, brand, model, initial_condition, priority || 'normal',
        finalStageId, finalTeamId, finalUserId, initial_cost || 0, machine_number,
        inv_processor, inv_ram, inv_storage]
    );

    const ticket = result.rows[0];

    // Log activity
    let logMessage = `Ticket created with serial: ${serial_number}`;
    if (finalTeamId !== firstStage.team_id) {
      logMessage += ` (Custom Assignment: Team ${finalTeamId} / Stage ${finalStageId})`;
    }

    await pool.query(
      `INSERT INTO activities (ticket_id, stage_id, user_id, action, notes) 
       VALUES ($1, $2, $3, $4, $5)`,
      [ticket.ticket_id, finalStageId, req.user.user_id, 'created', logMessage]
    );

    // Update Inventory Status to 'Floor' if item exists
    await pool.query(
      "UPDATE inventory SET status = 'Floor', stage = $2 WHERE serial_number = $1 OR machine_number = $1",
      [serial_number, firstStage.stage_name] // Use firstStage.stage_name as default. If custom assignment, we might need stageForTeam name.
    );

    res.status(201).json({
      success: true,
      message: 'Ticket created successfully',
      ticket
    });
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({
        success: false,
        message: 'Serial number already exists'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error creating ticket'
    });
  }
};

// Get Tickets (with filters)
exports.getTickets = async (req, res) => {
  const { status, stage_id, team_id, search } = req.query;

  try {
    let isProcurementTeam = false;
    if (req.user.team_id) {
      const teamRes = await pool.query(
        `SELECT team_name FROM teams WHERE team_id = $1`,
        [req.user.team_id]
      );
      const teamName = teamRes.rows[0]?.team_name || '';
      isProcurementTeam = teamName.toLowerCase().includes('procurement');
    }

    let query = `
      SELECT t.*, 
             s.stage_name, s.stage_order,
             tm.team_name,
             u.name as assigned_user_name
      FROM tickets t
      LEFT JOIN stages s ON t.current_stage_id = s.stage_id
      LEFT JOIN teams tm ON t.assigned_team_id = tm.team_id
      LEFT JOIN users u ON t.assigned_user_id = u.user_id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

    if (status) {
      query += ` AND t.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (stage_id) {
      query += ` AND t.current_stage_id = $${paramCount}`;
      params.push(stage_id);
      paramCount++;
    }

    // Role-based visibility
    const privilegedRoles = ['admin', 'floor_manager', 'manager'];
    const userTeamIds = req.user.team_ids && req.user.team_ids.length > 0
      ? req.user.team_ids
      : (req.user.team_id != null ? [req.user.team_id] : []);

    if (!privilegedRoles.includes(req.user.role)) {
      // Regular users: See tickets assigned to ME or Unassigned in ANY of MY TEAMS
      if (!team_id) {
        if (isProcurementTeam) {
          query += ` AND (
            t.assigned_user_id = $${paramCount}
            OR (t.assigned_team_id = $${paramCount + 1} AND t.assigned_user_id IS NULL)
            OR EXISTS (
              SELECT 1 FROM part_requests pr
              WHERE pr.ticket_id = t.ticket_id AND pr.status = 'pending'
            )
          )`;
          params.push(req.user.user_id);
          params.push(req.user.team_id);
          paramCount += 2;
        } else if (userTeamIds.length > 0) {
          query += ` AND (
            t.assigned_user_id = $${paramCount}
            OR (t.assigned_team_id = ANY($${paramCount + 1}::int[]) AND t.assigned_user_id IS NULL)
          )`;
          params.push(req.user.user_id);
          params.push(userTeamIds);
          paramCount += 2;
        } else {
          query += ` AND (t.assigned_user_id = $${paramCount} OR (t.assigned_team_id = $${paramCount + 1} AND t.assigned_user_id IS NULL))`;
          params.push(req.user.user_id);
          params.push(req.user.team_id);
          paramCount += 2;
        }
      }
    } else {
      // Admins/Managers can filter by ANY team_id if provided query param
      if (team_id) {
        query += ` AND t.assigned_team_id = $${paramCount}`;
        params.push(team_id);
        paramCount++;
      }
    }

    if (search) {
      query += ` AND (t.serial_number ILIKE $${paramCount} OR t.model ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    query += ' ORDER BY t.created_at DESC';

    const result = await pool.query(query, params);

    res.json({
      success: true,
      count: result.rows.length,
      tickets: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error fetching tickets'
    });
  }
};

// Get all stages
exports.getAllStages = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM stages ORDER BY stage_order ASC');
    res.json({ success: true, stages: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error fetching stages' });
  }
};

// Get My Tickets (assigned to user or any of their teams)
exports.getMyTickets = async (req, res) => {
  try {
    let query = `
      SELECT t.*, 
             s.stage_name, s.stage_order,
             tm.team_name,
             u.name as assigned_user_name
      FROM tickets t
      LEFT JOIN stages s ON t.current_stage_id = s.stage_id
      LEFT JOIN teams tm ON t.assigned_team_id = tm.team_id
      LEFT JOIN users u ON t.assigned_user_id = u.user_id
    `;

    const params = [];
    const userTeamIds = req.user.team_ids && req.user.team_ids.length > 0
      ? req.user.team_ids
      : (req.user.team_id != null ? [req.user.team_id] : []);

    if (req.user.role !== 'admin') {
      if (userTeamIds.length > 0) {
        query += ` WHERE t.assigned_user_id = $1 OR t.assigned_team_id = ANY($2::int[])`;
        params.push(req.user.user_id, userTeamIds);
      } else {
        query += ` WHERE t.assigned_user_id = $1 OR t.assigned_team_id = $2`;
        params.push(req.user.user_id, req.user.team_id);
      }
    }

    query += ` ORDER BY t.created_at DESC`;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      count: result.rows.length,
      tickets: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error fetching your tickets'
    });
  }
};

// Get Ticket by ID
exports.getTicketById = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT t.*, 
              s.stage_name, s.stage_order,
              tm.team_name,
              u.name as assigned_user_name
       FROM tickets t
       LEFT JOIN stages s ON t.current_stage_id = s.stage_id
       LEFT JOIN teams tm ON t.assigned_team_id = tm.team_id
       LEFT JOIN users u ON t.assigned_user_id = u.user_id
       WHERE t.ticket_id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const ticket = result.rows[0];

    // Get activities
    const activities = await pool.query(
      `SELECT a.*, u.name as user_name, s.stage_name
       FROM activities a
       LEFT JOIN users u ON a.user_id = u.user_id
       LEFT JOIN stages s ON a.stage_id = s.stage_id
       WHERE a.ticket_id = $1
       ORDER BY a.created_at DESC`,
      [id]
    );

    // Get photos
    const photos = await pool.query(
      `SELECT p.*, u.name as uploaded_by_name, s.stage_name
       FROM photos p
       LEFT JOIN users u ON p.uploaded_by = u.user_id
       LEFT JOIN stages s ON p.stage_id = s.stage_id
       WHERE p.ticket_id = $1
       ORDER BY p.uploaded_at DESC`,
      [id]
    );

    // Get parts
    const parts = await pool.query(
      `SELECT tp.*, p.part_name, p.part_type, p.cost as unit_cost, (tp.quantity_used * p.cost) as total_part_cost
       FROM ticket_parts tp
       LEFT JOIN parts p ON tp.part_id = p.part_id
       WHERE tp.ticket_id = $1`,
      [id]
    );

    // Get service costs
    const services = await pool.query(
      `SELECT ts.*, u.name as added_by_name
       FROM ticket_services ts
       LEFT JOIN users u ON ts.added_by = u.user_id
       WHERE ts.ticket_id = $1`,
      [id]
    );

    // Get part requests
    const partRequests = await pool.query(
      `SELECT pr.*, u.name as requested_by_name
       FROM part_requests pr
       LEFT JOIN users u ON pr.requested_by = u.user_id
       WHERE pr.ticket_id = $1
       ORDER BY pr.created_at DESC`,
      [id]
    );

    // Calculate Totals
    const initialCost = parseFloat(ticket.initial_cost) || 0;
    const partsTotal = parts.rows.reduce((sum, part) => sum + (parseFloat(part.total_part_cost) || 0), 0);
    const servicesTotal = services.rows.reduce((sum, svc) => sum + (parseFloat(svc.cost) || 0), 0);
    const grandTotal = initialCost + partsTotal + servicesTotal;

    res.json({
      success: true,
      ticket: {
        ...ticket,
        initial_cost: initialCost,
        parts_total: partsTotal,
        services_total: servicesTotal,
        grand_total: grandTotal
      },
      activities: activities.rows,
      photos: photos.rows,
      parts: parts.rows,
      services: services.rows,
      part_requests: partRequests.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error fetching ticket'
    });
  }
};

// Update Ticket
exports.updateTicket = async (req, res) => {
  const { id } = req.params;
  const { brand, model, status, priority, notes } = req.body;

  try {
    const result = await pool.query(
      `UPDATE tickets 
       SET brand = COALESCE($1, brand),
           model = COALESCE($2, model),
           status = COALESCE($3, status),
           priority = COALESCE($4, priority)
       WHERE ticket_id = $5
       RETURNING *`,
      [brand, model, status, priority, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Log activity
    await pool.query(
      `INSERT INTO activities (ticket_id, user_id, action, notes) 
       VALUES ($1, $2, $3, $4)`,
      [id, req.user.user_id, 'updated', notes || 'Ticket details updated']
    );

    res.json({
      success: true,
      message: 'Ticket updated successfully',
      ticket: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error updating ticket'
    });
  }
};

// Move Ticket to Next Stage or Jump to Specific Stage
exports.moveToNextStage = async (req, res) => {
  const { id } = req.params;
  const { notes, checklist_data, target_stage_id } = req.body;

  try {
    // Get current ticket
    const ticketResult = await pool.query(
      'SELECT * FROM tickets WHERE ticket_id = $1',
      [id]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const ticket = ticketResult.rows[0];
    let nextStage;

    // Check for Manual Override (Jump)
    const canJump = req.user.role === 'floor_manager' || req.user.role === 'admin';

    if (target_stage_id && canJump) {
      // Fetch target stage
      const targetStageRes = await pool.query('SELECT * FROM stages WHERE stage_id = $1', [target_stage_id]);
      if (targetStageRes.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Target stage not found' });
      }
      nextStage = targetStageRes.rows[0];
    } else {
      // Default: Get next sequential stage
      const nextStageResult = await pool.query(
        `SELECT * FROM stages 
           WHERE stage_order > (SELECT stage_order FROM stages WHERE stage_id = $1)
           ORDER BY stage_order ASC LIMIT 1`,
        [ticket.current_stage_id]
      );

      if (nextStageResult.rows.length > 0) {
        nextStage = nextStageResult.rows[0];
      }
    }

    // If no next stage found (and not jumping), assume completion
    if (!nextStage) {
      // ... existing completion logic for fallback ...
    }

    // Save checklist data... (keep existing)
    if (checklist_data) {
      await pool.query(
        `INSERT INTO ticket_checklist_progress (ticket_id, stage_id, checklist_data, completed_by)
         VALUES ($1, $2, $3, $4)`,
        [id, ticket.current_stage_id, JSON.stringify(checklist_data), req.user.user_id]
      );
    }

    // LOGIC for Inventory Stage (completion)
    let isCompleted = false;
    let successMessage = `Ticket moved to ${nextStage.stage_name}`;

    if (nextStage.stage_name === 'Inventory') {
      isCompleted = true;
      successMessage = 'Ticket moved to Inventory and marked as Ready Stock';

      // Update Inventory if serial matches
      await pool.query(
        `UPDATE inventory 
             SET status = 'In Stock', stock_type = 'Ready' 
             WHERE serial_number = $1`,
        [ticket.serial_number]
      );
    }

    // Update ticket to next stage
    // If completed, we also set status='completed' and completed_at
    let updateQuery = `UPDATE tickets 
       SET current_stage_id = $1, assigned_team_id = $2, assigned_user_id = NULL`;

    const updateParams = [nextStage.stage_id, nextStage.team_id, id];

    if (isCompleted) {
      updateQuery += `, status = 'completed', completed_at = CURRENT_TIMESTAMP`;
    } else {
      // Ensure status is in_progress if we are jumping BACK or moving to active stage
      updateQuery += `, status = 'in_progress', completed_at = NULL`;

      // Also SYNC Inventory: If completed ticket is moved back, reset inventory status
      if (ticket.status === 'completed') {
        // We can't await here easily inside the query builder unless we do it separately.
        // But we have ticket.serial_number.
        await pool.query(
          `UPDATE inventory SET status = 'Floor', stock_type = 'Cooling Period' WHERE serial_number = $1`,
          [ticket.serial_number]
        );
      }
    }

    // SYNC Inventory Stage
    if (nextStage && nextStage.stage_name) {
      await pool.query(
        `UPDATE inventory SET stage = $1 WHERE serial_number = $2`,
        [nextStage.stage_name, ticket.serial_number]
      );
    }

    updateQuery += ` WHERE ticket_id = $3 RETURNING *`;

    const updateResult = await pool.query(updateQuery, updateParams);

    // Log activity
    const action = target_stage_id ? 'stage_jumped' : 'stage_changed';

    let activityNotes = notes || (isCompleted ? `Moved to Warehouse (Completed)` : `Moved to ${nextStage.stage_name}`);

    if (checklist_data) {
      try {
        const dataInfo = typeof checklist_data === 'string' ? JSON.parse(checklist_data) : checklist_data;
        const items = [];
        // Handle various checklist formats (Diagnosis object or Software booleans)
        for (const [key, value] of Object.entries(dataInfo)) {
          // Skip if value is false/null, or if it's 'notes' field inside data
          if (value === true) {
            const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            items.push(label);
          } else if (typeof value === 'object' && value?.status === 'replaced') {
            // Handle diagnosis parts if structure is different? 
            // Usually diagnosis just saves to separate table, but if passed here...
            // For Software Checklist it is simple boolean.
          }
        }
        if (items.length > 0) {
          activityNotes += ` | Checklist: ${items.join(', ')}`;
        }
      } catch (e) {
        console.error('Error parsing checklist data for log', e);
      }
    }

    await pool.query(
      `INSERT INTO activities (ticket_id, stage_id, user_id, action, notes) 
       VALUES ($1, $2, $3, $4, $5)`,
      [id, nextStage.stage_id, req.user.user_id, action, activityNotes]
    );

    res.json({
      success: true,
      message: successMessage,
      ticket: updateResult.rows[0],
      completed: isCompleted
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error moving ticket to next stage'
    });
  }
};

// Assign Ticket to User or Team
exports.assignTicket = async (req, res) => {
  const { id } = req.params;
  const { user_id, team_id } = req.body;

  try {
    let updateQuery = 'UPDATE tickets SET ';
    const params = [];
    let paramCount = 1;
    let logMessage = '';

    if (user_id) {
      updateQuery += `assigned_user_id = $${paramCount}, `;
      params.push(user_id);
      paramCount++;
      logMessage += `Assigned to user ID: ${user_id}. `;
    } else if (user_id === null) {
      updateQuery += `assigned_user_id = NULL, `;
      logMessage += `Unassigned user. `;
    }

    if (team_id) {
      updateQuery += `assigned_team_id = $${paramCount}, `;
      params.push(team_id);
      paramCount++;
      logMessage += `Assigned to team ID: ${team_id}. `;
    }

    // Remove trailing comma and space
    updateQuery = updateQuery.slice(0, -2);

    // Auto-update Stage logic
    if (user_id) {
      // Fetch user's team
      const userRes = await pool.query('SELECT team_id FROM users WHERE user_id = $1', [user_id]);
      if (userRes.rows.length > 0) {
        const targetTeamId = userRes.rows[0].team_id;

        // Find stage for this team
        // If multiple, pick the first one by order
        const stageRes = await pool.query(
          'SELECT stage_id FROM stages WHERE team_id = $1 ORDER BY stage_order ASC LIMIT 1',
          [targetTeamId]
        );

        if (stageRes.rows.length > 0) {
          const targetStageId = stageRes.rows[0].stage_id;
          updateQuery += `, current_stage_id = ${targetStageId}, assigned_team_id = ${targetTeamId}`;
          logMessage += `Moved to stage ID: ${targetStageId}. `;
        }
      }
    }

    updateQuery += `, status = 'in_progress', completed_at = NULL WHERE ticket_id = $${paramCount} RETURNING *`;
    params.push(id);

    const result = await pool.query(updateQuery, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Log activity
    await pool.query(
      `INSERT INTO activities (ticket_id, user_id, action, notes) 
       VALUES ($1, $2, $3, $4)`,
      [id, req.user.user_id, 'assigned', logMessage.trim()]
    );

    const updatedTicket = result.rows[0];

    // Inventory Sync Logic: If ticket was completed (or we are resetting to in_progress), ensure Inventory is "Floor"
    if (updatedTicket.status === 'in_progress') {
      await pool.query(
        `UPDATE inventory SET status = 'Floor', stock_type = 'Cooling Period' WHERE serial_number = $1`,
        [updatedTicket.serial_number]
      );
    }

    // Sync Inventory Stage Name
    if (updatedTicket.current_stage_id) {
      // We need stage name. 
      const stageNameRes = await pool.query('SELECT stage_name FROM stages WHERE stage_id = $1', [updatedTicket.current_stage_id]);
      if (stageNameRes.rows.length > 0) {
        await pool.query(
          `UPDATE inventory SET stage = $1 WHERE serial_number = $2`,
          [stageNameRes.rows[0].stage_name, updatedTicket.serial_number]
        );
      }
    }

    res.json({
      success: true,
      message: 'Ticket assigned successfully',
      ticket: updatedTicket
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error assigning ticket'
    });
  }
};

// Claim Ticket (Self-Assign for Team Members)
exports.claimTicket = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.user_id;
  const userTeamIds = req.user.team_ids && req.user.team_ids.length > 0
    ? req.user.team_ids
    : (req.user.team_id != null ? [req.user.team_id] : []);

  try {
    const ticketCheck = await pool.query(
      `SELECT * FROM tickets WHERE ticket_id = $1`,
      [id]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const ticket = ticketCheck.rows[0];

    const ticketTeamId = parseInt(ticket.assigned_team_id, 10);
    const canClaim = req.user.role === 'admin' || req.user.role === 'floor_manager'
      || (userTeamIds.length > 0 && userTeamIds.includes(ticketTeamId));

    if (!canClaim) {
      return res.status(403).json({ success: false, message: 'Ticket is not assigned to your team' });
    }

    if (ticket.assigned_user_id) {
      return res.status(400).json({ success: false, message: 'Ticket is already assigned to a user' });
    }

    // Proceed to claim
    const result = await pool.query(
      `UPDATE tickets 
       SET assigned_user_id = $1
       WHERE ticket_id = $2
       RETURNING *`,
      [userId, id]
    );

    // Get updated details including team name for frontend consistency
    const updatedTicket = await pool.query(
      `SELECT t.*, s.stage_name, tm.team_name, u.name as assigned_user_name
         FROM tickets t
         LEFT JOIN stages s ON t.current_stage_id = s.stage_id
         LEFT JOIN teams tm ON t.assigned_team_id = tm.team_id
         LEFT JOIN users u ON t.assigned_user_id = u.user_id
         WHERE t.ticket_id = $1`,
      [id]
    );

    // Log activity
    await pool.query(
      `INSERT INTO activities (ticket_id, user_id, action, notes) 
       VALUES ($1, $2, $3, $4)`,
      [id, userId, 'claimed', 'Ticket claimed by user']
    );

    res.json({
      success: true,
      message: 'Ticket claimed successfully',
      ticket: updatedTicket.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error claiming ticket'
    });
  }
};

// Update Ticket Grade (for Grading Team)
exports.updateGrade = async (req, res) => {
  const { id } = req.params;
  const { grade } = req.body;

  if (!['A', 'A+', 'A-', 'B+', 'B-', 'C', 'D'].includes(grade)) {
    return res.status(400).json({ success: false, message: 'Invalid grade value' });
  }

  try {
    const ticketResult = await pool.query('SELECT * FROM tickets WHERE ticket_id = $1', [id]);
    if (ticketResult.rows.length === 0) return res.status(404).json({ success: false, message: 'Ticket not found' });

    const ticket = ticketResult.rows[0];

    const userTeamIds = req.user.team_ids || (req.user.team_id != null ? [req.user.team_id] : []);
    const isGradingTeam = userTeamIds.includes(9);
    if (!isGradingTeam && req.user.role !== 'admin' && req.user.role !== 'floor_manager') {
      return res.status(403).json({ success: false, message: 'Only Grading Team can update grades' });
    }

    // Update Ticket Grade
    await pool.query('UPDATE tickets SET final_grade = $1 WHERE ticket_id = $2', [grade, id]);

    // Update Inventory Grade
    await pool.query('UPDATE inventory SET grade = $1 WHERE serial_number = $2', [grade, ticket.serial_number]);

    // Log Activity
    await pool.query(
      `INSERT INTO activities (ticket_id, user_id, action, notes) 
             VALUES ($1, $2, $3, $4)`,
      [id, req.user.user_id, 'graded', `Grade updated to ${grade}`]
    );

    res.json({ success: true, message: `Grade updated to ${grade}`, grade });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error updating grade' });
  }
};

// Add Note/Comment
exports.addNote = async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;

  try {
    const ticketResult = await pool.query(
      'SELECT current_stage_id FROM tickets WHERE ticket_id = $1',
      [id]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    await pool.query(
      `INSERT INTO activities (ticket_id, stage_id, user_id, action, notes) 
       VALUES ($1, $2, $3, $4, $5)`,
      [id, ticketResult.rows[0].current_stage_id, req.user.user_id, 'note_added', notes]
    );

    res.json({
      success: true,
      message: 'Note added successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error adding note'
    });
  }
};

// Add Part to Ticket
exports.addPartToTicket = async (req, res) => {
  const { id } = req.params;
  const { part_id, quantity_used, notes } = req.body;

  try {
    await pool.query(
      `INSERT INTO ticket_parts (ticket_id, part_id, quantity_used, notes)
       VALUES ($1, $2, $3, $4)`,
      [id, part_id, quantity_used, notes]
    );

    // Update parts inventory
    await pool.query(
      `UPDATE parts SET quantity = quantity - $1 WHERE part_id = $2`,
      [quantity_used, part_id]
    );

    // Log activity
    await pool.query(
      `INSERT INTO activities (ticket_id, user_id, action, notes) 
       VALUES ($1, $2, $3, $4)`,
      [id, req.user.user_id, 'part_added', `Added ${quantity_used} unit(s) of part ID: ${part_id}`]
    );

    res.json({
      success: true,
      message: 'Part added to ticket successfully'
    });
  } catch (error) {
    console.error('Add part error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error adding part to ticket'
    });
  }
};

// Request Part (Diagnosis Team)
exports.requestPart = async (req, res) => {
  const { id } = req.params;
  const { part_name, description } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO part_requests (ticket_id, requested_by, part_name, description)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, req.user.user_id, part_name, description]
    );

    // Log activity
    await pool.query(
      `INSERT INTO activities (ticket_id, user_id, action, notes)
       VALUES ($1, $2, 'part_requested', $3)`,
      [id, req.user.user_id, `Requested part: ${part_name}`]
    );

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Request part error:', error);
    res.status(500).json({ success: false, message: 'Server error requesting part' });
  }
};

// Fulfill Part Request (Procurement Team)
exports.fulfillPartRequest = async (req, res) => {
  const { id } = req.params;
  const { request_id, part_id, quantity, notes } = req.body;

  try {
    const ticketStageRes = await pool.query(
      `SELECT s.stage_name
       FROM tickets t
       LEFT JOIN stages s ON t.current_stage_id = s.stage_id
       WHERE t.ticket_id = $1`,
      [id]
    );
    const stageName = ticketStageRes.rows[0]?.stage_name || '';

    // 1. Update request status
    if (request_id) {
      await pool.query(
        "UPDATE part_requests SET status = 'procured' WHERE request_id = $1",
        [request_id]
      );
    }

    // 2. Link part to ticket (skip for Chip Level Repair; L3 team will attach)
    if (stageName !== 'Chip Level Repair') {
      await pool.query(
        `INSERT INTO ticket_parts (ticket_id, part_id, quantity_used, notes)
         VALUES ($1, $2, $3, $4)`,
        [id, part_id, quantity || 1, notes]
      );

      const partRes = await pool.query("SELECT part_name FROM parts WHERE part_id = $1", [part_id]);
      const partName = partRes.rows[0]?.part_name || 'Unknown Part';

      await pool.query(
        `INSERT INTO activities (ticket_id, user_id, action, notes)
         VALUES ($1, $2, 'part_added', $3)`,
        [id, req.user.user_id, `Added part: ${partName}`]
      );
    } else {
      await pool.query(
        `INSERT INTO activities (ticket_id, user_id, action, notes)
         VALUES ($1, $2, 'part_procured', $3)`,
        [id, req.user.user_id, 'Procurement marked part as procured for chip-level repair']
      );
    }

    res.json({
      success: true,
      data: null
    });
  } catch (error) {
    console.error('Fulfill part error:', error);
    res.status(500).json({ success: false, message: 'Server error fulfilling part' });
  }
};

// Add Service Cost (Vendor/Service Teams)
exports.addServiceCost = async (req, res) => {
  const { id } = req.params;
  const { service_type, cost } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO ticket_services (ticket_id, service_type, cost, added_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, service_type, cost, req.user.user_id]
    );

    // Log activity
    await pool.query(
      `INSERT INTO activities (ticket_id, user_id, action, notes)
       VALUES ($1, $2, 'service_cost_added', $3)`,
      [id, req.user.user_id, `Added service cost: ${service_type} ($${cost})`]
    );

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Add service cost error:', error);
    res.status(500).json({ success: false, message: 'Server error adding service cost' });
  }
};

// Update Grade (Grading Team)
exports.updateGrade = async (req, res) => {
  const { id } = req.params;
  const { grade } = req.body;

  try {
    // Update Ticket
    const result = await pool.query(
      `UPDATE tickets SET final_grade = $1 WHERE ticket_id = $2 RETURNING *`,
      [grade, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ message: 'Ticket not found' });

    const ticket = result.rows[0];

    // Update Inventory
    // Assuming we match by serial_number
    await pool.query(
      `UPDATE inventory SET grade = $1 WHERE serial_number = $2`,
      [grade, ticket.serial_number]
    );

    // Log Activity
    await pool.query(
      `INSERT INTO activities (ticket_id, user_id, action, notes)
       VALUES ($1, $2, 'grade_updated', $3)`,
      [id, req.user.user_id, `Updated grade to: ${grade}`]
    );

    res.json({
      success: true,
      message: 'Grade updated',
      ticket: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error updating grade' });
  }
};

// Start Work Timer
exports.startWork = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.user_id;

  try {
    // Check if valid ticket
    const ticketRes = await pool.query('SELECT current_stage_id FROM tickets WHERE ticket_id = $1', [id]);
    if (ticketRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Ticket not found' });
    const stageId = ticketRes.rows[0].current_stage_id;

    // Check if already active
    const activeRes = await pool.query(
      'SELECT log_id FROM work_logs WHERE ticket_id = $1 AND user_id = $2 AND end_time IS NULL',
      [id, userId]
    );

    if (activeRes.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Work already started for this ticket' });
    }

    // Insert Log
    await pool.query(
      `INSERT INTO work_logs (ticket_id, user_id, stage_id) VALUES ($1, $2, $3)`,
      [id, userId, stageId]
    );

    // Log Activity
    await pool.query(
      `INSERT INTO activities (ticket_id, user_id, action, notes) VALUES ($1, $2, 'work_started', 'Started work timer')`,
      [id, userId]
    );

    res.json({ success: true, message: 'Work timer started' });
  } catch (error) {
    console.error('Start work error:', error);
    res.status(500).json({ success: false, message: 'Server error starting work' });
  }
};

// End Work Timer
exports.endWork = async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;
  const userId = req.user.user_id;

  if (!notes) return res.status(400).json({ success: false, message: 'Notes are mandatory to end work' });

  try {
    // Find active log
    const activeRes = await pool.query(
      'SELECT log_id FROM work_logs WHERE ticket_id = $1 AND user_id = $2 AND end_time IS NULL',
      [id, userId]
    );

    if (activeRes.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'No active work timer found' });
    }

    const logId = activeRes.rows[0].log_id;

    // Update Log
    await pool.query(
      `UPDATE work_logs SET end_time = CURRENT_TIMESTAMP, notes = $1 WHERE log_id = $2`,
      [notes, logId]
    );

    // Log Activity
    await pool.query(
      `INSERT INTO activities (ticket_id, user_id, action, notes) VALUES ($1, $2, 'work_ended', $3)`,
      [id, userId, `Ended work: ${notes}`]
    );

    // Auto-Move to Next Stage logic is handled by Frontend calling next-stage?
    // User said: "He has to scan the laptop again and then Timer will stop and Ticket moved to next Step."
    // Ideally, we move it here or return success so frontend calls move.
    // Let's return success and let frontend chain the call to be safe (or we can call moveToNextStage logic internally).
    // Calling internal logic is complex due to req/res structure.

    // We will return a flag 'ready_for_next_stage: true'

    res.json({ success: true, message: 'Work timer stopped', ready_for_next_stage: true });
  } catch (error) {
    console.error('End work error:', error);
    res.status(500).json({ success: false, message: 'Server error ending work' });
  }
};

// Get Active Work Log
exports.getActiveWorkLog = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.user_id;

  try {
    const result = await pool.query(
      `SELECT *, (EXTRACT(EPOCH FROM start_time) * 1000) as start_time_epoch FROM work_logs WHERE ticket_id = $1 AND user_id = $2 AND end_time IS NULL`,
      [id, userId]
    );

    if (result.rows.length > 0) {
      // Calculate duration logic if needed, but client can do it based on start_time
      res.json({ success: true, active: true, log: result.rows[0] });
    } else {
      res.json({ success: true, active: false });
    }
  } catch (error) {
    console.error('Get active log error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching active log' });
  }
};

// Bulk Move Tickets
exports.bulkMoveTickets = async (req, res) => {
  const { current_stage_id, target_stage_id } = req.body;
  const userId = req.user.user_id;

  if (!current_stage_id || !target_stage_id) {
    return res.status(400).json({ success: false, message: 'Current and Target Stage IDs are required' });
  }

  try {
    // 1. Get Target Stage Details (to get team_id)
    const targetStageRes = await pool.query('SELECT * FROM stages WHERE stage_id = $1', [target_stage_id]);
    if (targetStageRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Target stage not found' });
    }
    const targetStage = targetStageRes.rows[0];

    // 2. Get Tickets in Current Stage
    // Optional: Filter by specific team if needed, but "bulk move stage" usually implies all in that stage.
    // We should probably respect RBAC (only admin/manager/floor manager).
    // Assuming route protection handles RBAC.

    const ticketsRes = await pool.query('SELECT ticket_id, serial_number FROM tickets WHERE current_stage_id = $1', [current_stage_id]);
    const tickets = ticketsRes.rows;

    if (tickets.length === 0) {
      return res.status(400).json({ success: false, message: 'No tickets found in the selected stage' });
    }

    // 3. Perform Bulk Update
    // We update: stage, team (to target stage's team), unassign user, reset status to in_progress
    const updateRes = await pool.query(
      `UPDATE tickets 
       SET current_stage_id = $1, 
           assigned_team_id = $2, 
           assigned_user_id = NULL,
           status = 'in_progress',
           updated_at = CURRENT_TIMESTAMP
       WHERE current_stage_id = $3
       RETURNING ticket_id`,
      [targetStage.stage_id, targetStage.team_id, current_stage_id]
    );

    // 4. Log Activities & Sync Inventory (Iterate helps with granular logging, or we can do bulk insert if performance is key. 
    // For < 1000 items, iteration is fine and safer for logic).

    // We'll calculate success count based on updateRes
    const movedCount = updateRes.rowCount;

    // Async logging (fire and forget to speed up response?) 
    // OR just log a single "Bulk Move" activity if possible? 
    // The requirement says "He want to assign all ticket...". 
    // Detailed logs per ticket are better for audit.

    const activityQuery = `
      INSERT INTO activities (ticket_id, stage_id, user_id, action, notes)
      VALUES ($1, $2, $3, 'bulk_move', $4)
    `;

    const inventoryQuery = `
      UPDATE inventory SET stage = $1 WHERE serial_number = $2
    `;

    // Process logs and inventory sync in parallel promises
    const promises = tickets.map(t => {
      return Promise.all([
        pool.query(activityQuery, [t.ticket_id, targetStage.stage_id, userId, `Bulk moved to ${targetStage.stage_name}`]),
        pool.query(inventoryQuery, [targetStage.stage_name, t.serial_number])
      ]);
    });

    await Promise.all(promises);

    res.json({
      success: true,
      message: `Successfully moved ${movedCount} tickets to ${targetStage.stage_name}`,
      count: movedCount
    });

  } catch (error) {
    console.error('Bulk move error:', error);
    res.status(500).json({ success: false, message: 'Server error performing bulk move' });
  }
};