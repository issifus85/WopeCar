// TEMPORARY - manual verification script for the Supabase auth cutover
// (services/supabaseAuthApi.js, contexts/AuthContext.js). Not imported by
// any real screen; wire up a one-off call to runAuthTest() (e.g. a useEffect
// in app/_layout.js) to exercise it, then remove that call and this file
// once the migration is confirmed working. Safe to delete at any time.
import * as authApi from './supabaseAuthApi';

const TEST_EMAIL = 'test@wopecar.com';
const TEST_PASSWORD = 'Test1234!';

export async function runAuthTest() {
  console.log('[authTest] starting...');

  try {
    console.log('[authTest] registering', TEST_EMAIL);
    const registered = await authApi.register({
      name: 'Test User',
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      phone: '0200000000',
      role: 'renter',
    });
    console.log('[authTest] register() result:', registered);
  } catch (e) {
    // Expected on any re-run after the first success - the account already
    // exists, so fall through to login instead of treating this as fatal.
    console.log('[authTest] register() failed (likely already exists):', e.message);
  }

  try {
    console.log('[authTest] logging in', TEST_EMAIL);
    const loggedIn = await authApi.login({ email: TEST_EMAIL, password: TEST_PASSWORD });
    console.log('[authTest] login() result:', loggedIn);
  } catch (e) {
    console.log('[authTest] login() FAILED:', e.message);
    return;
  }

  try {
    const profile = await authApi.getCurrentUser();
    console.log('[authTest] getCurrentUser() result:', profile);
  } catch (e) {
    console.log('[authTest] getCurrentUser() FAILED:', e.message);
    return;
  }

  console.log('[authTest] done - auth cutover looks functional.');
}
