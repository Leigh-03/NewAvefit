const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/authMiddleware");
const { getDashboardStats, getAnalytics, getTrainingPulse } = require("../controllers/analyticsController");

router.get("/dashboard", verifyToken, getDashboardStats);
router.get("/training-pulse", verifyToken, (req, res, next) => {
  req.trainingAudience = "admin";
  next();
}, getTrainingPulse);
router.get("/", verifyToken, getAnalytics);

module.exports = router;