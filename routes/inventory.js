const express = require('express');
const router = express.Router();
const { authMiddleware, checkRole, checkRoleOrPermission } = require('../middleware/auth');
const {
    addInventory,
    updateInventory,
    triggerErpSync,
    getInventory,
    searchByMachineOrSerial,
    uploadBulk,
    getSpecs,
    searchAvailableInventory,
    uploadLaptopCatalogCsv,
    getLaptopCatalogOptions,
    traceMachineNumber
} = require('../controllers/inventoryController');

const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

// Debug: trace model/source for a machine number (ERP sync investigation)
router.get('/trace/:machineNumber', authMiddleware, traceMachineNumber);

router.use(authMiddleware);

// Get all inventory (Warehouse & Admin)
router.get('/', checkRole('admin', 'team_member', 'manager'), getInventory);

// Get unique specs for dropdowns (Sales & All)
router.get('/specs', getSpecs);

// Search available inventory by specs (Sales)
router.get('/available', searchAvailableInventory);
router.get('/catalog/options', getLaptopCatalogOptions);

// Search single item by machine/serial (inventory_read or inventory_write)
router.get('/search', checkRoleOrPermission(['admin', 'team_member', 'manager', 'floor_manager'], ['inventory_read', 'inventory_write', 'inventory_access']), searchByMachineOrSerial);

// Add inventory (roles or inventory_write permission)
router.post('/', checkRoleOrPermission(['admin', 'manager', 'team_member'], ['inventory_write', 'inventory_access']), addInventory);

// Update inventory by machine_number or inventory_id
router.put('/:identifier', checkRole('admin', 'manager', 'team_member'), updateInventory);

// Trigger full ERP sync (corrects all records from QC Passed + Purchase Order)
router.post('/sync', checkRole('admin', 'manager'), triggerErpSync);

// Bulk Upload (roles or inventory_write permission)
router.post('/upload', checkRoleOrPermission(['admin', 'manager', 'floor_manager'], ['inventory_write', 'inventory_access']), upload.single('file'), uploadBulk);
router.post('/catalog/upload', checkRoleOrPermission(['admin', 'manager', 'floor_manager'], ['inventory_write', 'inventory_access']), upload.single('file'), uploadLaptopCatalogCsv);
// Note: team_member should technically be filtered by 'Warehouse Team' in logic or here, but keeping broad for now based on 'Access by Warehouse and admin' request. 
// Ideally we check if team_name is Warehouse. For now, role check is basic.

module.exports = router;
