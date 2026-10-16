const pool = require("../db");
const { validateEmail } = require("../utils/security");
const { getConfiguredAdminEmail } = require("../utils/adminAccess");
const { isMailConfigured, sendMemberFeedbackEmail } = require("../utils/mailer");

const submitMemberFeedback = async (req, res) => {
  const rating = Number(req.body?.rating);
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ success: false, message: "Choose a rating from 1 to 5 stars." });
  }
  if (!message || message.length > 5000) {
    return res.status(400).json({ success: false, message: "Feedback must contain 1 to 5000 characters." });
  }

  const adminEmail = getConfiguredAdminEmail();
  if (!adminEmail) {
    return res.status(503).json({ success: false, message: "Feedback email is unavailable because the admin email is not configured on the server." });
  }
  if (!isMailConfigured()) {
    return res.status(503).json({ success: false, message: "Feedback email is unavailable because SMTP is not configured on the server." });
  }

  try {
    const result = await pool.query(
      "SELECT first_name, last_name, email FROM users WHERE user_id = $1",
      [req.user.user_id]
    );
    const user = result.rows[0];
    if (!user || !validateEmail(user.email)) {
      return res.status(404).json({ success: false, message: "Your account details could not be loaded to send feedback." });
    }

    const memberName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || "AveFit member";
    await sendMemberFeedbackEmail({
      to: adminEmail,
      memberName,
      memberEmail: user.email,
      rating,
      message,
    });
    return res.json({ success: true, message: "Thank you. Your feedback has been emailed to the gym admin." });
  } catch (error) {
    console.error("submitMemberFeedback error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to email your feedback right now. Please try again later." });
  }
};

module.exports = { submitMemberFeedback };
