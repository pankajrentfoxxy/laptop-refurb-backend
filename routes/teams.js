const express = require('express');
const router = express.Router();
const { getAllTeams, getTeamMembers } = require('../controllers/teamController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// @route   GET /api/teams
// @desc    Get all teams
// @access  Private
router.get('/', getAllTeams);

// @route   GET /api/teams/:id/members
// @desc    Get team members
// @access  Private
router.get('/:id/members', getTeamMembers);

module.exports = router;
