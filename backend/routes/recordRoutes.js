const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const clinicalLimiter = require('../middlewares/clinicalLimiter');
const recordController = require('../controllers/recordController');

router.get('/patients/:id/records', authMiddleware, clinicalLimiter, recordController.listRecordsByPatient);
router.post('/patients/:id/records', authMiddleware, clinicalLimiter, recordController.createRecordForPatient);
router.get('/records/:id', authMiddleware, clinicalLimiter, recordController.getRecordById);
router.put('/records/:id', authMiddleware, clinicalLimiter, recordController.updateRecordById);

module.exports = router;
