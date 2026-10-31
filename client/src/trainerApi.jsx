import axios from "axios";

const trainerApi = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api/trainers`
});

trainerApi.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("avefit_trainer_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default trainerApi;


// Expired/revoked sessions are removed immediately so the next protected
// navigation cannot keep using a stale credential.
trainerApi.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    if (status === 401 || status === 403) {
      sessionStorage.removeItem("avefit_trainer_token");
      localStorage.removeItem("avefit_trainer");
      if (status === 401 && !["/trainer/login", "/coach/login"].includes(window.location.pathname)) {
        window.location.replace("/coach/login");
      }
    }
    return Promise.reject(error);
  }
);
