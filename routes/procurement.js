const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { getRequests, updateRequestStatus, receiveItem, assignExistingInventory } = require('../controllers/procurementController');

router.use(authMiddleware);

// Strict permissions can be added later, currently relying on Role checks in frontend or broad access
router.get('/', getRequests);
router.put('/:request_id', updateRequestStatus);
router.post('/receive', receiveItem);
router.post('/assign', assignExistingInventory); // Scan existing laptop to assign to order

module.exports = router;

