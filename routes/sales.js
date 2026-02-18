const express = require('express');
const router = express.Router();
const { authMiddleware, checkPermission } = require('../middleware/auth');
const {
    researchCompanyData,
    createCustomer,
    getCustomers,
    createOrder,
    getOrders,
    getOrderDetails,
    dispatchOrder,
    sendToQC,
    qcPassOrder,
    markDelivered,
    generateInvoice,
    generateEwayBill,
    addQCNote,
    downloadInvoicePdf,
    downloadEwayPdf,
    cancelOrder,
    updateOrderItemLogistics,
    updateOrderItemTracking
} = require('../controllers/salesController');

// Sales access middleware
const requireSalesAccess = (req, res, next) => {
    if (req.user.role === 'admin' || req.user.role === 'manager' || (req.user.permissions && req.user.permissions.includes('sales_access'))) {
        next();
    } else {
        res.status(403).json({ message: 'Access denied: Sales access required' });
    }
};

// Warehouse access middleware
const requireWarehouseAccess = (req, res, next) => {
    if (req.user.role === 'admin' || req.user.role === 'manager' || req.user.role === 'floor_manager' || (req.user.permissions && req.user.permissions.includes('warehouse_access'))) {
        next();
    } else {
        res.status(403).json({ message: 'Access denied: Warehouse access required' });
    }
};

// QC access middleware
const requireQCAccess = (req, res, next) => {
    if (req.user.role === 'admin' || req.user.role === 'manager' || req.user.role === 'floor_manager' || (req.user.permissions && req.user.permissions.includes('qc_access'))) {
        next();
    } else {
        res.status(403).json({ message: 'Access denied: QC access required' });
    }
};

// Dispatch access middleware
const requireDispatchAccess = (req, res, next) => {
    if (req.user.role === 'sales') {
        return res.status(403).json({ message: 'Access denied: Sales team is view-only for dispatch workflow' });
    }
    if (
        req.user.role === 'admin' ||
        req.user.role === 'manager' ||
        req.user.role === 'floor_manager' ||
        (req.user.permissions && req.user.permissions.includes('dispatch_access'))
    ) {
        next();
    } else {
        res.status(403).json({ message: 'Access denied: Dispatch access required' });
    }
};

router.post('/research', authMiddleware, requireSalesAccess, researchCompanyData);
router.post('/customers', authMiddleware, requireSalesAccess, createCustomer);
router.get('/customers', authMiddleware, requireSalesAccess, getCustomers);
router.post('/orders', authMiddleware, requireSalesAccess, createOrder);
router.get('/orders', authMiddleware, getOrders); // All logged-in users can fetch orders (filtered by role)
router.get('/orders/:id', authMiddleware, getOrderDetails);
router.put('/orders/:id/cancel', authMiddleware, requireSalesAccess, cancelOrder);
router.put('/orders/:id/dispatch', authMiddleware, requireDispatchAccess, dispatchOrder);
router.put('/orders/:id/items/:item_id/logistics', authMiddleware, requireSalesAccess, updateOrderItemLogistics);
router.put('/orders/:id/items/:item_id/tracking', authMiddleware, requireDispatchAccess, updateOrderItemTracking);
router.put('/orders/:id/send-to-qc', authMiddleware, requireDispatchAccess, sendToQC);
router.put('/orders/:id/qc-pass', authMiddleware, requireQCAccess, qcPassOrder);
router.put('/orders/:id/delivered', authMiddleware, requireDispatchAccess, markDelivered);
router.post('/orders/:id/qc-note', authMiddleware, requireQCAccess, addQCNote);
router.post('/orders/:id/generate-invoice', authMiddleware, requireDispatchAccess, generateInvoice);
router.post('/orders/:id/generate-eway', authMiddleware, requireDispatchAccess, generateEwayBill);
router.get('/orders/:id/invoice-pdf', authMiddleware, requireDispatchAccess, downloadInvoicePdf);
router.get('/orders/:id/eway-pdf', authMiddleware, requireDispatchAccess, downloadEwayPdf);

module.exports = router;

