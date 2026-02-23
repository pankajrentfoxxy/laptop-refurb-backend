const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { getRequests, updateRequestStatus, receiveItem, assignExistingInventory } = require('../controllers/procurementController');

const requireProcurementAccess = (req, res, next) => {
  if (
    req.user.role === 'admin' ||
    req.user.role === 'manager' ||
    req.user.role === 'procurement' ||
    (req.user.permissions && req.user.permissions.includes('procurement_access'))
  ) {
    return next();
  }
  res.status(403).json({ message: 'Access denied: Procurement access required' });
};

router.use(authMiddleware);

router.get('/', requireProcurementAccess, getRequests);
router.put('/:request_id', requireProcurementAccess, updateRequestStatus);
router.post('/receive', requireProcurementAccess, receiveItem);
router.post('/assign', requireProcurementAccess, assignExistingInventory);

module.exports = router;

