import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as authApi from '../services/authApi';
import * as accountApi from '../services/accountApi';
import { clearToken } from '../services/tokenStorage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(() => {
    setIsLoading(true);
    return authApi
      .getCurrentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    refresh();
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

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
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

  const deleteAccount = useCallback(async (password) => {
    await accountApi.deleteAccount(password);
    // The server already revoked every Sanctum token for this account, so
    // just clear the now-invalid local token and drop back to logged-out
    // state - same end state as logout(), without calling /auth/logout
    // against an account that no longer exists.
    await clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, login, register, logout, refresh, updateProfile, uploadAvatar, changePassword, deleteAccount }}
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
