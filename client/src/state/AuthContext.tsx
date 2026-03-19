import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, setApiToken } from "../lib/api";
import type { User } from "../types";

type AuthContextValue = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (payload: { email: string; password: string }) => Promise<void>;
  register: (payload: {
    name: string;
    email: string;
    password: string;
  }) => Promise<void>;
  logout: () => void;
};

const storageKey = "syncdoc-auth";
const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      setLoading(false);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as { token: string; user: User };
      setToken(parsed.token);
      setUser(parsed.user);
      setApiToken(parsed.token);
    } catch {
      localStorage.removeItem(storageKey);
    } finally {
      setLoading(false);
    }
  }, []);

  const persistAuth = (nextToken: string, nextUser: User) => {
    localStorage.setItem(storageKey, JSON.stringify({ token: nextToken, user: nextUser }));
    setApiToken(nextToken);
    setToken(nextToken);
    setUser(nextUser);
  };

  const login = async (payload: { email: string; password: string }) => {
    const { data } = await api.post("/auth/login", payload);
    persistAuth(data.token, data.user);
  };

  const register = async (payload: {
    name: string;
    email: string;
    password: string;
  }) => {
    const { data } = await api.post("/auth/register", payload);
    persistAuth(data.token, data.user);
  };

  const logout = () => {
    localStorage.removeItem(storageKey);
    setApiToken(null);
    setToken(null);
    setUser(null);
  };

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      login,
      register,
      logout,
    }),
    [user, token, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
};
