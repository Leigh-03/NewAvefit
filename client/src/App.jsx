import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { UserAuthProvider } from "./context/UserAuthContext";
import { getUserAuthToken } from "./context/userAuthStorage";
import { TrainerAuthProvider } from "./context/TrainerAuthContext";
import { ThemeProvider } from "./context/ThemeContext";

// Admin
import DashboardLayout from "./layouts/DashboardLayout";
import Login from "./pages/Login";
import AdminResetPassword from "./pages/AdminResetPassword";
import Dashboard from "./pages/Dashboard";
import Members from "./pages/Members";
import Trainers from "./pages/Trainers";
import Workouts from "./pages/Workouts";
import Nutrition from "./pages/Nutrition";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";
import Notifications from "./pages/Notifications";

// User
import Homepage from "./pages/Homepage";
import UserLogin from "./pages/UserLogin";
import PendingApproval from "./pages/PendingApproval";
import VerifyEmail from "./pages/VerifyEmail";
import ResetPassword from "./pages/ResetPassword";
import Assessment from "./pages/Assessment";
import GoalSetup from "./pages/GoalSetup";
import HealthConditions from "./pages/HealthConditions";
import Availability from "./pages/Availability";
import CoachSelect from "./pages/CoachSelect";
import SetupConfirmation from "./pages/SetupConfirmation";
import UserLayout from "./pages/UserLayout";
import WorkoutPage from "./pages/WorkoutPage";
import ProgressPage from "./pages/ProgressPage";
import ExerciseLibrary from "./pages/ExerciseLibrary";
import AboutUs from "./pages/AboutUs";
import ProfilePage from "./pages/ProfilePage";
import Coaches from "./pages/Coaches";

// Trainer Portal
import TrainerLogin from "./pages/TrainerLogin";
import TrainerLayout from "./pages/TrainerLayout";
import TrainerDashboard from "./pages/TrainerDashboard";
import TrainerProfile from "./pages/TrainerProfile";
import TrainerWorkoutPlans from "./pages/TrainerWorkoutPlans";
import TrainerExercises from "./pages/TrainerExercises";
import TrainerAvailability from "./pages/TrainerAvailability";

const getTokenExpiration = (token) => {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")));
    return Number(decoded.exp) * 1000;
  } catch {
    return 0;
  }
};

function AdminProtectedRoute({ children }) {
  const navigate = useNavigate();
  const token = sessionStorage.getItem("avefit_token");
  const expiresAt = token ? getTokenExpiration(token) : 0;

  useEffect(() => {
    if (!token || !expiresAt) return undefined;
    const remaining = expiresAt - Date.now();
    const timer = window.setTimeout(() => {
      sessionStorage.removeItem("avefit_token");
      navigate("/login", { replace: true });
    }, Math.max(remaining, 0));
    return () => window.clearTimeout(timer);
  }, [expiresAt, navigate, token]);

  if (!token || expiresAt <= Date.now()) {
    sessionStorage.removeItem("avefit_token");
    return <Navigate to="/login" replace />;
  }
  return children;
}

function UserProtectedRoute({ children }) {
  const location = useLocation();
  const token = getUserAuthToken();
  if (!token) return <Navigate to="/user/login" state={{ from: location }} replace />;
  const savedUser = JSON.parse(localStorage.getItem("avefit_user") || "null");
  if (savedUser?.account_status && savedUser.account_status !== "Active") {
    return <Navigate to="/user/pending" replace />;
  }
  if (savedUser?.setup_completed) return <Navigate to="/user/profile" replace />;
  return children;
}

// Guards the post-onboarding dashboard routes: bounces anyone who hasn't
// finished the assessment/goal/availability/coach flow back into it.
function DashboardProtectedRoute({ children }) {
  const location = useLocation();
  const token = getUserAuthToken();
  if (!token) return <Navigate to="/user/login" state={{ from: location }} replace />;
  const savedUser = JSON.parse(localStorage.getItem("avefit_user") || "null");
  if (savedUser?.account_status && savedUser.account_status !== "Active") return <Navigate to="/user/pending" replace />;
  if (savedUser && !savedUser.setup_completed) return <Navigate to="/user/assessment" replace />;
  return children;
}

function TrainerProtectedRoute({ children }) {
  const token = sessionStorage.getItem("avefit_trainer_token");
  if (!token) return <Navigate to="/trainer/login" replace />;
  const savedTrainer = JSON.parse(localStorage.getItem("avefit_trainer") || "null");
  if (savedTrainer?.status && savedTrainer.status !== "Active") return <Navigate to="/trainer/login" replace />;
  return children;
}

export default function App() {
  return (
    <ThemeProvider>
    <UserAuthProvider>
    <TrainerAuthProvider>
      <Routes>
        {/* Public homepage */}
        <Route path="/" element={<Homepage />} />

        {/* Admin Portal */}
        <Route path="/login" element={<Login />} />
        <Route path="/admin/reset-password" element={<AdminResetPassword />} />
        <Route
          path="/admin/*"
          element={
            <AdminProtectedRoute>
              <DashboardLayout>
                <Routes>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/members" element={<Members />} />
                  <Route path="/trainers" element={<Trainers />} />
                  <Route path="/workouts" element={<Workouts />} />
                  <Route path="/nutrition" element={<Nutrition />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
                </Routes>
              </DashboardLayout>
            </AdminProtectedRoute>
          }
        />

        {/* Trainer Portal */}
        <Route path="/trainer/login" element={<TrainerLogin />} />
        <Route
          path="/trainer/*"
          element={
            <TrainerProtectedRoute>
              <TrainerLayout>
                <Routes>
                  <Route path="/roster" element={<TrainerDashboard />} />
                  <Route path="/workout-plans" element={<TrainerWorkoutPlans />} />
                  <Route path="/availability" element={<TrainerAvailability />} />
                  <Route path="/exercises" element={<TrainerExercises />} />
                  <Route path="/notifications" element={<Notifications audience="trainer" />} />
                  <Route path="/profile" element={<TrainerProfile />} />
                  <Route path="*" element={<Navigate to="/trainer/roster" replace />} />
                </Routes>
              </TrainerLayout>
            </TrainerProtectedRoute>
          }
        />

        {/* User Onboarding (no layout) */}
        <Route path="/user/login" element={<UserLogin />} />
        <Route path="/user/pending" element={<PendingApproval />} />
        <Route path="/user/verify-email" element={<VerifyEmail />} />
        <Route path="/user/reset-password" element={<ResetPassword />} />
        <Route path="/user/assessment" element={<UserProtectedRoute><Assessment /></UserProtectedRoute>} />
        <Route path="/user/goal" element={<UserProtectedRoute><GoalSetup /></UserProtectedRoute>} />
        <Route path="/user/health" element={<UserProtectedRoute><HealthConditions /></UserProtectedRoute>} />
        <Route path="/user/availability" element={<UserProtectedRoute><Availability /></UserProtectedRoute>} />
        <Route path="/user/coach" element={<UserProtectedRoute><CoachSelect /></UserProtectedRoute>} />
        <Route path="/user/confirm" element={<UserProtectedRoute><SetupConfirmation /></UserProtectedRoute>} />

        {/* User Portal (with bottom nav layout) */}
        <Route
          path="/user/*"
          element={
            <DashboardProtectedRoute>
              <UserLayout>
                <Routes>
                  <Route path="/workout" element={<WorkoutPage />} />
                  <Route path="/progress" element={<ProgressPage />} />
                  <Route path="/exercises" element={<ExerciseLibrary />} />
                  <Route path="/coaches" element={<Coaches />} />
                  <Route path="/about" element={<AboutUs />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="/notifications" element={<Notifications audience="user" />} />
                  <Route path="*" element={<Navigate to="/user/workout" replace />} />
                </Routes>
              </UserLayout>
            </DashboardProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </TrainerAuthProvider>
    </UserAuthProvider>
    </ThemeProvider>
  );
}