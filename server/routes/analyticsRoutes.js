const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/authMiddleware");
const { getDashboardStats, getAnalytics, sendWeeklyProgressReport } = require("../controllers/analyticsController");

router.post("/weekly-progress-report", verifyToken, sendWeeklyProgressReport);
router.get("/dashboard", verifyToken, getDashboardStats);
router.get("/", verifyToken, getAnalytics);

module.exports = router;