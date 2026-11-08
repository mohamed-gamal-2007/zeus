import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "@/api/client";

/**
 * The current user's LearningProfile (a single row per user).
 *
 * Consumers read `profile` fields directly (goal, onboarding_step, dna, ...)
 * and write through updateProfile(patch) / createProfile(data).
 */
const ProfileContext = createContext({
  profile: null,
  loading: false,
  createProfile: async () => null,
  updateProfile: async () => null,
  refreshProfile: async () => null,
});

export function ProfileProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Keep a ref in sync so updateProfile never works from a stale closure.
  const profileRef = useRef(null);
  const commit = useCallback((next) => {
    profileRef.current = next;
    setProfile(next);
  }, []);

  const refreshProfile = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.entities.LearningProfile.filter({}, "-created_date", 1);
      const current = Array.isArray(rows) && rows.length ? rows[0] : null;
      commit(current);
      return current;
    } catch {
      commit(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [commit]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const createProfile = useCallback(
    async (data = {}) => {
      const created = await api.entities.LearningProfile.create(data);
      const next = created && typeof created === "object" ? created : null;
      commit(next);
      return next;
    },
    [commit]
  );

  const updateProfile = useCallback(
    async (patch = {}) => {
      const current = profileRef.current;
      // Fresh account with no row yet: create instead of throwing.
      if (!current?.id) return createProfile(patch);

      const updated = await api.entities.LearningProfile.update(current.id, patch);
      const next =
        updated && typeof updated === "object"
          ? { ...current, ...updated }
          : { ...current, ...patch };
      commit(next);
      return next;
    },
    [commit, createProfile]
  );

  const value = useMemo(
    () => ({ profile, loading, createProfile, updateProfile, refreshProfile }),
    [profile, loading, createProfile, updateProfile, refreshProfile]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  return useContext(ProfileContext);
}

export default ProfileContext;
