const pool = require("../db");
const { getCapacityStatus } = require("../utils/coachAssignment");
const { deliverCoachEmail } = require("../utils/coachEmailNotifications");
const { sendCoachCapacityStatusEmail } = require("../utils/mailer");

const updateCapacity = async (req, res) => {
  const trainerId = Number(req.params.id);
  const maxMembers = Number(req.body?.max_members);
  if (!Number.isInteger(trainerId) || trainerId < 1) {
    return res.status(400).json({ success: false, message: "Invalid coach ID." });
  }
  if (!Number.isInteger(maxMembers) || maxMembers < 1 || maxMembers > 10000) {
    return res.status(400).json({ success: false, message: "Coach capacity must be a whole number between 1 and 10,000." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const coach = await client.query(
      "SELECT trainer_id, full_name, email, status, max_members FROM trainers WHERE trainer_id = $1 FOR UPDATE",
      [trainerId]
    );
    if (!coach.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Coach not found." });
    }

    const assigned = await client.query(
      "SELECT COUNT(*)::integer AS assigned_member_count FROM users WHERE trainer_id = $1",
      [trainerId]
    );
    const assignedMemberCount = assigned.rows[0].assigned_member_count;
    if (maxMembers < assignedMemberCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: `Capacity cannot be lower than the ${assignedMemberCount} members currently assigned. Reassign or remove members first.`,
        data: { assigned_member_count: assignedMemberCount },
      });
    }

    const result = await client.query(
      `UPDATE trainers
       SET max_members = $1, updated_at = NOW()
       WHERE trainer_id = $2
       RETURNING trainer_id, max_members`,
      [maxMembers, trainerId]
    );
    await client.query("COMMIT");
    const previousStatus = getCapacityStatus(
      assignedMemberCount,
      coach.rows[0].max_members,
      coach.rows[0].status
    );
    const nextStatus = getCapacityStatus(
      assignedMemberCount,
      result.rows[0].max_members,
      coach.rows[0].status
    );
    if ((previousStatus === "Full") !== (nextStatus === "Full")) {
      await deliverCoachEmail({
        trainer: coach.rows[0],
        event: "capacity status",
        send: (to) => sendCoachCapacityStatusEmail({
          to,
          accountName: coach.rows[0].full_name,
          status: nextStatus,
          assignedMembers: assignedMemberCount,
          maxMembers: result.rows[0].max_members,
        }),
      });
    }
    res.json({
      success: true,
      message: "Coach capacity updated.",
      data: { ...result.rows[0], assigned_member_count: assignedMemberCount },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("update coach capacity error:", err.message);
    res.status(500).json({ success: false, message: "Unable to update coach capacity." });
  } finally {
    client.release();
  }
};

module.exports = { updateCapacity };
