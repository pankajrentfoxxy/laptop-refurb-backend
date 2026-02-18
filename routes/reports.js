const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reportsController');
const { authMiddleware, checkRole } = require('../middleware/auth');

// Protected route - only for admins, managers, floor managers
router.get('/technician-performance', authMiddleware, checkRole('admin', 'manager', 'floor_manager'), reportsController.getTechnicianPerformance);

module.exports = router;
