const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/authMiddleware");
const { getWorkouts, getCategories, updateWorkout, getEquipmentInventory, createEquipment, updateEquipment, deleteEquipment, getWorkoutPlans, createWorkoutPlan, deleteWorkoutPlan, getMemberSessions, assignSessionToMember, deleteAssignedSession } = require("../controllers/workoutController");

router.get("/categories", verifyToken, getCategories);
router.get("/equipment", verifyToken, getEquipmentInventory);
router.post("/equipment", verifyToken, createEquipment);
router.put("/equipment/:equipmentId", verifyToken, updateEquipment);
router.delete("/equipment/:equipmentId", verifyToken, deleteEquipment);
router.get("/plans", verifyToken, getWorkoutPlans);
router.post("/plans", verifyToken, createWorkoutPlan);
router.delete("/plans/:id", verifyToken, deleteWorkoutPlan);
router.get("/member/:userId", verifyToken, getMemberSessions);
router.post("/assign", verifyToken, assignSessionToMember);
router.delete("/session/:sessionId", verifyToken, deleteAssignedSession);
router.get("/", verifyToken, getWorkouts);
router.put("/:id", verifyToken, updateWorkout);

module.exports = router;