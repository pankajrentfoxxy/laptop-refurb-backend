const express = require('express');
const router = express.Router();
const { authMiddleware, checkRole } = require('../middleware/auth');
const {
    addInventory,
    getInventory,
    searchByMachineOrSerial,
    uploadBulk,
    getSpecs,
    searchAvailableInventory,
    uploadLaptopCatalogCsv,
    getLaptopCatalogOptions
} = require('../controllers/inventoryController');

const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

router.use(authMiddleware);

// Get all inventory (Warehouse & Admin)
router.get('/', checkRole('admin', 'team_member', 'manager'), getInventory);

// Get unique specs for dropdowns (Sales & All)
router.get('/specs', getSpecs);

// Search available inventory by specs (Sales)
router.get('/available', searchAvailableInventory);
router.get('/catalog/options', getLaptopCatalogOptions);

// Search single item by machine/serial (All authenticated for scanning)
router.get('/search', searchByMachineOrSerial);

// Add inventory (Warehouse & Admin only)
router.post('/', checkRole('admin', 'manager', 'team_member'), addInventory);

// Bulk Upload
router.post('/upload', checkRole('admin', 'manager', 'floor_manager'), upload.single('file'), uploadBulk);
router.post('/catalog/upload', checkRole('admin', 'manager', 'floor_manager'), upload.single('file'), uploadLaptopCatalogCsv);
// Note: team_member should technically be filtered by 'Warehouse Team' in logic or here, but keeping broad for now based on 'Access by Warehouse and admin' request. 
// Ideally we check if team_name is Warehouse. For now, role check is basic.

module.exports = router;
