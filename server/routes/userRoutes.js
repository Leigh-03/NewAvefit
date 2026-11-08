const express = require("express");
const router = express.Router();
const verifyUser = require("../middleware/userAuthMiddleware");
const {
  register, login, googleLogin, forgotPassword, resetPassword,
  requestPasswordChangeCode, changePasswordWithCode,
  verifyEmail, resendVerification, getVerificationStatus,
  getProfile, updateProfile, updateHealthAssessment, updatePhoto, getUserChangeRequests,
} = require("../controllers/userController");
const { submitMembershipTermRequest, getMembershipTermRequest } = require("../controllers/memberController");
const { getUserWorkoutPlan, getUserPlans, requestWorkoutPlan, addWorkoutSession, updateWorkoutSession, startWorkoutSession, completeSession, deleteWorkoutSession, resetWeek } = require("../controllers/userWorkoutController");
const { getProgress, logProgress, calculatePrediction, autoPredict, getUserNotifications } = require("../controllers/userProgressController");
const { getTrainingPulse } = require("../controllers/analyticsController");
const { getActiveTrainers } = require("../controllers/trainerController");
const workoutAvailabilityController = require("../controllers/userWorkoutAvailabilityController");
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
router.get("/profile/membership-request", verifyUser, getMembershipTermRequest);
router.post("/profile/membership-request", verifyUser, submitMembershipTermRequest);
router.put("/profile", verifyUser, updateProfile);
router.put("/profile/health", verifyUser, updateHealthAssessment);
router.put("/profile/photo", verifyUser, updatePhoto);
router.get("/profile/availability", verifyUser, workoutAvailabilityController.getAvailability);
router.put("/profile/availability", verifyUser, workoutAvailabilityController.saveAvailability);
router.post("/feedback", verifyUser, feedbackLimiter, submitMemberFeedback);
router.get("/training-pulse", verifyUser, (req, res, next) => {
  req.trainingAudience = "user";
  next();
}, getTrainingPulse);

// Workouts
router.get("/workouts", verifyUser, getUserWorkoutPlan);
router.get("/plans", verifyUser, getUserPlans);
router.post("/workout-plan-requests", verifyUser, requestWorkoutPlan);
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