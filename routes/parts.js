const express = require('express');
const router = express.Router();
const { getAllParts, createPart, updatePartQuantity, updatePart } = require('../controllers/partController');
const { getPartsGrouped } = require('../controllers/partsDropdownController');
const { authMiddleware, checkRole } = require('../middleware/auth');

router.use(authMiddleware);

// @route   GET /api/parts
// @desc    Get all parts
// @access  Private
router.get('/', getAllParts);

// @route   GET /api/parts/grouped
// @desc    Get parts grouped by category
router.get('/grouped', getPartsGrouped);

// @route   POST /api/parts
// @desc    Create a new part
// @access  Private (Manager, Admin)
router.post('/', checkRole('manager', 'admin', 'floor_manager'), createPart);

// @route   PUT /api/parts/:id
// @desc    Update part details
// @access  Private (Manager, Admin)
router.put('/:id', checkRole('manager', 'admin', 'floor_manager'), updatePart);

// @route   PUT /api/parts/:id/quantity
// @desc    Update part quantity
// @access  Private (Manager, Admin)
router.put('/:id/quantity', checkRole('manager', 'admin', 'floor_manager', 'team_lead'), updatePartQuantity);

module.exports = router;
