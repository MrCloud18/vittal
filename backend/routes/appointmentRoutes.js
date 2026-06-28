const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');

router.get('/', appointmentController.listAppointments);
router.post('/', appointmentController.createAppointment);
router.get('/:id', appointmentController.getAppointmentById);
router.patch('/:id/status', appointmentController.updateAppointmentStatus);
router.delete('/:id', appointmentController.cancelAppointment);

module.exports = router;
