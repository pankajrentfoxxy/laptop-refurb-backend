const pool = require('../config/db');

// Get All Teams
exports.getAllTeams = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, u.name as manager_name,
              (SELECT COUNT(*) FROM users WHERE team_id = t.team_id AND active = true) as member_count
       FROM teams t
       LEFT JOIN users u ON t.manager_id = u.user_id
       ORDER BY 
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
       END ASC, t.team_name ASC`
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

// Get Team Members
exports.getTeamMembers = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT user_id, name, email, role, active, created_at
       FROM users
       WHERE team_id = $1 AND active = true
       ORDER BY name ASC`,
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
