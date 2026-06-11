const express = require("express");
const chatService = require("../services/chatService");
const { requireAuth } = require("../middleware/authMiddleware");
const { writeLimiter } = require("../middleware/rateLimitMiddleware");
const { ok } = require("../utils/apiResponse");
const v = require("../utils/validation");

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

router.get("/messages/:otherUserId", v.validateParams(userParam), async (req, res, next) => {
  try {
    ok(res, { messages: await chatService.getMessages(req.auth, req.params.otherUserId) });
  } catch (error) {
    next(error);
  }
});

router.post("/messages", writeLimiter, v.validateBody(messageBody), async (req, res, next) => {
  try {
    ok(res, { message: await chatService.sendMessage(req.auth, req.body) }, 201);
  } catch (error) {
    next(error);
  }
});

router.put("/messages/:otherUserId/read", writeLimiter, v.validateParams(userParam), async (req, res, next) => {
  try {
    ok(res, await chatService.markMessagesRead(req.auth, req.params.otherUserId));
  } catch (error) {
    next(error);
  }
});

module.exports = router;

function userParam(input) {
  return { otherUserId: v.positiveInt(input.otherUserId, "otherUserId") };
}

function messageBody(input) {
  return {
    receiverId: v.positiveInt(input.receiverId || input.otherUserId || input.toUserId, "receiverId"),
    otherUserId: input.otherUserId ? v.positiveInt(input.otherUserId, "otherUserId") : undefined,
    toUserId: input.toUserId ? v.positiveInt(input.toUserId, "toUserId") : undefined,
    messageText: v.requiredText(input.messageText || input.message, "messageText", 2000),
    message: v.requiredText(input.message || input.messageText, "message", 2000)
  };
}
