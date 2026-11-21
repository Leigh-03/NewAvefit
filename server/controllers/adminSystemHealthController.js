const db = require("../db");

const getAdminSystemHealth = async (req, res) => {
  try {
    const [databaseResult, activityResult] = await Promise.all([
      db.query("SELECT CURRENT_TIMESTAMP AS checked_at"),
      db.query(
        `SELECT
           l.audit_id,
           l.admin_id,
           COALESCE(a.full_name, CASE WHEN l.admin_id IS NULL THEN NULL ELSE 'Admin' END) AS admin_name,
           l.event_type,
           l.request_method,
           l.request_path,
           l.status_code,
           l.created_at
         FROM admin_audit_logs l
         LEFT JOIN admins a ON a.admin_id = l.admin_id
         ORDER BY l.audit_id DESC
         LIMIT 50`
      ),
    ]);

    return res.json({
      success: true,
      data: {
        checked_at: databaseResult.rows[0].checked_at,
        service: {
          status: "healthy",
          uptime_seconds: Math.floor(process.uptime()),
        },
        database: {
          status: "connected",
          pool: {
            open: db.totalCount,
            idle: db.idleCount,
            waiting: db.waitingCount,
          },
        },
        backup: {
          status: "not_configured",
          message: "AveFit has no connected backup monitor. Automated backups and restore tests must be configured with the database hosting provider.",
        },
        maintenance: {
          status: "monitoring_only",
          message: "This page provides read-only monitoring. No maintenance mode or restore controls are configured.",
        },
        audit: {
          events: activityResult.rows,
        },
      },
    });
  } catch (error) {
    console.error("getAdminSystemHealth error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to load system health information.",
    });
  }
};

module.exports = { getAdminSystemHealth };
