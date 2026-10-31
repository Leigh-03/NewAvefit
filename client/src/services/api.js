import axios from "axios";

const API_URL = `${import.meta.env.VITE_API_URL}/api`;

// Attach JWT token to every request automatically
const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("avefit_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auth
export const loginAdmin = (email, password) =>
  api.post("/admin/login", { email, password });

// Members
export const getMembers = () => api.get("/members");
export const getMemberById = (id) => api.get(`/members/${id}`);
export const approveMember = (id) => api.put(`/members/${id}/approve`);
export const rejectMember = (id) => api.put(`/members/${id}/reject`);
export const assignMemberTrainer = (id, trainer_id) => api.put(`/members/${id}/trainer`, { trainer_id });

// Workouts
export const getWorkoutPlans = () => api.get("/workouts");
export const createWorkoutPlan = (data) => api.post("/workouts", data);

// Nutrition
export const getNutritionPlans = () => api.get("/nutrition");

export default api;

// Expired/revoked sessions are removed immediately so the next protected
// navigation cannot keep using a stale credential.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    if (status === 401 || status === 403) {
      sessionStorage.removeItem("avefit_token");
      localStorage.removeItem("avefit_admin");
      if (window.location.pathname !== "/login") {
        window.location.replace("/login");
      }
    }
    return Promise.reject(error);
  }
);
