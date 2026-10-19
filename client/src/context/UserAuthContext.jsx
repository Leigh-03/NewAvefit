import { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  getUserAuthToken,
  USER_REMEMBERED_EMAIL_KEY,
  USER_REMEMBER_ME_KEY,
  USER_TOKEN_KEY,
} from "./userAuthStorage";

const UserAuthContext = createContext(null);

export function UserAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let savedToken = sessionStorage.getItem(USER_TOKEN_KEY);
    const legacyToken = localStorage.getItem(USER_TOKEN_KEY);
    if (!savedToken && localStorage.getItem(USER_REMEMBER_ME_KEY) === "true") {
      savedToken = getUserAuthToken();
    }
    if (!savedToken && legacyToken) {
      savedToken = legacyToken;
      sessionStorage.setItem(USER_TOKEN_KEY, legacyToken);
      localStorage.removeItem(USER_TOKEN_KEY);
    }
    const savedUser = localStorage.getItem("avefit_user");
    if (savedToken && savedUser) {
      try { setToken(savedToken); setUser(JSON.parse(savedUser)); }
      catch {
        sessionStorage.removeItem(USER_TOKEN_KEY);
        localStorage.removeItem(USER_TOKEN_KEY);
        localStorage.removeItem("avefit_user");
      }
    }
    setLoading(false);
  }, []);

  const loginUser = (userData, userToken, rememberMe = localStorage.getItem(USER_REMEMBER_ME_KEY) === "true") => {
    setUser(userData);
    setToken(userToken);
    sessionStorage.setItem(USER_TOKEN_KEY, userToken);
    localStorage.setItem("avefit_user", JSON.stringify(userData));
    if (rememberMe) {
      localStorage.setItem(USER_REMEMBER_ME_KEY, "true");
      localStorage.setItem(USER_TOKEN_KEY, userToken);
      localStorage.setItem(USER_REMEMBERED_EMAIL_KEY, userData.email || "");
    } else {
      localStorage.removeItem(USER_REMEMBER_ME_KEY);
      localStorage.removeItem(USER_TOKEN_KEY);
      localStorage.removeItem(USER_REMEMBERED_EMAIL_KEY);
    }
  };

  // Patch the cached user object without a full re-login (e.g. after onboarding completes).
  const updateUser = useCallback((patch) => {
    setUser((prev) => {
      const next = { ...(prev || {}), ...patch };
      localStorage.setItem("avefit_user", JSON.stringify(next));
      return next;
    });
  }, []);

  const logoutUser = () => {
    setUser(null);
    setToken(null);
    sessionStorage.removeItem(USER_TOKEN_KEY);
    localStorage.removeItem("avefit_user");
    localStorage.removeItem(USER_TOKEN_KEY);
  };

  return (
    <UserAuthContext.Provider value={{ user, token, loading, loginUser, updateUser, logoutUser }}>
      {children}
    </UserAuthContext.Provider>
  );
}

export const useUserAuth = () => useContext(UserAuthContext);