import express from "express";
import multer from "multer";

import * as chatController from "../controllers/chatController.js";
import { mobileTenantAuth } from "../middleware/mobileTenantAuth.js";
import {
  ATTACHMENT_TYPE_ERROR_MESSAGE,
  isAllowedAttachmentFile,
} from "../services/attachmentUploadService.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (isAllowedAttachmentFile(file)) return callback(null, true);
    const error = new Error(ATTACHMENT_TYPE_ERROR_MESSAGE);
    error.statusCode = 400;
    error.code = "UNSUPPORTED_FILE_TYPE";
    return callback(error);
  },
});

// The canonical chat controller expects the authenticated database user in
// req.authUser. Mobile uses a session_token transport instead of the web
// Firebase-token transport, so this adapter binds the already-verified mobile
// tenant to that shared controller contract and does nothing else.
function bindCanonicalTenant(req, _res, next) {
  req.authUser = req.mobileTenant;
  next();
}

const tenant = [mobileTenantAuth, bindCanonicalTenant];

router.post("/chat/start", ...tenant, chatController.startConversation);
router.get("/chat/me", ...tenant, chatController.getMyConversations);
router.get("/chat/:conversationId/messages", ...tenant, chatController.getConversationMessages);
router.post(
  "/chat/:conversationId/attachments",
  ...tenant,
  upload.single("file"),
  chatController.uploadChatAttachment,
);
router.get(
  "/chat/:conversationId/attachments/:attachmentId",
  ...tenant,
  chatController.downloadChatAttachment,
);
router.post("/chat/:conversationId/messages", ...tenant, chatController.sendTenantMessage);
router.patch("/chat/:conversationId/rating", ...tenant, chatController.rateTenantSupport);
router.patch("/chat/:conversationId/resolution", ...tenant, chatController.confirmTenantResolution);
router.patch("/chat/:conversationId/reopen", ...tenant, chatController.reopenTenantConversation);
router.patch("/chat/:conversationId/close", ...tenant, chatController.closeTenantConversation);
router.post("/chat/:conversationId/typing", ...tenant, chatController.broadcastTyping);

router.use((error, _req, res, next) => {
  if (!error) return next();
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      error: "Attachment exceeds the 5 MB limit.",
      code: "ATTACHMENT_TOO_LARGE",
    });
  }
  if (error.code === "UNSUPPORTED_FILE_TYPE") {
    return res.status(error.statusCode || 400).json({ error: error.message, code: error.code });
  }
  return next(error);
});

export default router;
