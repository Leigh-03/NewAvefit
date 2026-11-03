const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/authMiddleware");
const { getDashboardStats, getAnalytics, getTrainingPulse, sendWeeklyProgressReport } = require("../controllers/analyticsController");

router.post("/weekly-progress-report", verifyToken, sendWeeklyProgressReport);
router.post("/weekly-progress-report/:userId", verifyToken, sendWeeklyProgressReport);
router.get("/dashboard", verifyToken, getDashboardStats);
router.get("/training-pulse", verifyToken, (req, res, next) => {
  req.trainingAudience = "admin";
  next();
}, getTrainingPulse);
router.get("/", verifyToken, getAnalytics);

module.exports = router;