/**
 * Auto-assign config for new and unassigned leads.
 * When manager selects sales users and clicks "Auto Assign Unassigned",
 * we save the config. All new leads (manual, upload, email) and unassigned
 * leads get assigned to these users in round-robin.
 */
const pool = require('../config/db');

/**
 * Get the next user_id for auto-assignment (round-robin).
 * Returns null if no config or empty user_ids.
 */
async function getNextAutoAssignee() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(
      `SELECT id, user_ids, round_robin_index FROM lead_auto_assign_config ORDER BY id LIMIT 1 FOR UPDATE`
    );
    if (!res.rows.length || !res.rows[0].user_ids?.length) {
      await client.query('ROLLBACK');
      return null;
    }

    const { id, user_ids, round_robin_index } = res.rows[0];
    const idx = round_robin_index % user_ids.length;
    const nextUserId = user_ids[idx];

    await client.query(
      `UPDATE lead_auto_assign_config SET round_robin_index = $1 WHERE id = $2`,
      [round_robin_index + 1, id]
    );
    await client.query('COMMIT');
    return nextUserId;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Update the auto-assign config. Called when manager clicks "Auto Assign Unassigned".
 * @param {number[]} userIds - Array of sales user IDs (round-robin order)
 * @param {number} updatedBy - user_id of manager who updated
 */
async function updateAutoAssignConfig(userIds, updatedBy) {
  if (!Array.isArray(userIds) || userIds.length === 0) return;

  const validIds = userIds.map((id) => parseInt(id, 10)).filter(Number.isFinite);
  if (!validIds.length) return;

  const client = await pool.connect();
  try {
    const res = await client.query(`SELECT id FROM lead_auto_assign_config LIMIT 1`);
    if (res.rows.length) {
      await client.query(
        `UPDATE lead_auto_assign_config SET user_ids = $1, round_robin_index = 0, updated_at = CURRENT_TIMESTAMP, updated_by = $2 WHERE id = $3`,
        [validIds, updatedBy, res.rows[0].id]
      );
    } else {
      await client.query(
        `INSERT INTO lead_auto_assign_config (user_ids, round_robin_index, updated_by) VALUES ($1, 0, $2)`,
        [validIds, updatedBy]
      );
    }
  } finally {
    client.release();
  }
}

/**
 * Get current auto-assign config (for display in UI).
 */
async function getAutoAssignConfig() {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT user_ids, updated_at, updated_by FROM lead_auto_assign_config ORDER BY id LIMIT 1`
    );
    if (!res.rows.length || !res.rows[0].user_ids?.length) return { userIds: [], updatedAt: null, updatedBy: null };
    return {
      userIds: res.rows[0].user_ids,
      updatedAt: res.rows[0].updated_at,
      updatedBy: res.rows[0].updated_by
    };
  } finally {
    client.release();
  }
}

module.exports = { getNextAutoAssignee, updateAutoAssignConfig, getAutoAssignConfig };
