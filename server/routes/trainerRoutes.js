const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/authMiddleware");
const verifyTrainer = require("../middleware/trainerAuthMiddleware");
const { userLoginLimiter } = require("../middleware/rateLimit");
const availabilityController = require("../controllers/trainerAvailabilityController");
const { updateCapacity } = require("../controllers/coachCapacityController");
const {
  getTrainers, getTrainerById, createTrainer, updateTrainer, approveTrainer, rejectTrainer, deactivateTrainer, deleteTrainer, getTrainerRoster,
  loginTrainer, getMyRoster, getMyProfile, updateMyPhoto, getExerciseCatalog,
  getMyWorkoutPlans, createMyWorkoutPlan, updateMyWorkoutPlan, deleteMyWorkoutPlan,
  getRosterMemberSessions, assignSessionAsTrainer, deleteSessionAsTrainer, updateRosterMemberExperience,
} = require("../controllers/trainerController");

// Trainer Portal (self-service, trainer-authenticated)
router.post("/login", userLoginLimiter, loginTrainer);
router.get("/me/roster", verifyTrainer, getMyRoster);
router.get("/me/profile", verifyTrainer, getMyProfile);
router.put("/me/photo", verifyTrainer, updateMyPhoto);
router.put("/me/members/:userId/experience", verifyTrainer, updateRosterMemberExperience);
router.get("/me/availability", verifyTrainer, availabilityController.getForTrainer);
router.put("/me/availability", verifyTrainer, availabilityController.saveForTrainer);
router.get("/me/workout-plans", verifyTrainer, getMyWorkoutPlans);
router.post("/me/workout-plans", verifyTrainer, createMyWorkoutPlan);
router.put("/me/workout-plans/:planId", verifyTrainer, updateMyWorkoutPlan);
router.delete("/me/workout-plans/:planId", verifyTrainer, deleteMyWorkoutPlan);
router.get("/me/exercises", verifyTrainer, getExerciseCatalog);
router.get("/me/members/:userId/sessions", verifyTrainer, getRosterMemberSessions);
router.post("/me/assign", verifyTrainer, assignSessionAsTrainer);
router.delete("/me/sessions/:sessionId", verifyTrainer, deleteSessionAsTrainer);

// Admin-managed trainer records
router.get("/", verifyToken, getTrainers);
router.get("/:id/roster", verifyToken, getTrainerRoster);
router.get("/:id/availability", verifyToken, availabilityController.getForAdmin);
router.put("/:id/availability", verifyToken, availabilityController.saveForAdmin);
router.put("/:id/capacity", verifyToken, updateCapacity);
router.get("/:id", verifyToken, getTrainerById);
router.post("/", verifyToken, createTrainer);
router.put("/:id", verifyToken, updateTrainer);
router.put("/:id/approve", verifyToken, approveTrainer);
router.put("/:id/reject", verifyToken, rejectTrainer);
router.put("/:id/deactivate", verifyToken, deactivateTrainer);
router.delete("/:id", verifyToken, deleteTrainer);

module.exports = router;
