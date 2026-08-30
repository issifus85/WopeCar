import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as authApi from '../services/supabaseAuthApi';
import supabase from '../services/supabase';
import { clearLocalUserData } from '../services/clearLocalUserData';
import { registerPushToken } from '../services/pushNotifications';
import { setCrashlyticsUser, logError } from '../services/analytics';

const AuthContext = createContext(null);

// getCurrentUser() calls supabase.auth.getUser() - a real network round-trip
// with no built-in timeout - so a single dropped request (poor
// connectivity, the app backgrounding mid-request) could otherwise leave
// this hanging forever: not rejecting (so .catch/.finally never run), just
// never settling. Since this gates the whole app's initial render, that
// would look exactly like a permanently stuck loading screen everywhere,
// not just here. 12s comfortably covers a slow mobile network without
// making a genuine failure feel broken.
function withTimeout(promise, fallback, ms = 12000) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(() => {
    setIsLoading(true);
    return withTimeout(authApi.getCurrentUser(), null)
      .then(setUser)
      .catch((e) => {
        logError(e, 'AuthContext: session restore failed');
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Registers this device's real Expo push token so notifyUser()/
  // broadcastNotification() (services/adminNotify.js, adminSettingsApi.js)
  // can actually reach it, not just write a `notifications` row the user
  // only sees if they happen to reopen the app - see pushNotifications.js.
  // Fires once per login (and once on cold start for an already-signed-in
  // session), not on every render - best-effort, never blocks anything.
  useEffect(() => {
    if (user?.id) registerPushToken();
  }, [user?.id]);

  // Same "once per real user id" shape as the push-token effect above -
  // tags every Crashlytics report from here on with the real user, so a
  // crash can be traced back to who hit it.
  useEffect(() => {
    if (user?.id) setCrashlyticsUser(user.id);
  }, [user?.id]);

  // Keeps the context in sync with the Supabase session automatically -
  // e.g. the token silently expiring/being revoked, or the session
  // changing from something outside a direct call on this context (a
  // second tab/device signing out, an OAuth redirect completing) - without
  // every caller needing to manually call refresh(). The first event fires
  // on mount for the session refresh() above already just handled, so it's
  // skipped to avoid a redundant double-fetch; TOKEN_REFRESHED is ignored
  // too since the token changed, not the profile.
  useEffect(() => {
    let isInitialEvent = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (isInitialEvent) {
        isInitialEvent = false;
        return;
      }
      if (event === 'SIGNED_OUT') {
        setUser(null);
        clearLocalUserData();
      } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        refresh();
      }
    });
    return () => subscription.unsubscribe();
  }, [refresh]);

  const login = useCallback(async (credentials) => {
    const loggedInUser = await authApi.login(credentials);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const register = useCallback(async (data) => {
    const newUser = await authApi.register(data);
    setUser(newUser);
    return newUser;
  }, []);

  // Same exposed name/signature as before the migration, so app/login.js's
  // call site doesn't need to change - now dispatches to Supabase's own
  // Google/Facebook sign-in (services/supabaseAuthApi.js) instead of the
  // retired Laravel OAuth (services/socialAuth.js).
  const loginWithSocial = useCallback(async (provider) => {
    const loggedInUser = provider === 'google'
      ? await authApi.loginWithGoogle()
      : await authApi.loginWithFacebook();
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    await clearLocalUserData();
  }, []);

  const updateProfile = useCallback(async (fields) => {
    const updatedUser = await authApi.updateProfile(fields);
    setUser(updatedUser);
    return updatedUser;
  }, []);

  const uploadAvatar = useCallback(async (uri) => {
    const updatedUser = await authApi.uploadAvatar(uri);
    setUser(updatedUser);
    return updatedUser;
  }, []);

  const changePassword = useCallback((fields) => authApi.changePassword(fields), []);

  const requestPasswordReset = useCallback((email) => authApi.requestPasswordReset(email), []);

  const setPasswordAfterRecovery = useCallback(async (newPassword, newPasswordConfirmation) => {
    await authApi.setPasswordAfterRecovery(newPassword, newPasswordConfirmation);
    await refresh();
  }, [refresh]);

  const deleteAccount = useCallback(async (password) => {
    // The delete-account Edge Function already deleted the auth user
    // (and signed this session out) server-side - just drop local state
    // to match, same end state as logout().
    await authApi.deleteAccount(password);
    setUser(null);
    await clearLocalUserData();
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, login, register, loginWithSocial, logout, refresh, updateProfile, uploadAvatar, changePassword, requestPasswordReset, setPasswordAfterRecovery, deleteAccount }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
