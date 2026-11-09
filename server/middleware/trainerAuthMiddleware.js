const jwt = require("jsonwebtoken");
const pool = require("../db");

const verifyTrainer = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token)
    return res.status(401).json({ success: false, message: "Access denied. No token." });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.trainer_id) {
      return res.status(403).json({ success: false, message: "Invalid trainer token." });
    }
    const result = await pool.query("SELECT trainer_id, status, token_version FROM trainers WHERE trainer_id = $1", [decoded.trainer_id]);
    if (!result.rows.length) return res.status(401).json({ success: false, message: "Trainer account not found." });
    const trainer = result.rows[0];
    const normalizedStatus = String(trainer.status || "Pending").trim().toLowerCase();
    if (normalizedStatus !== "active") return res.status(403).json({ success: false, status: trainer.status || "Pending", message: normalizedStatus === "rejected" ? "Your trainer account was rejected." : "Your trainer account is not active." });
    if (Number(decoded.token_version ?? -1) !== Number(trainer.token_version ?? 0)) return res.status(401).json({ success: false, message: "Your trainer session is no longer valid. Please log in again." });
    req.trainer = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, message: "Invalid or expired token." });
  }
};

module.exports = verifyTrainer;
