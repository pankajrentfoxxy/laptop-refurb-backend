const pool = require('../config/db');

const normalizeArray = (value) => {
  if (!Array.isArray(value)) return [];
  return value.filter(Boolean);
};

exports.getChipRepair = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM chip_level_repairs WHERE ticket_id = $1`,
      [id]
    );

    res.json({
      success: true,
      repair: result.rows[0] || null
    });
  } catch (error) {
    console.error('Get chip repair error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching chip repair' });
  }
};

exports.saveChipRepair = async (req, res) => {
  const { id } = req.params;
  const {
    issues,
    issue_notes,
    parts_required,
    parts_notes,
    resolved_checks,
    status
  } = req.body;

  const safeIssues = normalizeArray(issues);
  const safeResolved = normalizeArray(resolved_checks);
  const safeStatus = status || (parts_required ? 'waiting_parts' : 'in_progress');

  try {
    const existing = await pool.query(
      `SELECT repair_id FROM chip_level_repairs WHERE ticket_id = $1`,
      [id]
    );

    if (existing.rows.length > 0) {
      const result = await pool.query(
        `UPDATE chip_level_repairs
         SET issues = $1,
             issue_notes = $2,
             parts_required = $3,
             parts_notes = $4,
             resolved_checks = $5,
             status = $6,
             updated_by = $7,
             updated_at = CURRENT_TIMESTAMP
         WHERE ticket_id = $8
         RETURNING *`,
        [safeIssues, issue_notes, parts_required, parts_notes, safeResolved, safeStatus, req.user.user_id, id]
      );
      return res.json({ success: true, repair: result.rows[0] });
    }

    const insert = await pool.query(
      `INSERT INTO chip_level_repairs
       (ticket_id, created_by, updated_by, status, issues, issue_notes, parts_required, parts_notes, resolved_checks)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [id, req.user.user_id, req.user.user_id, safeStatus, safeIssues, issue_notes, parts_required, parts_notes, safeResolved]
    );

    res.json({ success: true, repair: insert.rows[0] });
  } catch (error) {
    console.error('Save chip repair error:', error);
    res.status(500).json({ success: false, message: 'Server error saving chip repair' });
  }
};

exports.submitChipRepair = async (req, res) => {
  const { id } = req.params;
  const {
    issues,
    issue_notes,
    parts_required,
    parts_notes,
    resolved_checks
  } = req.body;

  const safeIssues = normalizeArray(issues);
  const safeResolved = normalizeArray(resolved_checks);

  try {
    const stageRes = await pool.query(
      `SELECT stage_id, team_id FROM stages WHERE stage_name ILIKE 'Diagnosis' LIMIT 1`
    );

    if (stageRes.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Diagnosis stage not configured' });
    }

    const diagnosisStage = stageRes.rows[0];

    await pool.query(
      `INSERT INTO chip_level_repairs
       (ticket_id, created_by, updated_by, status, issues, issue_notes, parts_required, parts_notes, resolved_checks)
       VALUES ($1, $2, $3, 'completed', $4, $5, $6, $7, $8)
       ON CONFLICT (ticket_id) DO UPDATE
       SET status = 'completed',
           issues = EXCLUDED.issues,
           issue_notes = EXCLUDED.issue_notes,
           parts_required = EXCLUDED.parts_required,
           parts_notes = EXCLUDED.parts_notes,
           resolved_checks = EXCLUDED.resolved_checks,
           updated_by = EXCLUDED.updated_by,
           updated_at = CURRENT_TIMESTAMP`,
      [id, req.user.user_id, req.user.user_id, safeIssues, issue_notes, parts_required, parts_notes, safeResolved]
    );

    await pool.query(
      `UPDATE tickets
       SET current_stage_id = $1, assigned_team_id = $2, assigned_user_id = NULL
       WHERE ticket_id = $3`,
      [diagnosisStage.stage_id, diagnosisStage.team_id, id]
    );

    await pool.query(
      `INSERT INTO activities (ticket_id, stage_id, user_id, action, notes)
       VALUES ($1, $2, $3, 'chip_level_completed', $4)`,
      [id, diagnosisStage.stage_id, req.user.user_id, 'Chip level repair completed. Returned to Diagnosis.']
    );

    res.json({ success: true, message: 'Chip level repair completed' });
  } catch (error) {
    console.error('Submit chip repair error:', error);
    res.status(500).json({ success: false, message: 'Server error submitting chip repair' });
  }
};
