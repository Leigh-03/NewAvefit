const express = require("express");
const router = express.Router();
const verifyUser = require("../middleware/userAuthMiddleware");
const {
  register, login, googleLogin, forgotPassword, resetPassword,
  requestPasswordChangeCode, changePasswordWithCode,
  verifyEmail, resendVerification, getVerificationStatus,
  getProfile, updateProfile, updatePhoto, getUserChangeRequests,
} = require("../controllers/userController");
const { getUserWorkoutPlan, getUserPlans, addWorkoutSession, updateWorkoutSession, startWorkoutSession, completeSession, deleteWorkoutSession, resetWeek } = require("../controllers/userWorkoutController");
const { getProgress, logProgress, calculatePrediction, autoPredict, getUserNotifications } = require("../controllers/userProgressController");
const { getActiveTrainers } = require("../controllers/trainerController");
const { submitMemberFeedback } = require("../controllers/feedbackController");
const {
  userLoginLimiter, signupLimiter, verificationResendLimiter, verificationAttemptLimiter, feedbackLimiter,
} = require("../middleware/rateLimit");

// Auth
router.post("/register", signupLimiter, register);
router.post("/login", userLoginLimiter, login);
router.post("/google-login", userLoginLimiter, googleLogin);
router.post("/forgot-password", userLoginLimiter, forgotPassword);
router.post("/reset-password", userLoginLimiter, resetPassword);
router.post("/password/change-code", verifyUser, verificationResendLimiter, requestPasswordChangeCode);
router.post("/password/change", verifyUser, verificationAttemptLimiter, changePasswordWithCode);

// Email verification (public: the member has no session until they are verified
// and approved, so these cannot sit behind verifyUser)
router.post("/verify-email", verificationAttemptLimiter, verifyEmail);
router.post("/resend-verification", verificationResendLimiter, resendVerification);
router.get("/verification-status", verificationAttemptLimiter, getVerificationStatus);

// Profile
router.get("/profile", verifyUser, getProfile);
router.get("/profile/change-requests", verifyUser, getUserChangeRequests);
router.put("/profile", verifyUser, updateProfile);
router.put("/profile/photo", verifyUser, updatePhoto);
router.post("/feedback", verifyUser, feedbackLimiter, submitMemberFeedback);

// Workouts
router.get("/workouts", verifyUser, getUserWorkoutPlan);
router.get("/plans", verifyUser, getUserPlans);
router.post("/workouts", verifyUser, addWorkoutSession);
router.put("/workouts/:id", verifyUser, updateWorkoutSession);
router.put("/workouts/:id/start", verifyUser, startWorkoutSession);
router.put("/workouts/:id/complete", verifyUser, completeSession);
router.delete("/workouts/:id", verifyUser, deleteWorkoutSession);
router.delete("/workouts/reset/week", verifyUser, resetWeek);

// Progress
router.get("/progress", verifyUser, getProgress);
router.post("/progress", verifyUser, logProgress);
router.post("/progress/predict", verifyUser, calculatePrediction);
router.post("/progress/auto-predict", verifyUser, autoPredict);

// Coaches (member-facing)
router.get("/trainers", getActiveTrainers);

// Notifications
router.get("/notifications", verifyUser, getUserNotifications);

module.exports = router;