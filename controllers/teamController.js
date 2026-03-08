const pool = require('../config/db');

// Get All Teams (optionally for ticket assignment: ordered by stage, excludes QC/Dispatch/Procurement)
exports.getAllTeams = async (req, res) => {
  const forAssignment = req.query.for_assignment === '1' || req.query.for_assignment === 'true';

  try {
    let orderClause;
    let whereClause = '';

    if (forAssignment) {
      // Order by stage_order (same as ticket workflow), exclude QC, Dispatch, Procurement
      whereClause = ` WHERE t.team_name NOT ILIKE 'QC%' AND t.team_name NOT ILIKE 'Dispatch%' AND t.team_name NOT ILIKE 'Procurement%'`;
      orderClause = ` ORDER BY (
        SELECT MIN(s.stage_order) FROM stages s WHERE s.team_id = t.team_id
      ) ASC NULLS LAST, t.team_name ASC`;
    } else {
      orderClause = ` ORDER BY 
       CASE 
         WHEN t.team_name = 'Floor Entry' THEN 1
         WHEN t.team_name LIKE 'Cleaning%' THEN 2
         WHEN t.team_name LIKE 'Diagnosis%' THEN 3
         WHEN t.team_name LIKE 'Chip Level%' THEN 4
         WHEN t.team_name LIKE 'Repair%' THEN 5
         WHEN t.team_name LIKE 'Body%' THEN 6
         WHEN t.team_name LIKE 'Assembly%' THEN 7
         WHEN t.team_name LIKE 'QC%' THEN 8
         WHEN t.team_name LIKE 'Warehouse%' THEN 9
         WHEN t.team_name = 'Admin' THEN 10
         ELSE 11
       END ASC, t.team_name ASC`;
    }

    const result = await pool.query(
      `SELECT t.*, u.name as manager_name,
              (SELECT COUNT(*) FROM users WHERE team_id = t.team_id AND active = true) as member_count
       FROM teams t
       LEFT JOIN users u ON t.manager_id = u.user_id
       ${whereClause}
       ${orderClause}`
    );

    res.json({
      success: true,
      count: result.rows.length,
      teams: result.rows
    });
  } catch (error) {
    console.error('Get teams error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching teams'
    });
  }
};

// Get Team Members (includes users with team_id OR user_teams for multi-team support)
exports.getTeamMembers = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT DISTINCT u.user_id, u.name, u.email, u.role, u.active, u.created_at
       FROM users u
       LEFT JOIN user_teams ut ON u.user_id = ut.user_id AND ut.team_id = $1
       WHERE (u.team_id = $1 OR ut.team_id = $1) AND u.active = true
       ORDER BY u.name ASC`,
      [id]
    );

    res.json({
      success: true,
      count: result.rows.length,
      members: result.rows
    });
  } catch (error) {
    console.error('Get team members error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching team members'
    });
  }
};
