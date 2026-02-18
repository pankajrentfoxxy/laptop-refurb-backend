const express = require('express');
const router = express.Router();
const { getAllStages, getStageChecklist } = require('../controllers/stageController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// @route   GET /api/stages
// @desc    Get all stages
// @access  Private
router.get('/', getAllStages);

// @route   GET /api/stages/:id/checklist
// @desc    Get checklist for a stage
// @access  Private
router.get('/:id/checklist', getStageChecklist);

module.exports = router;
