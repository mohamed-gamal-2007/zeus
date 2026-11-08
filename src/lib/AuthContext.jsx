import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "@/api/client";

/**
 * Session state for the SPA.
 *
 * A token lives in localStorage (see api/client.js). On mount we call
 * /api/auth/me once to turn it into a user object. Being anonymous is NOT an
 * error: public routes (landing, login, pricing, portfolios) must stay reachable,
 * so authError is only set for genuine failures.
 */
const FALLBACK = {
  user: null,
  isAuthenticated: false,
  isLoadingAuth: true,
  isLoadingPublicSettings: true,
  authChecked: false,
  authError: null,
  checkUserAuth: async () => null,
  navigateToLogin: () => {},
};

const AuthContext = createContext(FALLBACK);

function loginHref() {
  try {
    const { pathname, search } = window.location;
    if (/^\/(login|register|forgot-password|reset-password|auth\/callback)/.test(pathname)) {
      return "/login";
    }
    return `/login?returnTo=${encodeURIComponent(pathname + search)}`;
  } catch {
    return "/login";
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState(null);

  const navigateToLogin = useCallback(() => {
    window.location.href = loginHref();
  }, []);

  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const current = await api.auth.me();
      const nextUser = current && typeof current === "object" ? current : null;
      setUser(nextUser);
      setAuthError(null);
      return nextUser;
    } catch (err) {
      setUser(null);
      const status = err?.status;
      if (status === 404) {
        // Token is valid but no matching account row.
        setAuthError({ type: "user_not_registered", message: err?.message });
      } else if (status === 403) {
        // Suspended / pending accounts: surface the server's message.
        setAuthError({ type: "account_restricted", message: err?.message, status });
      }
      // 401 or no token at all = anonymous visitor, not an error.
      return null;
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const hasToken = await api.auth.isAuthenticated();
        if (cancelled) return;
        if (!hasToken) {
          setUser(null);
          setIsLoadingAuth(false);
          setAuthChecked(true);
          return;
        }
        await checkUserAuth();
      } catch {
        if (!cancelled) {
          setUser(null);
          setIsLoadingAuth(false);
          setAuthChecked(true);
        }
      } finally {
        if (!cancelled) setIsLoadingPublicSettings(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [checkUserAuth]);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isLoadingAuth,
      isLoadingPublicSettings,
      authChecked,
      authError,
      checkUserAuth,
      navigateToLogin,
    }),
    [
      user,
      isLoadingAuth,
      isLoadingPublicSettings,
      authChecked,
      authError,
      checkUserAuth,
      navigateToLogin,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export default AuthContext;
