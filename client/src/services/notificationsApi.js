import axios from "axios";
import { getUserAuthToken } from "../context/userAuthStorage";

const apiRoot = `${import.meta.env.VITE_API_URL}/api/notifications`;

export const createNotificationsApi = (audience) => {
  const client = axios.create({ baseURL: `${apiRoot}/${audience}` });
  client.interceptors.request.use((config) => {
    const token = audience === "admin"
      ? sessionStorage.getItem("avefit_token")
      : audience === "trainer"
        ? sessionStorage.getItem("avefit_trainer_token")
        : getUserAuthToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
  return client;
};
