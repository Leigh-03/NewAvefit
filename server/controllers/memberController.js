const pool = require("../db");
const { createNotification } = require("../utils/notifications");
const { validateAge } = require("../utils/security");
const {
  sendCoachAssignmentEmail,
  sendUserCoachAssignedEmail,
  sendMemberAccountDecisionEmail,
} = require("../utils/mailer");

// =====================================================
// GET ALL MEMBERS FROM USERS TABLE
// =====================================================
const getMembers = async (req, res) => {
  try {
    const result = await pool.query(`
    SELECT
    u.user_id AS member_id,
    u.user_id,
    u.first_name,
    u.last_name,
    CONCAT(u.first_name, ' ', u.last_name) AS full_name,
    u.email,
    u.phone,
    u.gender,
    u.birth_date,
    u.age,
    u.height,
    u.weight,

    CASE
        WHEN u.height IS NOT NULL
         AND u.height > 0
         AND u.weight IS NOT NULL
        THEN ROUND(
            (u.weight / POWER(u.height / 100.0, 2))::numeric,
            2
        )
        ELSE NULL
    END AS bmi,

    u.fitness_goal,
    u.activity_level,
    u.target_weight,
    u.workout_days_per_week,
    u.workout_duration,
    u.preferred_days,
    u.preferred_workout_time,
    u.intensity,
    u.injuries,
    u.health_conditions,
    u.profile_image,
    u.trainer_id,
    u.membership_months,
    u.membership_start_date,
    u.membership_end_date,

    t.full_name AS trainer_name,
    t.photo_url AS trainer_photo_url,
    t.bio AS trainer_bio,

    INITCAP(LOWER(COALESCE(u.account_status, 'pending'))) AS status,

    COALESCE(u.email_verified, FALSE) AS email_verified,
    u.email_verified_at,

    u.created_at::date AS joined_date,
    u.created_at,
    u.updated_at

FROM users u

LEFT JOIN trainers t
    ON t.trainer_id = u.trainer_id


ORDER BY u.user_id DESC;
    `);

    console.log(`✅ Retrieved ${result.rows.length} users from users table`);

    res.json({ success: true, data: result.rows });

  } catch (error) {
    console.error("❌ Error fetching members:", error);

    res.status(500).json({
      message: "Failed to fetch members",
      error: error.message
    });
  }
};


// =====================================================
// GET SINGLE MEMBER
// =====================================================
const getMemberById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT
        u.user_id AS member_id,
        u.user_id,
        u.first_name,
        u.last_name,
        TRIM(
          CONCAT(
            COALESCE(u.first_name, ''),
            ' ',
            COALESCE(u.last_name, '')
          )
        ) AS full_name,

        u.email,
        u.phone,
            u.gender,
        u.birth_date,
        u.age,
        u.height,
        u.weight,

        CASE
          WHEN u.height IS NOT NULL
            AND u.height > 0
            AND u.weight IS NOT NULL
          THEN ROUND(
            (u.weight / POWER(u.height / 100.0, 2))::numeric,
            2
          )
          ELSE NULL
        END AS bmi,

        u.fitness_goal,
        u.activity_level,
        u.target_weight,
        u.workout_days_per_week,
        u.workout_duration,
        u.preferred_days,
        u.preferred_workout_time,
        u.intensity,
        u.injuries,
        u.health_conditions,

        u.profile_image,
        u.trainer_id,
        u.membership_months,
        u.membership_start_date,
        u.membership_end_date,

        t.full_name AS trainer_name,
        t.photo_url AS trainer_photo_url,
        t.bio AS trainer_bio,

        INITCAP(LOWER(COALESCE(u.account_status, 'pending'))) AS status,

        COALESCE(u.email_verified, FALSE) AS email_verified,
        u.email_verified_at,

        u.created_at::date AS joined_date,
        u.updated_at

      FROM users u

      LEFT JOIN trainers t
        ON t.trainer_id = u.trainer_id

      WHERE u.user_id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Member not found"
      });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error("❌ Error fetching member:", error);

    res.status(500).json({
      message: "Failed to fetch member",
      error: error.message
    });
  }
};


// =====================================================
// ASSIGN / CHANGE TRAINER
// ADMIN ONLY
// =====================================================
const assignTrainer = async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const { id } = req.params;
    const { trainer_id } = req.body;

    const trainerIdValue =
      trainer_id === null ||
      trainer_id === "" ||
      trainer_id === undefined
        ? null
        : Number(trainer_id);

    if (
      trainerIdValue !== null &&
      (!Number.isInteger(trainerIdValue) || trainerIdValue <= 0)
    ) {
      return res.status(400).json({
        message: "Invalid trainer_id"
      });
    }

    await client.query("BEGIN");
    transactionStarted = true;

    const memberCheck = await client.query(
      `SELECT
         u.user_id,
         u.trainer_id,
         u.first_name,
         u.last_name,
         u.email,
         u.preferred_days,
         u.preferred_workout_time
       FROM users u
       WHERE u.user_id = $1
       FOR UPDATE`,
      [id]
    );

    if (memberCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({
        message: "Member not found"
      });
    }

    const member = memberCheck.rows[0];
    const availabilityResult = await client.query(
      `SELECT day_of_week, TO_CHAR(start_time, 'HH24:MI') AS start_time,
              TO_CHAR(end_time, 'HH24:MI') AS end_time
       FROM user_workout_availability
       WHERE user_id = $1
       ORDER BY ARRAY_POSITION(
         ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
         day_of_week
       )`,
      [member.user_id]
    );
    member.weekly_availability = availabilityResult.rows;
    const previousTrainerId = member.trainer_id;
    let nextTrainer = null;

    if (trainerIdValue !== null) {
      const trainerCheck = await client.query(
        `
        SELECT trainer_id, full_name, email
        FROM trainers
        WHERE trainer_id = $1
          AND COALESCE(status, 'Active') = 'Active'
        `,
        [trainerIdValue]
      );

      if (trainerCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(404).json({
          message: "Trainer not found or inactive"
        });
      }
      nextTrainer = trainerCheck.rows[0];
    }

    const result = await client.query(
      `
      UPDATE users
      SET
        trainer_id = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2
      RETURNING
        user_id,
        trainer_id
      `,
      [trainerIdValue, member.user_id]
    );
    await client.query("COMMIT");
    transactionStarted = false;

    const memberName = `${member.first_name || ""} ${member.last_name || ""}`.trim() || "A member";
    const assignmentChanged = Number(previousTrainerId || 0) !== Number(trainerIdValue || 0);
    let coachAssignmentEmailSent = null;
    let userAssignmentEmailSent = null;
    if (assignmentChanged) {
      if (previousTrainerId) {
        try {
          await createNotification({
            audience: "trainer",
            recipientId: previousTrainerId,
            message: trainerIdValue === null
              ? `${memberName} is no longer assigned to you as their coach.`
              : `${memberName} has been reassigned to another coach and is no longer on your roster.`,
            notificationType: "workout",
            userName: memberName,
            targetUrl: "/trainer/roster",
          });
        } catch (error) {
          console.error(`Previous coach notification failed for member ${member.user_id}:`, error.message);
        }
      }

      if (nextTrainer) {
        if (nextTrainer.email) {
          try {
            const delivery = await sendCoachAssignmentEmail({
              to: nextTrainer.email,
              trainerName: nextTrainer.full_name,
              memberName,
              memberEmail: member.email,
              preferredDays: member.preferred_days,
              preferredWorkoutTime: member.preferred_workout_time,
              weeklyAvailability: member.weekly_availability,
            });
            coachAssignmentEmailSent = delivery.delivered;
            if (!delivery.delivered) {
              console.error(`Coach assignment email for trainer ${nextTrainer.trainer_id} was not delivered.`);
            }
          } catch (error) {
            coachAssignmentEmailSent = false;
            console.error(`Coach assignment email for trainer ${nextTrainer.trainer_id} failed:`, error.message);
          }
        } else {
          coachAssignmentEmailSent = false;
          console.error(`Coach assignment email for trainer ${nextTrainer.trainer_id} was not sent because no email address is configured.`);
        }

        try {
          await createNotification({
            audience: "trainer",
            recipientId: nextTrainer.trainer_id,
            message: `${memberName} has been assigned to you as their coach.`,
            notificationType: "workout",
            userName: memberName,
            targetUrl: "/trainer/roster",
          });
        } catch (error) {
          console.error(`New coach notification failed for member ${member.user_id}:`, error.message);
        }
      }

      if (nextTrainer && member.email) {
        try {
          const delivery = await sendUserCoachAssignedEmail({
            to: member.email,
            firstName: member.first_name,
            trainerName: nextTrainer.full_name,
          });
          userAssignmentEmailSent = delivery.delivered;
          if (!delivery.delivered) {
            console.error(`Coach assignment email for user ${member.user_id} was not delivered.`);
          }
        } catch (error) {
          userAssignmentEmailSent = false;
          console.error(`Coach assignment email for user ${member.user_id} failed:`, error.message);
        }
      } else if (nextTrainer) {
        userAssignmentEmailSent = false;
        console.error(`Coach assignment email for user ${member.user_id} was not sent because no email address is configured.`);
      }

      try {
        await createNotification({
          audience: "user",
          recipientId: member.user_id,
          message: nextTrainer
            ? `${nextTrainer.full_name || "A new coach"} has been assigned to you.`
            : "Your coach assignment has been removed. Contact the gym if you need assistance.",
          notificationType: "coach_assignment",
          userName: memberName,
          targetUrl: "/user/coaches",
        });
      } catch (error) {
        console.error(`Member coach assignment notification failed for user ${member.user_id}:`, error.message);
      }
    }

    return res.json({
      message: trainerIdValue === null
        ? "Trainer removed successfully"
        : "Trainer assigned successfully",
      member: result.rows[0],
      ...(coachAssignmentEmailSent !== null
        ? { coach_assignment_email_sent: coachAssignmentEmailSent }
        : {}),
      ...(userAssignmentEmailSent !== null
        ? { user_assignment_email_sent: userAssignmentEmailSent }
        : {}),
    });

  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }
    console.error("❌ Error assigning trainer:", error);

    res.status(500).json({
      message: "Failed to assign trainer",
      error: error.message
    });
  } finally {
    client.release();
  }
};


// =====================================================
// CREATE MEMBER
// =====================================================
const createMember = async (req, res) => {
  return res.status(400).json({
    message: "Members are created through user registration."
  });
};

// =====================================================
// RECORD / UPDATE MEMBER MEMBERSHIP TERM
// =====================================================
const updateMemberMembership = async (req, res) => {
  try {
    const { id } = req.params;
    const { membership_months } = req.body;

    if (membership_months === null || membership_months === "") {
      const result = await pool.query(`
        UPDATE users
        SET membership_months = NULL,
            membership_start_date = NULL,
            membership_end_date = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
        RETURNING user_id, membership_months, membership_start_date, membership_end_date
      `, [id]);

      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, message: "Member not found." });
      }

      return res.json({ success: true, data: result.rows[0] });
    }

    const months = Number(membership_months);
    if (![1, 3, 6, 10, 12].includes(months)) {
      return res.status(400).json({
        success: false,
        message: "Choose a membership term of 1, 3, 6, 10, or 12 months.",
      });
    }

    const result = await pool.query(`
      UPDATE users
      SET membership_months = $1,
          membership_start_date = CASE
            WHEN membership_start_date IS NULL
              OR membership_end_date IS NULL
              OR membership_end_date < (NOW() AT TIME ZONE 'Asia/Manila')::date
              THEN (NOW() AT TIME ZONE 'Asia/Manila')::date
            ELSE membership_start_date
          END,
          membership_end_date = (
            CASE
              WHEN membership_start_date IS NULL
                OR membership_end_date IS NULL
                OR membership_end_date < (NOW() AT TIME ZONE 'Asia/Manila')::date
                THEN (NOW() AT TIME ZONE 'Asia/Manila')::date
              ELSE membership_start_date
            END
            + make_interval(months => $1) - INTERVAL '1 day'
          )::date,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2
      RETURNING user_id, membership_months, membership_start_date, membership_end_date
    `, [months, id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Member not found." });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("❌ Error updating member membership:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update member membership.",
      error: error.message,
    });
  }
};


// =====================================================
// UPDATE MEMBER
// =====================================================
const updateMember = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      first_name,
      last_name,
      email,
      phone,
      gender,
      birth_date,
      age,
      height,
      weight,
      fitness_goal,
      activity_level,
      target_weight,
      preferred_workout_time,
      status
    } = req.body;

    if (
      preferred_workout_time !== undefined &&
      preferred_workout_time !== null &&
      preferred_workout_time !== "" &&
      !["Morning", "Afternoon", "Evening", "Flexible"].includes(preferred_workout_time)
    ) {
      return res.status(400).json({
        success: false,
        message: "Choose Morning, Afternoon, Evening, or Flexible as the preferred workout time.",
      });
    }

    if (age !== undefined && age !== null && age !== "" && !validateAge(age)) {
      return res.status(400).json({
        success: false,
        message: "Age must be a whole number between 12 and 90.",
      });
    }

    // Whitelist the approval statuses the admin is allowed to assign here.
    const normalizedStatus =
      typeof status === "string" && ["Pending", "Active", "Inactive", "Rejected"].includes(status)
        ? status
        : null;
    const previousStatus = normalizedStatus === "Inactive"
      ? await pool.query("SELECT account_status FROM users WHERE user_id = $1", [id])
      : null;

    const result = await pool.query(
      `
      UPDATE users
      SET
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        email = COALESCE($3, email),
        phone = COALESCE($4, phone),
        gender = COALESCE($5, gender),
        birth_date = COALESCE($6, birth_date),
        age = COALESCE($7, age),
        height = COALESCE($8, height),
        weight = COALESCE($9, weight),
        fitness_goal = COALESCE($10, fitness_goal),
        activity_level = COALESCE($11, activity_level),
        target_weight = COALESCE($12, target_weight),
        preferred_workout_time = COALESCE($13, preferred_workout_time),
        account_status = COALESCE($14, account_status),
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $15
      RETURNING *
      `,
      [
        first_name,
        last_name,
        email,
        phone,
        gender,
        birth_date,
        age,
        height,
        weight,
        fitness_goal,
        activity_level,
        target_weight,
        preferred_workout_time,
        normalizedStatus,
        id
      ]
    );

    if (normalizedStatus) {
      await pool.query(
        "UPDATE members SET status = $1 WHERE email = (SELECT email FROM users WHERE user_id = $2)",
        [normalizedStatus, id]
      ).catch(() => {});
    }

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Member not found"
      });
    }

    if (
      normalizedStatus === "Inactive" &&
      String(previousStatus?.rows[0]?.account_status || "").toLowerCase() === "active"
    ) {
      const user = result.rows[0];
      await createNotification({
        audience: "user",
        recipientId: user.user_id,
        message: "Your membership has been deactivated by the gym administrator. Please contact the gym for assistance.",
        notificationType: "membership",
        userName: `${user.first_name || ""} ${user.last_name || ""}`.trim(),
        targetUrl: "/user/profile",
      }).catch((err) => {
        console.error("Membership deactivation notification failed:", err.message);
      });
    }

    res.json({
      message: "Member updated successfully",
      member: result.rows[0]
    });

  } catch (error) {
    console.error("❌ Error updating member:", error);

    res.status(500).json({
      message: "Failed to update member",
      error: error.message
    });
  }
};


// =====================================================
// APPROVE MEMBER
// =====================================================
const approveMember = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE users
      SET
        account_status = 'Active',
        membership_start_date = CASE
          WHEN membership_months IS NOT NULL
            AND (
              membership_start_date IS NULL
              OR membership_end_date IS NULL
              OR membership_end_date < (NOW() AT TIME ZONE 'Asia/Manila')::date
            )
            THEN (NOW() AT TIME ZONE 'Asia/Manila')::date
          ELSE membership_start_date
        END,
        membership_end_date = CASE
          WHEN membership_months IS NOT NULL
            AND (
              membership_start_date IS NULL
              OR membership_end_date IS NULL
              OR membership_end_date < (NOW() AT TIME ZONE 'Asia/Manila')::date
            )
            THEN (
              (NOW() AT TIME ZONE 'Asia/Manila')::date
              + make_interval(months => membership_months)
              - INTERVAL '1 day'
            )::date
          ELSE membership_end_date
        END,
        token_version = token_version + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING user_id, account_status, membership_start_date, membership_end_date,
                first_name, last_name, email
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Member not found"
      });
    }

    await pool.query(
      "UPDATE members SET status = 'Active' WHERE email = (SELECT email FROM users WHERE user_id = $1)",
      [id]
    ).catch(() => {});

    let emailSent = false;
    try {
      const delivery = await sendMemberAccountDecisionEmail({
        to: result.rows[0].email,
        memberName: `${result.rows[0].first_name || ""} ${result.rows[0].last_name || ""}`.trim(),
        approved: true,
      });
      emailSent = delivery.delivered;
    } catch (emailError) {
      console.error("Member approval email failed:", emailError.message);
    }

    res.json({
      message: "Member activated successfully",
      email_sent: emailSent,
      member: {
        user_id: result.rows[0].user_id,
        account_status: result.rows[0].account_status,
        membership_start_date: result.rows[0].membership_start_date,
        membership_end_date: result.rows[0].membership_end_date,
      },
    });

  } catch (error) {
    console.error("❌ Error approving member:", error);

    res.status(500).json({
      message: "Failed to approve member",
      error: error.message
    });
  }
};


// =====================================================
// REJECT MEMBER
// =====================================================
const rejectMember = async (req, res) => {
  try {
    const { id } = req.params;
    const previous = await pool.query(
      "SELECT account_status FROM users WHERE user_id = $1",
      [id]
    );

    const result = await pool.query(
      `
      UPDATE users
      SET
        account_status = 'Rejected',
        token_version = token_version + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING user_id, account_status, first_name, last_name, email
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Member not found"
      });
    }

    await pool.query(
      "UPDATE members SET status = 'Inactive' WHERE email = (SELECT email FROM users WHERE user_id = $1)",
      [id]
    ).catch(() => {});

    if (String(previous.rows[0]?.account_status || "").toLowerCase() === "active") {
      const user = result.rows[0];
      await createNotification({
        audience: "user",
        recipientId: user.user_id,
        message: "Your AveFit membership has been deactivated by the gym administrator. Please contact the gym for assistance.",
        notificationType: "membership",
        userName: `${user.first_name || ""} ${user.last_name || ""}`.trim(),
        targetUrl: "/user/profile",
      }).catch((err) => {
        console.error("Membership rejection notification failed:", err.message);
      });
    }

    let emailSent = false;
    try {
      const delivery = await sendMemberAccountDecisionEmail({
        to: result.rows[0].email,
        memberName: `${result.rows[0].first_name || ""} ${result.rows[0].last_name || ""}`.trim(),
        approved: false,
        deactivated: String(previous.rows[0]?.account_status || "").toLowerCase() === "active",
      });
      emailSent = delivery.delivered;
    } catch (emailError) {
      console.error("Member rejection email failed:", emailError.message);
    }

    res.json({
      message: "Member rejected successfully",
      email_sent: emailSent,
      member: {
        user_id: result.rows[0].user_id,
        account_status: result.rows[0].account_status,
        first_name: result.rows[0].first_name,
        last_name: result.rows[0].last_name,
      },
    });

  } catch (error) {
    console.error("❌ Error rejecting member:", error);

    res.status(500).json({
      message: "Failed to reject member",
      error: error.message
    });
  }
};


// =====================================================
// DELETE MEMBER
// =====================================================
const deleteMember = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    await client.query("BEGIN");

    const member = await client.query(
      "SELECT user_id, email FROM users WHERE user_id = $1 FOR UPDATE",
      [id]
    );

    if (member.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        message: "Member not found"
      });
    }

    await client.query(
      `DELETE FROM workout_sessions ws
       USING workout_plans wp
       WHERE ws.workout_plan_id = wp.workout_plan_id
         AND wp.user_id = $1`,
      [id]
    );
    await client.query("DELETE FROM workout_plans WHERE user_id = $1", [id]);
    await client.query("DELETE FROM meal_plans WHERE user_id = $1", [id]);
    await client.query("DELETE FROM notifications WHERE user_id = $1", [id]);
    await client.query("DELETE FROM predictions WHERE user_id = $1", [id]);
    await client.query("DELETE FROM progress_logs WHERE user_id = $1", [id]);
    await client.query("DELETE FROM recommendations WHERE user_id = $1", [id]);
    await client.query(
      "DELETE FROM members WHERE LOWER(email) = LOWER($1)",
      [member.rows[0].email]
    );
    await client.query("DELETE FROM users WHERE user_id = $1", [id]);

    await client.query("COMMIT");

    res.json({
      message: "Member and related records deleted successfully"
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Error deleting member:", error);

    res.status(500).json({
      message: "Failed to delete member and related records"
    });
  } finally {
    client.release();
  }
};


// =====================================================
// MEMBER PROGRESS
// =====================================================
const getMemberProgress = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT *
      FROM progress_logs
      WHERE user_id = $1
      ORDER BY log_date DESC
      `,
      [id]
    );

    res.json(result.rows);

  } catch (error) {
    console.error("❌ Error fetching progress:", error);

    res.status(500).json({
      message: "Failed to fetch member progress",
      error: error.message
    });
  }
};


module.exports = {
  getMembers,
  getMemberById,
  createMember,
  updateMember,
  updateMemberMembership,
  assignTrainer,
  approveMember,
  rejectMember,
  deleteMember,
  getMemberProgress
};