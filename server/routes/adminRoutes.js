const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/adminAuthMiddleware");
const { adminLoginLimiter, adminPasswordResetRequestLimiter, adminPasswordResetAttemptLimiter } = require("../middleware/rateLimit");
const {
  loginAdmin,
  requestAdminPasswordReset,
  resetAdminPassword,
  getAdminSidebarCounts,
} = require("../controllers/adminController");
const { getAdminReports } = require("../controllers/adminReportsController");
const { getAdminSystemHealth } = require("../controllers/adminSystemHealthController");

router.get("/sidebar-counts", verifyToken, getAdminSidebarCounts);
router.get("/reports", verifyToken, getAdminReports);
router.get("/system-health", verifyToken, getAdminSystemHealth);
router.post("/login", adminLoginLimiter, loginAdmin);
router.post("/forgot-password", adminPasswordResetRequestLimiter, requestAdminPasswordReset);
router.post("/reset-password", adminPasswordResetAttemptLimiter, resetAdminPassword);

module.exports = router;