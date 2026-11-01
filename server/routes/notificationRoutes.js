const express = require("express");
const verifyAdmin = require("../middleware/adminAuthMiddleware");
const verifyTrainer = require("../middleware/trainerAuthMiddleware");
const verifyUser = require("../middleware/userAuthMiddleware");
const controller = require("../controllers/notificationController");

const router = express.Router();

const createAudienceRouter = (audience, authenticate) => {
  const audienceRouter = express.Router();
  audienceRouter.use(authenticate, (req, res, next) => {
    req.notificationAudience = audience;
    req.notificationRecipientId =
      audience === "admin" ? req.admin.admin_id :
        audience === "trainer" ? req.trainer.trainer_id :
          req.user.user_id;
    next();
  });

  audienceRouter.get("/", controller.getNotifications);
  audienceRouter.get("/unread-count", controller.getUnreadCount);
  audienceRouter.put("/mark-all-read", controller.markAllAsRead);
  audienceRouter.put("/:id/read", controller.markAsRead);
  audienceRouter.delete("/:id", controller.deleteNotification);
  return audienceRouter;
};

router.use("/admin", createAudienceRouter("admin", verifyAdmin));
router.use("/trainer", createAudienceRouter("trainer", verifyTrainer));
router.use("/user", createAudienceRouter("user", verifyUser));

module.exports = router;
