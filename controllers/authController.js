const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const MANAGEABLE_ROLES = ['team_member', 'team_lead', 'sales', 'floor_manager', 'procurement', 'qc', 'dispatch', 'manager', 'admin'];
const hasUserMgmtAccess = (user) => ['admin', 'manager'].includes(user?.role);
const canViewUsers = (user) => ['admin', 'manager', 'floor_manager'].includes(user?.role);
const canManageTargetUser = (actor, target) => {
  if (!actor || !target) return false;
  if (actor.role === 'admin') return true;
  if (actor.role === 'manager') return !['admin', 'manager'].includes(target.role);
  return false;
};

// Register User
exports.register = async (req, res) => {
  const { name, email, password, role, team_id, team_ids, mobile_no } = req.body;

  try {
    if (!hasUserMgmtAccess(req.user)) {
      return res.status(403).json({ success: false, message: 'Only manager/admin can create users' });
    }

    const normalizedRole = String(role || 'team_member').trim().toLowerCase();
    if (!MANAGEABLE_ROLES.includes(normalizedRole)) {
      return res.status(400).json({ success: false, message: 'Invalid role selected' });
    }

    if (req.user.role === 'manager' && ['manager', 'admin'].includes(normalizedRole)) {
      return res.status(403).json({ success: false, message: 'Manager can only create team users/sales/floor manager' });
    }

    // For procurement/qc/dispatch roles: auto-set permissions (standalone like Sales, no team)
    let permissions = [];
    let resolvedTeamIds = [];
    if (normalizedRole === 'procurement') {
      permissions = ['procurement_access'];
    } else if (normalizedRole === 'qc') {
      permissions = ['qc_access'];
    } else if (normalizedRole === 'dispatch') {
      permissions = ['dispatch_access'];
    } else {
      // team_member, team_lead, floor_manager: support multiple teams
      if (Array.isArray(team_ids) && team_ids.length > 0) {
        resolvedTeamIds = team_ids.map((id) => parseInt(id)).filter((id) => !isNaN(id) && id > 0);
      } else if (team_id && team_id !== 'null' && team_id !== '') {
        resolvedTeamIds = [parseInt(team_id)];
      }
    }
    const primaryTeamId = resolvedTeamIds[0] || null; // First team as primary for backward compat

    // Check if user exists
    const userExists = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const mobileNo = mobile_no ? String(mobile_no).trim() : null;
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, team_id, active, permissions, mobile_no) 
       VALUES ($1, $2, $3, $4, $5, true, $6, $7) 
       RETURNING user_id, name, email, role, team_id, mobile_no, created_at`,
      [name, email, password_hash, normalizedRole, primaryTeamId, permissions, mobileNo || null]
    );

    const user = result.rows[0];

    // Insert user_teams for multi-team support
    if (resolvedTeamIds.length > 0) {
      for (const tid of resolvedTeamIds) {
        await pool.query(
          'INSERT INTO user_teams (user_id, team_id) VALUES ($1, $2) ON CONFLICT (user_id, team_id) DO NOTHING',
          [user.user_id, tid]
        );
      }
    }

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: { ...user, team_ids: resolvedTeamIds }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
};

// Helper: get user's team_ids (from user_teams, fallback to team_id)
const getUserTeamIds = async (userId, fallbackTeamId) => {
  try {
    const utRes = await pool.query(
      'SELECT team_id FROM user_teams WHERE user_id = $1 ORDER BY team_id',
      [userId]
    );
    if (utRes.rows.length > 0) {
      return utRes.rows.map((r) => r.team_id);
    }
  } catch (e) {
    // user_teams table may not exist before migration
  }
  return fallbackTeamId != null ? [fallbackTeamId] : [];
};

// Login User
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query(
      `SELECT u.*, t.team_name 
       FROM users u 
       LEFT JOIN teams t ON u.team_id = t.team_id 
       WHERE u.email = $1 AND u.active = true`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const teamIds = await getUserTeamIds(user.user_id, user.team_id);

    const token = jwt.sign(
      {
        user_id: user.user_id,
        email: user.email,
        role: user.role,
        team_id: user.team_id,
        team_ids: teamIds,
        permissions: user.permissions || []
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    delete user.password_hash;
    user.permissions = Array.isArray(user.permissions) ? user.permissions : [];
    user.team_ids = teamIds;

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
};

// Get Current User
exports.getCurrentUser = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.user_id, u.name, u.email, u.mobile_no, u.role, u.team_id, u.active, u.created_at, u.permissions, t.team_name
       FROM users u
       LEFT JOIN teams t ON u.team_id = t.team_id
       WHERE u.user_id = $1`,
      [req.user.user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = result.rows[0];
    user.permissions = Array.isArray(user.permissions) ? user.permissions : [];
    user.team_ids = req.user.team_ids || await getUserTeamIds(user.user_id, user.team_id);
    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Login with Barcode
exports.loginBarcode = async (req, res) => {
  const { barcode } = req.body;

  if (!barcode) return res.status(400).json({ success: false, message: 'Barcode is required' });

  try {
    const result = await pool.query(
      `SELECT u.*, t.team_name 
       FROM users u 
       LEFT JOIN teams t ON u.team_id = t.team_id 
       WHERE u.barcode = $1 AND u.active = true`,
      [barcode]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid barcode or inactive user' });
    }

    const user = result.rows[0];
    const teamIds = await getUserTeamIds(user.user_id, user.team_id);

    const token = jwt.sign(
      {
        user_id: user.user_id,
        email: user.email,
        role: user.role,
        team_id: user.team_id,
        team_ids: teamIds,
        permissions: user.permissions || []
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    delete user.password_hash;
    user.team_ids = teamIds;

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user
    });
  } catch (error) {
    console.error('Barcode login error:', error);
    res.status(500).json({ success: false, message: 'Server error during barcode login' });
  }
};

// Update Mobile (Admin/Manager)
exports.updateMobile = async (req, res) => {
  const { id } = req.params;
  const { mobile_no } = req.body;

  try {
    if (!hasUserMgmtAccess(req.user)) {
      return res.status(403).json({ success: false, message: 'Only manager/admin can update mobile' });
    }

    const targetResult = await pool.query(
      `SELECT user_id, role, email FROM users WHERE user_id = $1`,
      [id]
    );
    if (targetResult.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

    const target = targetResult.rows[0];
    if (!canManageTargetUser(req.user, target)) {
      return res.status(403).json({ success: false, message: 'You cannot modify this user' });
    }

    const mobileNo = mobile_no ? String(mobile_no).trim() : null;
    const result = await pool.query(
      `UPDATE users SET mobile_no = $1 WHERE user_id = $2 RETURNING user_id, name, mobile_no`,
      [mobileNo, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, message: 'Mobile updated', user: result.rows[0] });
  } catch (error) {
    console.error('Update mobile error:', error);
    res.status(500).json({ success: false, message: 'Server error updating mobile' });
  }
};

// Update Barcode (Admin/Manager)
exports.updateBarcode = async (req, res) => {
  const { id } = req.params;
  const { barcode } = req.body;

  try {
    if (!hasUserMgmtAccess(req.user)) {
      return res.status(403).json({ success: false, message: 'Only manager/admin can update barcode' });
    }

    const targetResult = await pool.query(
      `SELECT user_id, role, email FROM users WHERE user_id = $1`,
      [id]
    );
    if (targetResult.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

    const target = targetResult.rows[0];
    if (!canManageTargetUser(req.user, target)) {
      return res.status(403).json({ success: false, message: 'You cannot modify this user' });
    }

    const result = await pool.query(
      `UPDATE users SET barcode = $1 WHERE user_id = $2 RETURNING user_id, name, barcode`,
      [barcode, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, message: 'Barcode updated', user: result.rows[0] });
  } catch (error) {
    console.error('Update barcode error:', error);
    if (error.code === '23505') { // Unique constraint
      return res.status(400).json({ success: false, message: 'Barcode already in use' });
    }
    res.status(500).json({ success: false, message: 'Server error updating barcode' });
  }
};

// Get All Users (for Managers/Admins to assign tasks)
exports.getAllUsers = async (req, res) => {
  try {
    if (!canViewUsers(req.user)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const includeInactive = false;
    const activeClause = includeInactive ? '' : 'WHERE u.active = true';

    const result = await pool.query(
      `SELECT u.user_id, u.name, u.email, u.mobile_no, u.role, u.team_id, u.barcode, u.permissions, u.active, t.team_name 
             FROM users u
             LEFT JOIN teams t ON u.team_id = t.team_id
             ${activeClause}
             ORDER BY u.name ASC`
    );

    // Attach team_ids for each user
    for (const u of result.rows) {
      try {
        const utRes = await pool.query(
          'SELECT team_id FROM user_teams WHERE user_id = $1 ORDER BY team_id',
          [u.user_id]
        );
        u.team_ids = utRes.rows.length > 0
          ? utRes.rows.map((r) => r.team_id)
          : (u.team_id != null ? [u.team_id] : []);
      } catch (e) {
        u.team_ids = u.team_id != null ? [u.team_id] : [];
      }
    }

    res.json({ success: true, users: result.rows });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching users' });
  }
};

// Update User Teams (Admin/Manager) - multi-team assignment for team_member/team_lead
exports.updateUserTeams = async (req, res) => {
  const { id } = req.params;
  const { team_ids } = req.body;

  if (!Array.isArray(team_ids)) {
    return res.status(400).json({ success: false, message: 'team_ids must be an array' });
  }

  try {
    if (!hasUserMgmtAccess(req.user)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const targetResult = await pool.query(
      'SELECT user_id, role FROM users WHERE user_id = $1',
      [id]
    );
    if (targetResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const target = targetResult.rows[0];
    if (!canManageTargetUser(req.user, target)) {
      return res.status(403).json({ success: false, message: 'You cannot modify this user' });
    }

    const validTeamIds = team_ids.map((tid) => parseInt(tid)).filter((tid) => !isNaN(tid) && tid > 0);

    await pool.query('DELETE FROM user_teams WHERE user_id = $1', [id]);
    for (const tid of validTeamIds) {
      await pool.query(
        'INSERT INTO user_teams (user_id, team_id) VALUES ($1, $2) ON CONFLICT (user_id, team_id) DO NOTHING',
        [id, tid]
      );
    }

    const primaryTeamId = validTeamIds[0] || null;
    await pool.query('UPDATE users SET team_id = $1 WHERE user_id = $2', [primaryTeamId, id]);

    res.json({
      success: true,
      message: 'Team assignments updated',
      team_ids: validTeamIds
    });
  } catch (error) {
    console.error('Update user teams error:', error);
    res.status(500).json({ success: false, message: 'Server error updating teams' });
  }
};

// Update User Permissions (Admin/Manager)
exports.updateUserPermissions = async (req, res) => {
  const { id } = req.params;
  const { permissions } = req.body; // Expecting an array of strings

  if (!Array.isArray(permissions)) {
    return res.status(400).json({ success: false, message: 'Permissions must be an array' });
  }

  try {
    if (!hasUserMgmtAccess(req.user)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const targetResult = await pool.query(
      `SELECT user_id, role, email FROM users WHERE user_id = $1`,
      [id]
    );
    if (targetResult.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const target = targetResult.rows[0];

    if (!canManageTargetUser(req.user, target)) {
      return res.status(403).json({ success: false, message: 'You cannot update access for this user' });
    }

    const result = await pool.query(
      `UPDATE users SET permissions = $1 WHERE user_id = $2 RETURNING user_id, name, permissions`,
      [permissions, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, message: 'Permissions updated', user: result.rows[0] });
  } catch (error) {
    console.error('Update permissions error:', error);
    res.status(500).json({ success: false, message: 'Server error updating permissions' });
  }
};

// Soft Delete User (manager/admin with hierarchy checks)
exports.deleteUser = async (req, res) => {
  const { id } = req.params;
  try {
    if (!hasUserMgmtAccess(req.user)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const targetResult = await pool.query(
      `SELECT user_id, role, email, active FROM users WHERE user_id = $1`,
      [id]
    );
    if (targetResult.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const target = targetResult.rows[0];

    if (parseInt(target.user_id, 10) === parseInt(req.user.user_id, 10)) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
    }
    if (!canManageTargetUser(req.user, target)) {
      return res.status(403).json({ success: false, message: 'You cannot delete this user' });
    }

    await pool.query('DELETE FROM user_teams WHERE user_id = $1', [id]);
    await pool.query(
      `UPDATE users
       SET active = false,
           permissions = ARRAY[]::text[],
           team_id = NULL
       WHERE user_id = $1`,
      [id]
    );

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: 'Server error deleting user' });
  }
};
