const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authMiddleware, checkPermission } = require('../middleware/auth');
const {
    researchCompanyData,
    createCustomer,
    getCustomers,
    getCustomerById,
    updateCustomer,
    updateCustomerAddress,
    addCustomerAddress,
    uploadCustomersCsv,
    createOrder,
    getOrders,
    getOrderStats,
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

// Customers view: admin or customers_access
const requireCustomersAccess = (req, res, next) => {
    if (req.user.role === 'admin' || (req.user.permissions && req.user.permissions.includes('customers_access'))) {
        next();
    } else {
        res.status(403).json({ message: 'Access denied: Customers access required' });
    }
};

// Customers edit profile (name, GST, company): admin or customers_edit
const requireCustomersEdit = (req, res, next) => {
    if (req.user.role === 'admin' || (req.user.permissions && req.user.permissions.includes('customers_edit'))) {
        next();
    } else {
        res.status(403).json({ message: 'Access denied: Customers edit permission required' });
    }
};

// Address add/update: admin, customers_edit, or sales_access
const requireAddressAccess = (req, res, next) => {
    if (req.user.role === 'admin' || (req.user.permissions && (req.user.permissions.includes('customers_edit') || req.user.permissions.includes('sales_access')))) {
        next();
    } else {
        res.status(403).json({ message: 'Access denied' });
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
const upload = multer({ dest: 'uploads/' });

router.post('/customers', authMiddleware, (req, res, next) => {
    if (req.user.role === 'admin' || (req.user.permissions && (req.user.permissions.includes('sales_access') || req.user.permissions.includes('customers_edit')))) {
        next();
    } else {
        res.status(403).json({ message: 'Access denied' });
    }
}, createCustomer);
router.post('/customers/upload', authMiddleware, (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
    next();
}, upload.single('file'), uploadCustomersCsv);
const requireCustomersOrSalesAccess = (req, res, next) => {
    if (req.user.role === 'admin' || (req.user.permissions && (req.user.permissions.includes('sales_access') || req.user.permissions.includes('customers_access')))) {
        next();
    } else {
        res.status(403).json({ message: 'Access denied' });
    }
};
router.get('/customers', authMiddleware, requireCustomersOrSalesAccess, getCustomers);
router.get('/customers/:id', authMiddleware, requireCustomersOrSalesAccess, getCustomerById);
router.put('/customers/:id', authMiddleware, requireCustomersEdit, updateCustomer);
router.put('/customers/:id/addresses/:addr_id', authMiddleware, requireAddressAccess, updateCustomerAddress);
router.post('/customers/:id/addresses', authMiddleware, requireAddressAccess, addCustomerAddress);
router.post('/orders', authMiddleware, requireSalesAccess, createOrder);
router.get('/orders', authMiddleware, getOrders); // All logged-in users can fetch orders (filtered by role)
router.get('/orders/stats', authMiddleware, getOrderStats);
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

