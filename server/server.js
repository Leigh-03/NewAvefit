require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");

const { initializeDatabase, expireMemberships } = require("./db");
const {
  sendWeeklyBmiReminders,
  sendUnassignedWorkoutReminders,
} = require("./utils/notifications");

// Admin routes
const adminRoutes = require("./routes/adminRoutes");
const memberRoutes = require("./routes/memberRoutes");
const workoutRoutes = require("./routes/workoutRoutes");
const nutritionRoutes = require("./routes/nutritionRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const trainerRoutes = require("./routes/trainerRoutes");
const settingsRoutes = require("./routes/settingsRoutes");

// User routes
const userRoutes = require("./routes/userRoutes");
const userExerciseRoutes = require("./routes/userExerciseRoutes");

const app = express();
app.disable("x-powered-by");

// Keep CORS explicit instead of allowing every website to call the API.
const allowedOrigins = (
  process.env.CLIENT_ORIGINS ||
  "http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5178,http://localhost:5177,https://ave-fit.pages.dev"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("CORS origin not allowed"));
  },
}));

// Basic security headers without adding another runtime dependency.
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

// Profile photos are compressed to small data URLs by the client and validated again server-side.
app.use(express.json({ limit: "3mb" }));

app.get("/", (req, res) => res.send("AveFit API is running 🚀"));

// Admin API
app.use("/api/admin", adminRoutes);
app.use("/api/members", memberRoutes);
app.use("/api/workouts", workoutRoutes);
app.use("/api/nutrition", nutritionRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/trainers", trainerRoutes);
app.use("/api/settings", settingsRoutes);

// User API
app.use("/api/user", userRoutes);
app.use("/api/user/exercises", userExerciseRoutes);
app.use("/api/user/exercise-categories", userExerciseRoutes);

// Do not expose stack traces or database details to clients.
app.use((err, req, res, next) => {
  console.error("API error:", err.message);
  if (err.message === "CORS origin not allowed") {
    return res.status(403).json({ success: false, message: "Request origin is not allowed." });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ success: false, message: "Request is too large." });
  }
  res.status(500).json({ success: false, message: "Internal server error." });
});

const PORT = process.env.PORT || 5000;

// Network-level failures (DNS lookup, dropped Wi-Fi, laptop waking from sleep).
// These are temporary: the job simply runs again on its next interval.
const NETWORK_ERRORS = ["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ETIMEDOUT", "ECONNRESET"];
const lastNetworkWarning = {};

const runJob = (label, fn) => async () => {
  try {
    await fn();
    delete lastNetworkWarning[label];
  } catch (err) {
    if (NETWORK_ERRORS.includes(err.code)) {
      // Warn once per outage instead of every minute.
      if (!lastNetworkWarning[label]) {
        console.warn(`\u26a0\ufe0f ${label} skipped: database unreachable (${err.code}). Will retry automatically.`);
        lastNetworkWarning[label] = true;
      }
    } else {
      console.error(`\u274c ${label} failed:`, err.message);
    }
  }
};

const membershipJob = runJob("Membership expiry check", expireMemberships);
const bmiJob = runJob("Weekly BMI reminder check", sendWeeklyBmiReminders);
const workoutJob = runJob("No-workout reminder check", sendUnassignedWorkoutReminders);

initializeDatabase()
  .then(() => {
    setInterval(membershipJob, 60 * 1000).unref();
    setInterval(bmiJob, 60 * 60 * 1000).unref();
    setInterval(workoutJob, 60 * 60 * 1000).unref();
    bmiJob();
    workoutJob();
    app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("❌ Server startup aborted because database setup failed:", err.message);
    process.exit(1);
  });