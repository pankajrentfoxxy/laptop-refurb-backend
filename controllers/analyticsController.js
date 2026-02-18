const pool = require('../config/db');

// Get Dashboard Statistics
exports.getDashboardStats = async (req, res) => {
  try {
    // Total tickets
    // Total Laptops on Floor (Active Tickets, not completed)
    const totalTickets = await pool.query("SELECT COUNT(*) as count FROM tickets WHERE status = 'in_progress'");

    // Tickets by status
    const ticketsByStatus = await pool.query(
      `SELECT status, COUNT(*) as count 
       FROM tickets 
       GROUP BY status`
    );

    // Tickets by stage
    const ticketsByStage = await pool.query(
      `SELECT s.stage_name, s.stage_order, COUNT(t.ticket_id) as count
       FROM stages s
       LEFT JOIN tickets t ON s.stage_id = t.current_stage_id
       GROUP BY s.stage_id, s.stage_name, s.stage_order
       ORDER BY s.stage_order ASC`
    );

    // Recent tickets
    const recentTickets = await pool.query(
      `SELECT t.ticket_id, t.serial_number, t.brand, t.model, t.status, 
              t.created_at, s.stage_name, u.name as assigned_to
       FROM tickets t
       LEFT JOIN stages s ON t.current_stage_id = s.stage_id
       LEFT JOIN users u ON t.assigned_user_id = u.user_id
       ORDER BY t.created_at DESC
       LIMIT 10`
    );

    // Active team members
    const activeUsers = await pool.query(
      'SELECT COUNT(*) as count FROM users WHERE active = true'
    );

    // Average completion time (for completed tickets) - In Hours
    const avgCompletionTime = await pool.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/3600) as avg_hours
       FROM tickets
       WHERE status = 'completed' AND completed_at IS NOT NULL`
    );

    // Tickets by priority
    const ticketsByPriority = await pool.query(
      `SELECT priority, COUNT(*) as count 
       FROM tickets 
       GROUP BY priority`
    );

    res.json({
      success: true,
      stats: {
        totalTickets: parseInt(totalTickets.rows[0].count),
        activeUsers: parseInt(activeUsers.rows[0].count),
        activeUsers: parseInt(activeUsers.rows[0].count),
        avgCompletionHours: avgCompletionTime.rows[0].avg_hours ?
          parseFloat(avgCompletionTime.rows[0].avg_hours).toFixed(1) : 0,
        ticketsByStatus: ticketsByStatus.rows,
        ticketsByStage: ticketsByStage.rows,
        ticketsByPriority: ticketsByPriority.rows,
        recentTickets: recentTickets.rows
      }
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching dashboard statistics'
    });
  }
};

// Get Team Performance
exports.getTeamPerformance = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.team_name,
              COUNT(CASE WHEN tk.status = 'in_progress' THEN 1 END) as active_tickets,
              COUNT(CASE WHEN tk.status = 'completed' THEN 1 END) as completed_tickets,
              COUNT(tk.ticket_id) as total_tickets
       FROM teams t
       LEFT JOIN tickets tk ON t.team_id = tk.assigned_team_id
       GROUP BY t.team_id, t.team_name
       ORDER BY total_tickets DESC`
    );

    res.json({
      success: true,
      teamPerformance: result.rows
    });
  } catch (error) {
    console.error('Get team performance error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching team performance'
    });
  }
};
