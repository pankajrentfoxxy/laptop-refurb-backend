const pool = require('../config/db');

// Get All Stages
exports.getAllStages = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, t.team_name
       FROM stages s
       LEFT JOIN teams t ON s.team_id = t.team_id
       ORDER BY s.stage_order ASC`
    );

    res.json({
      success: true,
      count: result.rows.length,
      stages: result.rows
    });
  } catch (error) {
    console.error('Get stages error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error fetching stages' 
    });
  }
};

// Get Stage Checklist
exports.getStageChecklist = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM stage_checklists WHERE stage_id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        checklist: null
      });
    }

    res.json({
      success: true,
      checklist: result.rows[0]
    });
  } catch (error) {
    console.error('Get checklist error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error fetching checklist' 
    });
  }
};
