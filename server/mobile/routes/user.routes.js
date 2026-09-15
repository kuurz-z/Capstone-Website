const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authMiddleware, activeTenantMiddleware } = require('../middleware/auth');

router.get('/me', authMiddleware, activeTenantMiddleware, userController.getMe);
router.put('/me', authMiddleware, activeTenantMiddleware, userController.updateMe);
router.post('/me/manual-guide-seen', authMiddleware, activeTenantMiddleware, userController.markTenantOnboardingSeen);
router.post('/push-token', authMiddleware, activeTenantMiddleware, userController.savePushToken);

// Document management
router.post('/documents', authMiddleware, activeTenantMiddleware, userController.uploadDocument);
router.get('/documents', authMiddleware, activeTenantMiddleware, userController.getUserDocuments);
router.get('/documents/:docId', authMiddleware, activeTenantMiddleware, userController.getDocumentFile);
router.delete('/documents/:docId', authMiddleware, activeTenantMiddleware, userController.deleteDocument);

module.exports = router;
