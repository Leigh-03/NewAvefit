const db = require("../db");

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ADMIN_LOGIN_PATH = "/api/admin/login";

const auditAdminActivity = (req, res, next) => {
  res.once("finish", () => {
    const requestPath = String(req.originalUrl || "").split("?")[0];
    const isAdminLogin = req.method === "POST" && requestPath === ADMIN_LOGIN_PATH;
    const adminId = req.admin?.admin_id || null;

    if (!isAdminLogin && (!adminId || !WRITE_METHODS.has(req.method))) return;

    db.query(
      `INSERT INTO admin_audit_logs
         (admin_id, event_type, request_method, request_path, status_code)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        adminId,
        isAdminLogin ? "admin_login" : "admin_action",
        req.method,
        requestPath.slice(0, 240),
        res.statusCode,
      ]
    ).catch((error) => {
      console.error("Unable to record admin activity:", error.message);
    });
  });

  next();
};

module.exports = auditAdminActivity;
