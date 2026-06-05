const express = require("express");
const chatService = require("../services/chatService");
const { requireAuth } = require("../middleware/authMiddleware");
const { ok } = require("../utils/apiResponse");

const router = express.Router();

router.use(requireAuth);

router.get("/users", async (req, res, next) => {
  try {
    ok(res, { users: await chatService.listChatUsers(req.auth) });
  } catch (error) {
    next(error);
  }
});

router.get("/conversations", async (req, res, next) => {
  try {
    ok(res, { conversations: await chatService.listConversations(req.auth) });
  } catch (error) {
    next(error);
  }
});

router.get("/messages/:otherUserId", async (req, res, next) => {
  try {
    ok(res, { messages: await chatService.getMessages(req.auth, req.params.otherUserId) });
  } catch (error) {
    next(error);
  }
});

router.post("/messages", async (req, res, next) => {
  try {
    ok(res, { message: await chatService.sendMessage(req.auth, req.body) }, 201);
  } catch (error) {
    next(error);
  }
});

router.put("/messages/:otherUserId/read", async (req, res, next) => {
  try {
    ok(res, await chatService.markMessagesRead(req.auth, req.params.otherUserId));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
