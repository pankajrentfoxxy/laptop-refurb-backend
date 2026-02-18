const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const {
  getChipRepair,
  saveChipRepair,
  submitChipRepair
} = require('../controllers/chipLevelController');

router.use(authMiddleware);

router.get('/ticket/:id', getChipRepair);
router.post('/ticket/:id', saveChipRepair);
router.post('/ticket/:id/submit', submitChipRepair);

module.exports = router;
