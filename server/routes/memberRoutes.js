const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/authMiddleware");
const {
  getMembers, getMemberById, createMember, updateMember, assignTrainer,
  updateMemberMembership, approveMember, rejectMember, deleteMember, getMemberProgress
} = require("../controllers/memberController");
const {
  getAdminChangeRequests,
  reviewChangeRequest,
} = require("../controllers/profileChangeController");

router.get("/change-requests", verifyToken, getAdminChangeRequests);
router.put("/change-requests/:requestId/:decision", verifyToken, reviewChangeRequest);
router.get("/", verifyToken, getMembers);
router.get("/:id", verifyToken, getMemberById);
router.post("/", verifyToken, createMember);
router.put("/:id", verifyToken, updateMember);
router.put("/:id/membership", verifyToken, updateMemberMembership);
router.put("/:id/trainer", verifyToken, assignTrainer);
router.put("/:id/approve", verifyToken, approveMember);
router.put("/:id/reject", verifyToken, rejectMember);
router.delete("/:id", verifyToken, deleteMember);
router.get("/:id/progress", verifyToken, getMemberProgress);

module.exports = router;