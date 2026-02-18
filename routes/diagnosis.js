const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authMiddleware } = require('../middleware/auth');
const {
    getDiagnosisSections,
    getDiagnosis,
    saveDiagnosis,
    submitDiagnosis,
    getPartsRequired,
    attachPart,
    uploadDiagnosisImage,
    assignPartByProcurement
} = require('../controllers/diagnosisController');

// Configure Multer for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/diagnosis';
        // Create directory if not exists
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Unique filename: ticketId-timestamp-originalName
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'diagnosis-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// All routes require authentication
router.use(authMiddleware);

// Get diagnosis sections configuration
router.get('/sections', getDiagnosisSections);

// Get diagnosis for a ticket
router.get('/ticket/:id', getDiagnosis);

// Save diagnosis draft
router.post('/ticket/:id', saveDiagnosis);

// Submit completed diagnosis
router.post('/ticket/:id/submit', submitDiagnosis);

// Upload diagnosis image
router.post('/ticket/:id/images', upload.single('image'), uploadDiagnosisImage);

// Get parts required for a ticket
router.get('/ticket/:id/parts', getPartsRequired);

// Attach part to ticket
// Attach part to ticket (Assembly)
router.post('/ticket/:id/parts/attach', attachPart);

// Assign part (Procurement)
router.post('/ticket/:id/parts/assign-procurement', assignPartByProcurement);

module.exports = router;
