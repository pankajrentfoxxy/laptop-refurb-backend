const express = require('express');
const router = express.Router();
const {
  createTicket,
  getTickets,
  getMyTickets,
  getTicketById,
  updateTicket,
  moveToNextStage,
  assignTicket,
  addNote,
  addPartToTicket,
  requestPart,
  fulfillPartRequest,
  addServiceCost,
  claimTicket,
  getAllStages,
  updateGrade,
  startWork,
  endWork,
  getActiveWorkLog,
  bulkMoveTickets
} = require('../controllers/ticketController');
const qcController = require('../controllers/qcController');
const { authMiddleware, checkRole } = require('../middleware/auth');

// All routes require authentication
router.use(authMiddleware);

// @route   GET /api/tickets/stages
// @desc    Get all workflow stages
// @access  Private
router.get('/stages', getAllStages);

// @route   POST /api/tickets
// @desc    Create a new ticket
// @access  Private
router.post('/', createTicket);

// @route   GET /api/tickets
// @desc    Get all tickets (with filters)
// @access  Private
router.get('/', getTickets);

// @route   GET /api/tickets/my
// @desc    Get tickets assigned to me or my team
// @access  Private
router.get('/my', getMyTickets);

// @route   POST /api/tickets/bulk-move
// @desc    Bulk move all tickets from one stage to another
// @access  Private (Admin, Manager, Floor Manager)
router.post('/bulk-move', checkRole('admin', 'manager', 'floor_manager'), bulkMoveTickets);

// @route   GET /api/tickets/:id
// @desc    Get ticket by ID with full details
// @access  Private
router.get('/:id', getTicketById);

// @route   PUT /api/tickets/:id
// @desc    Update ticket details
// @access  Private
router.put('/:id', updateTicket);

// @route   POST /api/tickets/:id/next-stage
// @desc    Move ticket to next stage
// @access  Private
router.post('/:id/next-stage', moveToNextStage);

// @route   POST /api/tickets/:id/assign
// @desc    Assign ticket to a user
// @access  Private (Team Lead, Manager, Floor Manager, Admin)
router.post('/:id/assign', checkRole('team_lead', 'manager', 'floor_manager', 'admin'), assignTicket);

// @route   POST /api/tickets/:id/claim
// @desc    Claim an unassigned ticket for your team
// @access  Private (All Roles - validation in controller)
router.post('/:id/claim', claimTicket);

// @route   PUT /api/tickets/:id/grade
// @desc    Update ticket grade
// @access  Private (Grading Team, Admin)
router.put('/:id/grade', updateGrade);

// @route   POST /api/tickets/:id/notes
// @desc    Add note/comment to ticket
// @access  Private
router.post('/:id/notes', addNote);

// @route   POST /api/tickets/:id/parts
// @desc    Add part to ticket
// @access  Private
router.post('/:id/parts', addPartToTicket);

// Cost & Parts System
router.post('/:id/part-request', requestPart);
router.post('/:id/fulfill-part', fulfillPartRequest);
router.post('/:id/service-cost', addServiceCost);
// Work Logs Routes
router.post('/:id/work/start', startWork);
router.post('/:id/work/end', endWork);
router.get('/:id/work/active', getActiveWorkLog);

// QC Routes
router.get('/:id/qc', qcController.getQCData);
router.post('/:id/qc/save', qcController.saveQC);
router.post('/:id/qc/submit', qcController.submitQC);
router.post('/qc/:qc_id/upload-photo', qcController.uploadPhoto);
router.get('/:ticket_id/qc/history', qcController.getQCHistory);



module.exports = router;
