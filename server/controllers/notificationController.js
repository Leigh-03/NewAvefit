const pool = require("../db");

const getNotifications = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT notification_id, message, is_read, created_at, notification_type,
              related_user_name AS user_name, target_url
       FROM app_notifications
       WHERE audience_type = $1 AND recipient_id = $2
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.notificationAudience, req.notificationRecipientId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("getNotifications error:", err.message);
    res.status(500).json({ success: false, message: "Unable to load notifications." });
  }
};

const getUnreadCount = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) AS count FROM app_notifications
       WHERE audience_type = $1 AND recipient_id = $2 AND is_read = false`,
      [req.notificationAudience, req.notificationRecipientId]
    );
    res.json({ success: true, count: Number(result.rows[0].count) });
  } catch (err) {
    console.error("getUnreadCount error:", err.message);
    res.status(500).json({ success: false, message: "Unable to load unread notifications." });
  }
};

const markAsRead = async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE app_notifications SET is_read = true
       WHERE notification_id = $1 AND audience_type = $2 AND recipient_id = $3
       RETURNING notification_id`,
      [req.params.id, req.notificationAudience, req.notificationRecipientId]
    );
    if (!result.rowCount) {
      return res.status(404).json({ success: false, message: "Notification not found." });
    }
    res.json({ success: true, message: "Marked as read." });
  } catch (err) {
    console.error("markAsRead error:", err.message);
    res.status(500).json({ success: false, message: "Unable to mark notification as read." });
  }
};

const markAllAsRead = async (req, res) => {
  try {
    await pool.query(
      `UPDATE app_notifications SET is_read = true
       WHERE audience_type = $1 AND recipient_id = $2 AND is_read = false`,
      [req.notificationAudience, req.notificationRecipientId]
    );
    res.json({ success: true, message: "All marked as read." });
  } catch (err) {
    console.error("markAllAsRead error:", err.message);
    res.status(500).json({ success: false, message: "Unable to mark notifications as read." });
  }
};

const deleteNotification = async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM app_notifications
       WHERE notification_id = $1 AND audience_type = $2 AND recipient_id = $3
       RETURNING notification_id`,
      [req.params.id, req.notificationAudience, req.notificationRecipientId]
    );
    if (!result.rowCount) {
      return res.status(404).json({ success: false, message: "Notification not found." });
    }
    res.json({ success: true, message: "Notification deleted." });
  } catch (err) {
    console.error("deleteNotification error:", err.message);
    res.status(500).json({ success: false, message: "Unable to delete notification." });
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};
