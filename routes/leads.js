const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authMiddleware, checkRole } = require('../middleware/auth');
const leadController = require('../controllers/leadController');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/leads';
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const suffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `leads-${suffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

router.use(authMiddleware);

router.get('/', leadController.getLeads);
router.get('/follow-ups', leadController.getFollowUps);
router.get('/orders', leadController.getLeadOrders);
router.get('/reports', checkRole('admin', 'manager'), leadController.getReports);
router.get('/sample', checkRole('admin', 'manager', 'sales'), leadController.getSampleCsv);
router.get('/:id', leadController.getLeadById);

router.post('/', checkRole('admin', 'manager', 'sales'), leadController.createLead);
router.post('/upload', checkRole('admin', 'manager'), upload.single('file'), leadController.uploadLeadsCsv);
router.post('/assign', checkRole('admin', 'manager'), leadController.assignLeads);
router.post('/:id/research', checkRole('admin', 'manager', 'sales'), leadController.runResearch);
router.post('/:id/orders', checkRole('admin', 'manager', 'sales'), leadController.createLeadOrder);
router.put('/:id/research', checkRole('admin', 'manager', 'sales'), leadController.updateResearchDetails);
router.get('/:id/addresses', checkRole('admin', 'manager', 'sales'), leadController.getLeadAddresses);
router.post('/:id/addresses', checkRole('admin', 'manager', 'sales'), leadController.addLeadAddress);
router.delete('/:id/addresses/:address_id', checkRole('admin', 'manager', 'sales'), leadController.deleteLeadAddress);
router.get('/:id/customer-profile', checkRole('admin', 'manager', 'sales'), leadController.getLeadCustomerProfile);

router.put('/:id/status', checkRole('admin', 'manager', 'sales'), leadController.updateLeadStatus);
router.put('/:id/follow-up', checkRole('admin', 'manager', 'sales'), leadController.updateFollowUp);
router.put('/:id/basic', checkRole('admin', 'manager', 'sales'), leadController.updateLeadBasicDetails);

module.exports = router;
