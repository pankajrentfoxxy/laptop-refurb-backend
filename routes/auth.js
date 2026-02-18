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
  updateUserPermissions,
  deleteUser
} = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Private (manager/admin/superadmin enforced in controller)
router.post('/register', authMiddleware, register);

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
