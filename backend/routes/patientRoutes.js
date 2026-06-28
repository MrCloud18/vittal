const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patientController');
const requireRoles = require('../middlewares/requireRoles');

router.get('/', patientController.listPatients);
router.post('/', requireRoles(['patient', 'admin']), patientController.createPatient);
router.get('/:id', patientController.getPatientById);
router.put('/:id', patientController.updatePatientById);
router.delete('/:id', requireRoles(['admin']), patientController.deletePatientById);

module.exports = router;
