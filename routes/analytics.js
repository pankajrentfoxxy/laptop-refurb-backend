const express = require('express');
const router = express.Router();
const { getDashboardStats, getTeamPerformance } = require('../controllers/analyticsController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// @route   GET /api/analytics/dashboard
// @desc    Get dashboard statistics
// @access  Private
router.get('/dashboard', getDashboardStats);

// @route   GET /api/analytics/team-performance
// @desc    Get team performance metrics
// @access  Private
router.get('/team-performance', getTeamPerformance);

module.exports = router;
