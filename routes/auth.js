const express = require('express');
const router = express.Router();
const {
  register,
  login,
  getCurrentUser,
  getAllUsers,
  loginBarcode,
  updateBarcode,
  updateMobile,
  updateUserTeams,
  updateUserPermissions,
  deleteUser
} = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Private (manager/admin/superadmin enforced in controller)
router.post('/register', authMiddleware, register);

// @route   GET /api/auth/debug
// @desc    Debug connection (remove in production)
// @access  Public
router.get('/debug', async (req, res) => {
  try {
    const pool = require('../config/db');
    await pool.query('SELECT 1');
    const hasJwt = !!process.env.JWT_SECRET;
    const userCount = await pool.query('SELECT COUNT(*) FROM public.users WHERE email = $1', ['admin@rentfoxxy.com']);
    res.json({
      db: 'ok',
      jwtSecret: hasJwt ? 'set' : 'MISSING',
      adminExists: parseInt(userCount.rows[0].count) > 0
    });
  } catch (err) {
    res.status(500).json({ db: 'fail', error: err.message });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', login);

// @route   GET /api/auth/me
// @desc    Get current logged in user
// @access  Private
router.get('/me', authMiddleware, getCurrentUser);

// @route   POST /api/auth/login-barcode
// @desc    Login with barcode
// @access  Public
router.post('/login-barcode', loginBarcode);

// @route   PUT /api/auth/users/:id/barcode
// @desc    Update user barcode
// @access  Private (Admin/Manager)
router.put('/users/:id/barcode', authMiddleware, updateBarcode);

// @route   PUT /api/auth/users/:id/mobile
// @desc    Update user mobile number
// @access  Private (Admin/Manager)
router.put('/users/:id/mobile', authMiddleware, updateMobile);

// @route   PUT /api/auth/users/:id/teams
// @desc    Update user team assignments (multi-team for team_member/team_lead)
// @access  Private (Admin/Manager)
router.put('/users/:id/teams', authMiddleware, updateUserTeams);

// @route   GET /api/auth/users
// @desc    Get all users (Manager/Admin)
// @access  Private
router.get('/users', authMiddleware, getAllUsers);

// @route   PUT /api/auth/users/:id/permissions
// @desc    Update user permissions
// @access  Private (Admin/Manager)
router.put('/users/:id/permissions', authMiddleware, updateUserPermissions);

// @route   DELETE /api/auth/users/:id
// @desc    Soft delete/deactivate user
// @access  Private (manager/admin/superadmin enforced in controller)
router.delete('/users/:id', authMiddleware, deleteUser);

module.exports = router;
