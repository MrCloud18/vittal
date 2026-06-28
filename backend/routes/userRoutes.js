const express = require('express');
const router = express.Router();
const requireRoles = require('../middlewares/requireRoles');
const allowSelfOrAdmin = require('../middlewares/allowSelfOrAdmin');
const userController = require('../controllers/userController');

router.get('/', requireRoles(['admin']), userController.listUsers);
router.get('/:id', allowSelfOrAdmin, userController.getUserById);
router.put('/:id', allowSelfOrAdmin, userController.updateUserById);
router.delete('/:id', requireRoles(['admin']), userController.deleteUserById);

module.exports = router;
