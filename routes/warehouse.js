const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { getWarehouseItems, markReady, replaceMachine } = require('../controllers/warehouseController');

const requireWarehouseAccess = (req, res, next) => {
    if (
        req.user.role === 'admin' ||
        req.user.role === 'manager' ||
        req.user.role === 'warehouse' ||
        (req.user.permissions && req.user.permissions.includes('warehouse_access'))
    ) {
        return next();
    }
    res.status(403).json({ message: 'Access denied: Warehouse access required' });
};

router.use(authMiddleware);

router.get('/', requireWarehouseAccess, getWarehouseItems);
router.post('/items/:item_id/ready', requireWarehouseAccess, markReady);
router.post('/items/:item_id/replace', requireWarehouseAccess, replaceMachine);

module.exports = router;
