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
  const { name, email, password, role, team_id, mobile_no } = req.body;

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
    let resolvedTeamId = team_id && team_id !== 'null' && team_id !== '' ? parseInt(team_id) : null;
    if (normalizedRole === 'procurement') {
      permissions = ['procurement_access'];
      resolvedTeamId = null; // Standalone role like Sales
    } else if (normalizedRole === 'qc') {
      permissions = ['qc_access'];
      resolvedTeamId = null; // Standalone role like Sales
    } else if (normalizedRole === 'dispatch') {
      permissions = ['dispatch_access'];
      resolvedTeamId = null; // Standalone role like Sales
    }

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

    // Create user
    const safeTeamId = resolvedTeamId;
    const finalPermissions = permissions;

    const mobileNo = mobile_no ? String(mobile_no).trim() : null;
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, team_id, active, permissions, mobile_no) 
       VALUES ($1, $2, $3, $4, $5, true, $6, $7) 
       RETURNING user_id, name, email, role, team_id, mobile_no, created_at`,
      [name, email, password_hash, normalizedRole, safeTeamId, finalPermissions, mobileNo || null]
    );

    const user = result.rows[0];

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
};

// Login User
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Check if user exists
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
    // Verify password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        user_id: user.user_id,
        email: user.email,
        role: user.role,
        team_id: user.team_id,
        permissions: user.permissions || []
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Remove password from response
    delete user.password_hash;
    user.permissions = Array.isArray(user.permissions) ? user.permissions : [];

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

    // Generate JWT token
    const token = jwt.sign(
      {
        user_id: user.user_id,
        email: user.email,
        role: user.role,
        team_id: user.team_id,
        permissions: user.permissions || []
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    delete user.password_hash;

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
    res.json({ success: true, users: result.rows });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching users' });
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
