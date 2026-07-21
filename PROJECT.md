# WopeCar — Project Reference & Replication Guide

**Status:** Living document. Update this file whenever a feature, screen, context, service, or business rule is added or changed.

**Purpose of this doc (two jobs at once):**
1. **Reference** — so any agent picking up this repo can understand the architecture, conventions, and current feature set before making changes.
2. **Replication spec** — detailed enough that an agent starting from an empty folder could rebuild an equivalent app, following the phases in [Section 4](#4-replication-build-order).

If you are an agent about to make a change: read Section 3 (Architecture & Conventions) and the relevant part of Section 6 (Feature Inventory) first. Section 10 (Index) is the fast lookup table — use it to find exact file paths before grepping the repo.

---

## 1. What WopeCar Is

WopeCar is a car-rental marketplace app for Ghana (self-drive or chauffeured), similar in shape to Turo/Avis. Users search cars, book a rental (dates, add-ons, documents, payment), manage bookings, and maintain a profile. It has:
- A **client app** — this repo, Expo/React Native, targets iOS/Android/Web from one codebase.
- A **backend** — a Laravel app at `~/wopecar-backend` (NOT this repo, NOT under git — a local checkout the user manually re-uploads to preprod hosting via cPanel File Manager after backend edits). See [Section 8](#8-backend-summary).

Live reference site: `wopecar.com`. Preprod API the app talks to: `https://wopecarpreprod.com/api`.

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Framework | Expo SDK ~54, React Native 0.81, React 19 |
| Routing | **Expo Router** (file-based, `app/` directory) — see `docs.expo.dev/versions/v54.0.0/` per this repo's `AGENTS.md` |
| Web target | `react-native-web` (the app is tested primarily via a browser preview during development) |
| Fonts | `@expo-google-fonts/source-sans-3` + two custom display fonts (`DanburyCaps`, `DanburySmall`) loaded via `expo-font` |
| Icons | `@expo/vector-icons` (Ionicons) |
| Local persistence | `expo-secure-store` on native, `window.localStorage` on web (see the storage-service pattern in [6.2](#62-local-persistence-pattern-context--storage-service)) |
| Auth transport | Laravel Sanctum bearer tokens, stored via `services/tokenStorage.js` |
| Payments | Paystack hosted checkout (`expo-web-browser` on native, custom popup handling on web) |
| Image picking | `expo-image-picker` (avatar upload) |
| Deep linking | `expo-linking` (Paystack return callback, `scheme: "wopecar"`) |
| Backend | Laravel (custom multi-module architecture, not a published starter kit) |

No state management library (Redux/Zustand/etc.) — all shared state is plain React Context, one per domain. No test framework is set up; verification is done by running the app in a browser preview and exercising the flow (see [Section 11](#11-verification-approach)).

---

## 3. Architecture & Conventions

### 3.1 Folder structure

```
app/                    Expo Router screens (file path = route path)
  (tabs)/                Tab bar group: index, favorites, bookings, cart, profile
  checkout/               6-step checkout flow (dates, details, addons, summary, form, payment)
  settings/               Settings hub + sub-screens (index, about, help-centre, safety-centre)
  car/[id].js             Car detail (dynamic route)
  booking/[id].js          Booking detail + modify/cancel (dynamic route)
  _layout.js               Root Stack: registers non-tab screens, wraps tree in all Providers
  account.js, login.js, terms.js, privacy.js, inbox.js, documents.js, payment-callback.js
components/              Reusable presentational + modal components (no routing)
contexts/                React Context providers — one per domain, each paired with a services/*Storage.js
services/                API clients + local-storage persistence modules (no React)
constants/               theme.js (colors/fonts), pricing.js (business-rule numbers)
```

### 3.2 Routing conventions (Expo Router)

- A file `app/foo.js` → route `/foo`. A folder `app/foo/index.js` → also `/foo`, with siblings `app/foo/bar.js` → `/foo/bar`.
- **Never have both `app/foo.js` and `app/foo/*.js`** — they collide. When a route needs sub-screens, convert `foo.js` → `foo/index.js` first (this is exactly what happened when Settings grew sub-screens — see `git log` for that commit).
- `app/_layout.js` sets `screenOptions={{ headerShown: false }}` on the root `Stack` by default. Screens that want a native header opt in per-screen:
  ```jsx
  <Stack.Screen
    name="settings/index"
    options={{
      headerShown: true,
      title: 'Settings',
      headerBackTitle: 'Settings',   // see 3.3 below
      headerTintColor: COLORS.navy,
      headerTitleStyle: { fontFamily: FONTS.semiBold },
    }}
  />
  ```
- Screens that don't opt in (the checkout/* flow, car/[id], booking/[id]'s header is opted in) render their own in-screen header component instead (e.g. `CheckoutHeader`).

### 3.3 Back-button label convention (`headerBackTitle`)

**Confirmed empirically in this codebase:** `headerBackTitle` set in a screen's own `Stack.Screen` options controls **that screen's own** back-button label — not, as React Navigation docs might suggest, the label shown on screens pushed *after* it. So to make screen X's back button read "Settings", set `headerBackTitle: 'Settings'` on **X's own** `Stack.Screen` entry in `_layout.js`. Verify with the browser MCP tools via `read_page` — the accessible name will read like `link "Settings, back"`.

Every new screen with a native header must set this explicitly, or it'll fall back to an unhelpful default like `"(tabs)"`.

### 3.4 Local persistence pattern

Any piece of app state that must survive a reload but doesn't belong on the server yet follows this exact two-file pattern — see [6.2](#62-local-persistence-pattern-context--storage-service). Do not introduce AsyncStorage or a different storage lib; stay consistent with the `expo-secure-store` / `window.localStorage` split already used everywhere.

### 3.5 Styling conventions

- No CSS-in-JS library, no NativeWind/Tailwind — plain `StyleSheet.create`, but **not called at module scope** — every screen/component wraps it in `function createStyles(colors) { return StyleSheet.create({...}); }` and calls it via `const styles = useMemo(() => createStyles(colors), [colors]);` inside the component, so styles re-derive when the theme flips. See [6.9](#69-dark-theme--themecontext).
- Colors and fonts always come from `constants/theme.js` — brand-fixed accents via `COLORS.*` (`teal`/`orange`/`mauve`/`navy`, constant across themes) and everything else via the `colors` object from `useAppTheme()` (`colors.textPrimary`, `colors.surface`, `colors.border`, etc.) — never hardcoded hex/font-family strings in a screen. Small deliberate exceptions kept as literals across both themes: decorative drive-type badge tints, the Paystack brand blue badge, star-rating gold, photo-overlay buttons on Car Detail, the booked-date pink indicator in `checkout/dates.js`.
- Money always formatted via `formatCurrency()` from `constants/pricing.js`, never templated by hand.
- Modals are `react-native` `Modal` + `Pressable` backdrop, **not** `Alert.alert()` — `Alert.alert()` renders no UI at all on React Native Web, confirmed by testing. See `components/ConfirmModal.js`.

### 3.6 Commit convention

Every commit that changes app behavior ends with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Commit messages explain *why*, not just *what* (see `git log` for the established tone/format).

---

## 4. Replication Build Order

If rebuilding from an empty folder, this is the order it was actually built in, condensed into phases. Each phase should be a working, committed state before moving to the next.

**Phase 1 — Scaffold & routing**
1. `npx create-expo-app` (or install `expo`, `expo-router`, `react-native-screens`, `react-native-safe-area-context`, `react-native-web`, `react-dom`), set `"main": "expo-router/entry"` in `package.json`, add `"expo-router"` to `app.json`'s `plugins`, set `scheme` for deep linking.
2. Create `app/_layout.js` with a root `Stack`, `app/(tabs)/_layout.js` with a `Tabs` navigator, and stub tab screens (Search/Favorites/Bookings/Cart/Profile).
3. Create `app/car/[id].js` as a dynamic route stub.

**Phase 2 — Branding**
4. Install `@expo-google-fonts/source-sans-3` + `expo-font`; add custom display font `.otf` files under `assets/fonts/`.
5. Create `constants/theme.js` (`COLORS`, `FONTS`). Load fonts in `_layout.js` behind a loading gate (`useFonts` + `SplashScreen.preventAutoHideAsync()` / `hideAsync()`).
6. Apply theme across all screens; build the branded Home header (logo lockup).

**Phase 3 — Auth**
7. Create `services/api.js` (fetch wrapper with base URL + bearer token injection + `ApiError`), `services/tokenStorage.js`.
8. Create `services/authApi.js` (register/login/logout/getCurrentUser/updateProfile/uploadAvatar, with a `normalizeUser` adapter for the API's snake_case shape).
9. Create `contexts/AuthContext.js`, wrap root layout, build `app/login.js`, wire `app/(tabs)/profile.js` to show signed-in vs signed-out state.

**Phase 4 — Car listing & detail from the real API**
10. Create `services/carsApi.js` (`fetchCars`, `fetchCarById`, `fetchCarAvailability`, `formatDateParam`, `normalizeCar` adapter).
11. Wire Home (`app/(tabs)/index.js`) and Car Detail (`app/car/[id].js`) to it.

**Phase 5 — Search & car-detail redesign**
12. Add date-range availability filtering: `components/DateRangeModal.js` (custom calendar, no external date-picker lib).
13. Add `components/FilterModal.js`, `components/SortModal.js`, list/tile view toggle: `components/CarListCard.js` + `components/CarTileCard.js` + `components/ImageGallery.js`.
14. Redesign Car Detail with `components/SectionHeading.js`, `FeaturesSection.js`, `ReviewsSection.js`, `FaqSection.js`, `CarOwnerCard.js`, `BookingChoiceModal.js`.

**Phase 6 — Checkout flow**
15. Create `contexts/CartContext.js` + `services/cartStorage.js`, `contexts/CheckoutContext.js` (draft object, no persistence — intentionally reset per session).
16. Build the 6 checkout screens in `app/checkout/` (see [6.5](#65-checkout-6-step-flow)), `components/CheckoutHeader.js`, `components/CheckoutFooterButton.js`.
17. Create `services/paystackApi.js` + `services/paystackCheckout.js` for the hosted-checkout payment flow ([6.6](#66-paystack-payment-flow)). Add the backend bridge route ([8.4](#84-the-paystack-callback-bridge-a-client-driven-backend-change)).

**Phase 7 — Bookings**
18. Create `contexts/BookingsContext.js` + `services/bookingsStorage.js` (bookings are **local-only** — no backend booking API exists; see [9](#9-known-gaps--deferred-work)).
19. Build `app/(tabs)/bookings.js` (status-grouped list) and `app/booking/[id].js` (view/modify/cancel state machine, [6.7](#67-booking-detailmodify-state-machine)).

**Phase 8 — Business rules**
20. Create `constants/pricing.js` (delivery fee, security deposit, minimum booking days — see [7](#7-business-rules--constants-reference)) and thread it through checkout summary + booking modification.
21. Add Sunday-blocking to every date picker, extend time slots, enforce minimum booking length.

**Phase 9 — Settings**
22. Create `contexts/SettingsContext.js` + `services/settingsStorage.js`.
23. Create `components/OptionPickerModal.js`, extend `components/ConfirmModal.js` with a single-button "info" mode.
24. Build `app/settings/index.js` (9 categories, ~50 rows) + `app/settings/about.js`, `help-centre.js` (real FAQ content pulled from wopecar.com/faq), `safety-centre.js`. See [6.8](#68-settings).

---

## 5. Design System

`constants/theme.js` exports brand-fixed `COLORS` (unchanged across themes) plus `LIGHT_COLORS`/`DARK_COLORS` (semantic tokens that flip):
```js
export const COLORS = {
  navy: '#154B59', teal: '#3EB6BA', orange: '#D07E5A', mauve: '#B8826F',
  background: '#f5f5f5', white: '#ffffff', textMuted: '#666666',
};

export const LIGHT_COLORS = {
  ...COLORS, background: '#f5f5f5', surface: '#ffffff', textPrimary: COLORS.navy,
  textBody: '#444444', textMuted: '#666666', textSubtle: '#999999',
  border: '#e5e5e5', divider: '#f0f0f0', disabled: '#cccccc', highlight: '#EEF9F9',
  white: '#ffffff', black: '#000000', error: '#C62828', errorBg: '#FFEBEE',
  success: '#2E7D32', successBg: '#E8F5E9', warning: '#E65100', warningBg: '#FFF3E0',
  shadow: '#000000',
};

export const DARK_COLORS = {
  ...COLORS, background: '#12181A', surface: '#1E2A2D', textPrimary: '#F2F7F7',
  textBody: '#D7E2E2', textMuted: '#A3B5B6', textSubtle: '#7E9294',
  border: '#2C3B3E', divider: '#243134', disabled: '#4B5C5E', highlight: '#133A3C',
  white: '#ffffff', black: '#000000', error: '#FF7A7A', errorBg: '#3B1519',
  success: '#7BD88A', successBg: '#123821', warning: '#FFB86B', warningBg: '#3D2A0C',
  shadow: '#000000',
};

export const FONTS = {
  light: 'SourceSans3_300Light',
  regular: 'SourceSans3_400Regular',
  medium: 'SourceSans3_500Medium',
  semiBold: 'SourceSans3_600SemiBold',
  bold: 'SourceSans3_700Bold',
  display: 'DanburyCaps',
};
```
`FONTS` is theme-independent and imported directly. `COLORS` is only imported directly for the handful of literal-across-themes uses (e.g. `login.js`'s teal overlay tint and orange submit button) — everywhere else, screens read `colors.*` from `useAppTheme()`. See [6.9](#69-dark-theme--themecontext) for the full token-mapping convention and the component pattern.

---

## 6. Core Reusable Patterns

### 6.1 API service layer

`services/api.js` is the single `fetch` wrapper every API-backed service module uses:
```js
export async function request(path, { method = 'GET', body, auth = false } = {}) {
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers = { Accept: 'application/json' };
  if (!isFormData) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method, headers,
    body: isFormData ? body : (body ? JSON.stringify(body) : undefined),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(json?.message || `Request failed (${response.status})`, response.status, json?.errors);
  return json;
}
```
Every `services/*Api.js` module (`authApi.js`, `carsApi.js`, `paystackApi.js`) imports `request` and adds a `normalize*` function to adapt the API's snake_case shape to the camelCase shape screens expect. **Never call `fetch` directly from a screen or context — always go through a service module.**

### 6.2 Local persistence pattern (Context + Storage service)

Used **4 times** in this codebase — reuse it verbatim for any new locally-persisted state:

**Storage half** (`services/favoritesStorage.js`, the canonical example):
```js
const FAVORITES_KEY = 'wopecar_favorite_cars';

async function readRaw() {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' ? window.localStorage.getItem(FAVORITES_KEY) : null;
  }
  return SecureStore.getItemAsync(FAVORITES_KEY);
}
async function writeRaw(value) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.setItem(FAVORITES_KEY, value);
    return;
  }
  return SecureStore.setItemAsync(FAVORITES_KEY, value);
}
export async function getFavoriteIds() {
  try { const raw = await readRaw(); const ids = raw ? JSON.parse(raw) : []; return Array.isArray(ids) ? ids : []; }
  catch { return []; }
}
export async function setFavoriteIds(ids) { await writeRaw(JSON.stringify(ids)); }
```

**Context half** (`contexts/BookingsContext.js`, a slightly richer example with update/mutate helpers):
```js
export function BookingsProvider({ children }) {
  const [bookings, setBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    bookingsStorage.getBookings().then(setBookings).finally(() => setIsLoading(false));
  }, []);

  const addBooking = useCallback((booking) => {
    setBookings(prev => {
      const next = [booking, ...prev];
      bookingsStorage.setBookings(next);   // fire-and-forget persist alongside optimistic state update
      return next;
    });
  }, []);
  // ...updateBooking, cancelBooking follow the same "compute next, persist next, return next" shape

  return <BookingsContext.Provider value={{ bookings, isLoading, addBooking, updateBooking, cancelBooking }}>{children}</BookingsContext.Provider>;
}
export function useBookings() {
  const context = useContext(BookingsContext);
  if (!context) throw new Error('useBookings must be used within a BookingsProvider');
  return context;
}
```

**The 4 instances of this pattern:**
| Domain | Storage key | Storage file | Context file |
|---|---|---|---|
| Favorites | `wopecar_favorite_cars` | `services/favoritesStorage.js` | `contexts/FavoritesContext.js` |
| Cart | `wopecar_cart_cars` | `services/cartStorage.js` | `contexts/CartContext.js` |
| Bookings | `wopecar_local_bookings` | `services/bookingsStorage.js` | `contexts/BookingsContext.js` |
| Settings | `wopecar_settings` | `services/settingsStorage.js` | `contexts/SettingsContext.js` |

Auth token uses the read/write half of this pattern only (`services/tokenStorage.js`, key `wopecar_auth_token`) — no Context needed since `AuthContext` holds the *user object*, not the token.

### 6.3 Multi-step draft flow pattern

`contexts/CheckoutContext.js` holds an in-memory (not persisted — intentionally reset each checkout attempt) `draft` object threaded through all 6 checkout screens via `useCheckout()`:
```js
const EMPTY_DRAFT = { carId: null, startDate: null, endDate: null, pickupTime: null, returnTime: null,
  pickupLocation: '', returnLocation: '', addonNames: [], totalCost: 0,
  form: { firstName: '', lastName: '', email: '', phone: '', address: '' },
  licenseFront: null, licenseBack: null, proofOfAddress: null };

// startCheckout(carId) resets draft to EMPTY_DRAFT + sets carId
// updateDraft(patch) shallow-merges into draft
// updateForm(patch) shallow-merges into draft.form
// resetCheckout() resets to EMPTY_DRAFT
```
Each checkout screen reads what it needs from `draft`, calls `updateDraft`/`updateForm` on continue, and `router.push`es to the next step. The **booking-modification** state machine in `app/booking/[id].js` follows a similar shape but with local `useState` fields (`editStart`, `editEnd`, ...) instead of a context, since it's scoped to one screen with three modes: `'view' | 'editing' | 'reviewing'`.

### 6.4 Shared modal components

| Component | Purpose | Key props |
|---|---|---|
| `components/ConfirmModal.js` | Generic confirm dialog. `Alert.alert()` doesn't render on RN Web, so this replaces it everywhere. | `visible, title, message, confirmLabel, cancelLabel, destructive, onConfirm, onCancel`. Pass **`cancelLabel={null}`** for a single-button "info" dialog (used for Settings' "Coming soon" items). |
| `components/OptionPickerModal.js` | Bottom-sheet single-select list with a checkmark on the current value. | `visible, title, options (string[]), value, onSelect, onClose` |
| `components/DateRangeModal.js` | Custom calendar (no external date-picker lib) for start/end date range selection. Disables past dates and **Sundays** (business is closed Sundays). Exports `formatDateShort`. | `visible, onClose, startDate, endDate, onApply` |
| `components/BookingChoiceModal.js` | "Book Now" bottom sheet on car detail — choose Inquiry vs. Continue to checkout. | `visible, onClose, onInquiry, onContinue` |
| `components/FilterModal.js` | Search filters (drive type, vehicle class, etc.) on Home. | |
| `components/SortModal.js` | Sort options on Home (exports `SORT_OPTIONS`). | |

### 6.5 Checkout (6-step flow)

Route order, each pushing to the next on "Continue":
1. `app/checkout/dates.js` — **Step 1: Select Dates.** Own calendar implementation (not `DateRangeModal` — a separate inline grid because it also needs to show booked/unavailable ranges from `fetchCarAvailability`). Disables past dates, Sundays, and booked ranges. Enforces the car's minimum booking length (`getMinBookingDays`) with an inline warning + disabled Continue.
2. `app/checkout/details.js` — **Step 2: Pickup & Return.** Time slot grid (8:00 AM–6:00 PM hourly) + pickup/return location text fields + "same as pickup" checkbox.
3. `app/checkout/addons.js` — **Step 3: Regional Travel Add-ons.** Per-car optional add-ons (`car.regionalAddons`), some `per_day` priced, some flat.
4. `app/checkout/summary.js` — **Step 4: Cost Breakdown.** Computes `rentalCost = pricePerDay × days`, `addonsCost`, `deliveryFee` (self-drive only), `securityDeposit` (all rentals) — see [Section 7](#7-business-rules--constants-reference) for the exact formulas.
5. `app/checkout/form.js` — **Step 5: Booking form + document uploads** (name/email/phone/address, driver's licence images via `expo-image-picker`).
6. `app/checkout/payment.js` — **Step 6: Payment.** Calls `payWithPaystack()` ([6.6](#66-paystack-payment-flow)); on success, builds a booking object and calls `addBooking()` from `BookingsContext`, then `router.replace('/(tabs)/bookings')`.

Shared UI: `components/CheckoutHeader.js` (title + step N of 6 progress bar), `components/CheckoutFooterButton.js` (sticky bottom CTA).

### 6.6 Paystack payment flow

`services/paystackApi.js` — thin wrapper: `initializePayment({amount, callbackUrl})` (server-side secret key stays on the backend), `verifyPayment(reference)`, `buildPaystackCallbackUrl(appRedirectUrl)`.

`services/paystackCheckout.js` — `payWithPaystack(amount)`, the actual orchestration used by both the initial checkout payment step and the booking-modification difference-payment flow:
- **Native (iOS/Android):** `WebBrowser.openAuthSessionAsync(authUrl, appRedirectUrl)` — no popup-blocker concept.
- **Web:** `window.open('about:blank')` must be called **synchronously inside the click handler, before any `await`** — calling it after an `await initializePayment()` gets silently popup-blocked by the browser. The blank popup is redirected via `popup.location.href = authUrl` once the checkout URL is ready, then polled (`waitForWebPopupRedirect`, reading `popup.location.href` — throws while on Paystack's origin, that's expected, keep polling) until it lands back on the callback URL.
- Either way, ends with `verifyPayment(reference)` to confirm server-side before treating the booking as paid.

**Why the backend bridge route exists:** Paystack's hosted checkout doesn't reliably honor a custom app URL scheme (`exp://...` in Expo Go, `wopecar://...` in a standalone build) as `callback_url` — it silently falls back to a default configured in the Paystack dashboard instead. Fix: give Paystack a real `https://` URL (`GET /payment/callback` on the backend) that immediately client-side-redirects to the real app deep link passed as a query param. See [8.4](#84-the-paystack-callback-bridge-a-client-driven-backend-change).

### 6.7 Booking detail/modify state machine

`app/booking/[id].js`, one screen, three modes:
- **`view`** — read-only trip details, "Cancel Booking" (opens `ConfirmModal`) / "Modify Booking" actions.
- **`editing`** — date range (`DateRangeModal`), time slots, locations editable; live-recomputed total shown inline; "Review Changes" (disabled until valid — see below) / "Discard Changes".
- **`reviewing`** — shows Original Total vs. New Total vs. **Amount Due** (their difference — the user only pays the difference, not the full new total, or nothing if the new total is lower, with a note that credits aren't auto-refunded); "Pay {difference}" (via `payWithPaystack`) or "Confirm Changes" (no payment needed) / "Back to Edit".

Validity gate (`isEditValid`) requires: dates + times + both locations filled, **and** the selected range meets the car's minimum booking length.

### 6.8 Settings

`app/settings/index.js` — one scrollable hub, sectioned to match the original spec doc (`WopeCar App Profile Settings.docx`), using local helper components defined in that file: `Section`, `Row`, `ToggleRow`, `PickerRow`, `NavRow`, `StaticRow`. Every row is one of:
- **Real navigation** to an already-existing screen (Account Information/Change Email/Change Mobile Number → `/account`; Terms/Privacy → existing screens) — never a duplicate of functionality that already exists elsewhere.
- **Real local toggle/picker**, persisted via `SettingsContext`, that **genuinely saves the value**. Most don't yet change app behavior (no i18n, multi-currency, or push service exist yet) — explicitly not faked further than that. **Dark Mode is the one exception**: it's fully wired to a real theme via `ThemeContext` (see [6.9](#69-dark-theme--themecontext)), not just persisted.
- **New real static-content screen** (`app/settings/about.js`, `help-centre.js` — FAQ accordion with real content pulled from wopecar.com/faq, `safety-centre.js` — real support phone/email pulled from wopecar.com/support).
- **"Coming soon" info modal** (`ConfirmModal` with `cancelLabel={null}`) for the ~20 items needing backend/infra that doesn't exist (2FA, payment methods, active devices, delete account, data export, diagnostics, etc.) — chosen over building ~20 dead-end placeholder screens.

Full row-by-row mapping lives in the commit history (`git log --grep "Settings"`) and in [Section 10](#10-full-component--screen--module-index).

### 6.9 Dark theme / ThemeContext

`contexts/ThemeContext.js` — `ThemeProvider` + `useAppTheme()` hook (named to avoid colliding with `@react-navigation/native`'s own `useTheme`). Reads `settings.darkMode` (`'Light' | 'Dark' | 'Auto'`) from `SettingsContext`:
- `'Light'` / `'Dark'` are explicit overrides.
- `'Auto'` is **time-of-day based, not OS appearance** — fixed hours, `6:00–18:00` local device time = light, else dark (`new Date().getHours()`, no location permission needed). Re-evaluated every 60s via `setInterval` **and** on `AppState` change to `'active'`, so it flips live while the app is open without polling wastefully.
- Legacy persisted `'System'` values (the option `'Auto'` replaced) are coerced to `'Auto'` on load in `SettingsContext`.

Exposes `{ colors, isDark, mode }`. `colors` is `LIGHT_COLORS` or `DARK_COLORS` from `constants/theme.js`.

**Navigation chrome** (native headers, tab bar) is themed centrally, not per-screen: `app/_layout.js` builds a `navTheme` via `toNavigationTheme(colors, isDark)` (also exported from `ThemeContext.js`) and wraps the root `<Stack>` in `@react-navigation/native`'s own `<ThemeProvider>` (imported aliased as `NavigationThemeProvider` to avoid confusion with our own). This overrides header/tab-bar colors for every screen below via React context — no need to set `headerTintColor`/`headerStyle` per screen unless a screen wants a fixed override (e.g. `login.js` keeps `headerTintColor: colors.white` since its header sits over a photo).

**Component pattern** every screen/component follows (see [3.5](#35-styling-conventions)):
```jsx
import { useAppTheme } from '../contexts/ThemeContext';

function createStyles(colors) {
  return StyleSheet.create({ title: { color: colors.textPrimary } });
}

export default function Screen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // ...
}
```
Local sub-components defined outside the main screen function (e.g. `TimeSlotPicker` in `checkout/details.js` and `booking/[id].js`, `DocumentUploadTile` in `checkout/form.js`, `BookingCard` in `(tabs)/bookings.js`) can't close over the parent's `useMemo`'d `styles`/`colors` — those are passed down as explicit props instead.

**Token mapping convention** (applied consistently across all ~40 migrated files) — see the `LIGHT_COLORS`/`DARK_COLORS` table in [Section 5](#5-design-system) for the token list. Status-badge lookups (Pending/Confirmed/Cancelled, license verification states) that used to be static `{bg, text}` objects are now functions taking `colors`, e.g. `getStatusColors(colors)` in `(tabs)/bookings.js` and `booking/[id].js`.

---

## 7. Business Rules & Constants Reference

All in `constants/pricing.js`. **This is the single source of truth — never hardcode these numbers elsewhere.**

| Rule | Value | Applies to |
|---|---|---|
| Self-drive delivery fee | `SELF_DRIVE_DELIVERY_FEE = 200` (GHS, flat) | Self-drive only |
| Security deposit | `calculateSecurityDeposit(subtotal)`: flat `GHS 500` if `subtotal < GHS 2000`, else `25%` of subtotal | **All rentals** (self-drive and chauffeur) |
| Minimum booking length | `MIN_BOOKING_DAYS_SELF_DRIVE = 3`, `MIN_BOOKING_DAYS_CHAUFFEUR = 1`, via `getMinBookingDays(drivenBy)` | Enforced in `checkout/dates.js` and `booking/[id].js` |
| Working days | Monday–Saturday. **Sundays blocked** in every date picker (`DateRangeModal`, `checkout/dates.js`) | All bookings |
| Time slots | 8:00 AM – 6:00 PM, hourly | Pickup/return time pickers |
| Currency | `GHS` (`CURRENCY_CODE`), formatted via `formatCurrency()` | Display only |

Source for these numbers: `wopecar.com/faq` (live FAQ page) and `wopecar.com`'s booking widget/T&Cs — cross-checked and confirmed matching before the min-booking-days rule was added.

---

## 8. Backend Summary

Location: `~/wopecar-backend` (separate machine path, **not this git repo, not under version control**). Changes there require the user to manually re-upload via cPanel File Manager to `wopecarpreprod.com`.

### 8.1 Structure

Custom multi-module Laravel app (not a published starter kit, though migration table prefixes like `bravo_bookings` suggest it started from a CodeCanyon "Bravo Car Rental" script and was substantially customized). Three modules exist:
```
modules/
  Car/       Controllers, Api/ (CarApiController), Admin/ (full CRUD), Models, Migrations, Routes/{web,api,admin,language}.php
  Booking/   Controllers, Models, Events, Listeners, Gateways, Routes/{web,api,admin,language}.php — Admin/ directory MISSING, admin.php routes EMPTY
  Core/
```
Each module has a `RouterServiceProvider` that maps its `Routes/*.php` files under the right prefix/middleware (`web`, `api`, `admin/module/{name}`, locale).

### 8.2 Public/authenticated API surface the app actually calls

| Route | Purpose |
|---|---|
| `GET /api/cars`, `GET /api/cars/{id}`, `GET /api/cars/{id}/availability` | Public car listing/detail/availability (`Car` module) |
| `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout` | Sanctum token auth |
| `GET /api/user`, `PUT /api/user`, `POST /api/user/avatar` | Profile (auth required) |
| `POST /api/payments/paystack/initialize`, `GET /api/payments/paystack/verify/{reference}` | Paystack (auth required) |
| `GET /payment/callback` (web, not `/api`) | The bridge route — see 8.4 |

### 8.3 What does NOT exist on the backend (important)

- **No booking-creation/list/status API.** `mapApiRoutes()` in `Booking/RouterServiceProvider.php` is defined but never called from `map()`, and `Booking/Routes/api.php` is empty. This is why bookings are 100% client-local (`BookingsContext` + `bookingsStorage`) — there's nowhere real to send them yet.
- **No admin UI for bookings.** `Booking/Routes/admin.php` is empty and there's no `Booking/Admin/` directory, unlike `Car/Admin/CarController.php` which is fully built. Bookings made through the backend's own web checkout flow (`Booking/Routes/web.php` does have `doCheckout`, `confirm/{gateway}`, etc.) still wouldn't be visible in the admin dashboard today.
- **No change-password endpoint.**

### 8.4 The Paystack callback bridge (a client-driven backend change)

Added to `routes/web.php` (top-level, not module-scoped) because the client-side popup/deep-link flow needed it — see [6.6](#66-paystack-payment-flow) for why:
```php
Route::get('/payment/callback', function (\Illuminate\Http\Request $request) {
    $appRedirect = $request->query('app_redirect', '');
    $reference = $request->query('reference') ?? $request->query('trxref') ?? '';
    if (empty($appRedirect)) return response('Missing redirect target.', 400);
    $separator = str_contains($appRedirect, '?') ? '&' : '?';
    $target = $appRedirect . $separator . 'reference=' . urlencode($reference);
    $html = '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=' . htmlspecialchars($target, ENT_QUOTES) . '"></head>'
        . '<body><script>window.location.replace(' . json_encode($target) . ');</script>Redirecting you back to the app&hellip;</body></html>';
    return response($html)->header('Content-Type', 'text/html');
})->name('payment.callback.bridge');
```
If you touch the Paystack flow again, remember: this route must stay deployed on preprod (it was manually uploaded once; re-verify it's live before assuming it works).

---

## 9. Known Gaps / Deferred Work

Explicitly deferred, not oversights — flagged here so future work doesn't accidentally treat them as "done":

- **Bookings have no backend.** Local-device-only. Multi-device sync, admin visibility, and server-side status changes are all impossible until a real Booking API + admin panel are built (see 8.3).
- **Settings preferences that don't change app behavior yet:** Language, Theme Colour, Map Provider, Distance Units, Currency, Navigation Preference, all 9 notification toggles, Profile Visibility, Marketing Preferences, Auto-play Videos. They persist correctly; nothing in the app reads them yet. (**Dark Mode is now wired up for real** — see [6.9](#69-dark-theme--themecontext) — it's no longer in this "inert" list.)
- **~20 Settings items are backend/infra-dependent stubs** ("Coming soon" modal): Change Password, Biometric Login, 2FA, Active Devices, Data Sharing Preferences, Download My Data, Delete Account, all 6 Payment items, Login Activity, Trusted Devices, Security Alerts, Navigation Preference, Cache Management, Check for Updates, Diagnostics, Clear Cache, Developer Mode.
- **No i18n, no multi-currency pricing** anywhere in the app (formatCurrency hardcodes GHS).
- **No push notification service configured** (no `expo-notifications` setup) — notification toggles are inert.
- **No crash reporting / OTA update checking** (`expo-updates` not installed).
- **Minimum booking length is a UI-side check only** — nothing stops a booking below the minimum via any other path (there isn't another path today, but note this if a backend booking API is ever added: re-validate server-side too).

---

## 10. Full Component / Screen / Module Index

### Screens (`app/`)
| Path | Route | Purpose |
|---|---|---|
| `_layout.js` | — | Root Stack, Provider tree, non-tab screen registration |
| `(tabs)/_layout.js` | — | Tab bar (Search, Favorites, Bookings, Cart, Profile) |
| `(tabs)/index.js` | `/` | Home — car search, date/filter, list/tile toggle |
| `(tabs)/favorites.js` | `/favorites` | Saved cars |
| `(tabs)/bookings.js` | `/bookings` | Status-grouped booking list (Pending/Confirmed/Cancelled) |
| `(tabs)/cart.js` | `/cart` | Cart before checkout |
| `(tabs)/profile.js` | `/profile` | Profile hub, links to Account/Inbox/Documents/Terms/Privacy/Settings |
| `car/[id].js` | `/car/:id` | Car detail |
| `booking/[id].js` | `/booking/:id` | Booking detail, modify, cancel |
| `checkout/dates.js` | `/checkout/dates` | Checkout step 1 |
| `checkout/details.js` | `/checkout/details` | Checkout step 2 |
| `checkout/addons.js` | `/checkout/addons` | Checkout step 3 |
| `checkout/summary.js` | `/checkout/summary` | Checkout step 4 |
| `checkout/form.js` | `/checkout/form` | Checkout step 5 |
| `checkout/payment.js` | `/checkout/payment` | Checkout step 6 |
| `settings/index.js` | `/settings` | Settings hub (9 categories) |
| `settings/about.js` | `/settings/about` | About WopeCar |
| `settings/help-centre.js` | `/settings/help-centre` | FAQ accordion (real content) |
| `settings/safety-centre.js` | `/settings/safety-centre` | Safety resources + real contact CTAs |
| `account.js` | `/account` | Editable profile, driver's licence, avatar |
| `login.js` | `/login` | Login/signup |
| `terms.js` | `/terms` | Terms of Service (static, from live site) |
| `privacy.js` | `/privacy` | Privacy Policy (static, from live site) |
| `inbox.js` | `/inbox` | (stub/simple) |
| `documents.js` | `/documents` | (stub/simple) |
| `payment-callback.js` | `/payment-callback` | Deep-link landing target for the Paystack bridge |

### Components (`components/`)
| Component | Purpose |
|---|---|
| `ConfirmModal.js` | Confirm/info dialog (single- or double-button) |
| `OptionPickerModal.js` | Bottom-sheet single-select list |
| `DateRangeModal.js` | Calendar date-range picker (Sunday-aware) |
| `BookingChoiceModal.js` | "Book Now" Inquiry-vs-Continue sheet |
| `FilterModal.js` | Home search filters |
| `SortModal.js` | Home sort options |
| `CarListCard.js` | Home list-view car card |
| `CarTileCard.js` | Home tile-view car card |
| `ImageGallery.js` | Swipeable image carousel (car photos) |
| `SectionHeading.js` | Small heading + accent bar, used across Car Detail sections |
| `FeaturesSection.js` | Car Detail feature list (icon-mapped) |
| `ReviewsSection.js` | Car Detail rating breakdown |
| `FaqSection.js` | Car Detail FAQ accordion (collapsible, "show all") |
| `CarOwnerCard.js` | Car Detail owner/partner card |
| `CheckoutHeader.js` | Checkout step title + progress bar |
| `CheckoutFooterButton.js` | Checkout sticky bottom CTA |

### Contexts (`contexts/`) + paired storage (`services/`)
| Context | Hook | Storage service | Persisted? |
|---|---|---|---|
| `AuthContext.js` | `useAuth()` | `tokenStorage.js` (token only) | Token only; user re-fetched via `/api/user` |
| `FavoritesContext.js` | `useFavorites()` | `favoritesStorage.js` | Yes |
| `CartContext.js` | `useCart()` | `cartStorage.js` | Yes |
| `CheckoutContext.js` | `useCheckout()` | — (in-memory only, by design) | No |
| `BookingsContext.js` | `useBookings()` | `bookingsStorage.js` | Yes |
| `SettingsContext.js` | `useSettings()` | `settingsStorage.js` | Yes |
| `ThemeContext.js` | `useAppTheme()` | — (derives from `SettingsContext.settings.darkMode`) | Via `SettingsContext` |

### Services (`services/`, non-storage)
| File | Purpose |
|---|---|
| `api.js` | Base `fetch` wrapper (`request`), `ApiError`, `API_BASE_URL` |
| `authApi.js` | register/login/logout/getCurrentUser/updateProfile/uploadAvatar |
| `carsApi.js` | fetchCars/fetchCarById/fetchCarAvailability/formatDateParam |
| `paystackApi.js` | initializePayment/verifyPayment/buildPaystackCallbackUrl |
| `paystackCheckout.js` | `payWithPaystack()` — full orchestration, web + native |

### Constants (`constants/`)
| File | Exports |
|---|---|
| `theme.js` | `COLORS` (brand-fixed), `LIGHT_COLORS`, `DARK_COLORS`, `FONTS` |
| `pricing.js` | `CURRENCY_CODE`, `formatCurrency`, `SELF_DRIVE_DELIVERY_FEE`, `calculateSecurityDeposit`, `MIN_BOOKING_DAYS_SELF_DRIVE`, `MIN_BOOKING_DAYS_CHAUFFEUR`, `getMinBookingDays` |

---

## 11. Verification Approach

No automated test suite exists. Verification for UI-affecting changes is done live:
1. Start the dev server preview (Expo web) via the browser MCP tools — never `Bash` for running the dev server.
2. Exercise the actual flow (click through, fill forms, reload to check persistence) and take screenshots.
3. Check `read_console_messages` for errors after each interaction.
4. For anything touching money, dates, or the Paystack flow, walk the full flow end to end at least once (e.g. select dates → confirm total math by hand → pay → confirm booking appears correctly).

Known browser-automation quirk in this environment: synthetic `computer` clicks are sometimes silently swallowed by React Native Web's touch handling. When a click doesn't visibly register, fall back to a JS-dispatched click on the actual DOM node (find the nearest ancestor with `cursor: pointer` and call `.click()` on it) rather than assuming the feature is broken.

---

## 12. Guidelines for Future Agents

- **Before adding a new locally-persisted setting/preference:** add it to the relevant Context's default object (or `SettingsContext`'s `DEFAULT_SETTINGS`) — don't create a new Context+Storage pair unless it's a genuinely new domain, not just a new field.
- **Before adding a new screen with a native header:** register it explicitly in `app/_layout.js` with `headerBackTitle` set to *its own* name (see 3.3) — don't assume the default back-label will be sensible.
- **Before hardcoding a business-rule number** (a fee, a minimum, a threshold): put it in `constants/pricing.js` instead, with a comment citing the source (usually `wopecar.com/faq` or the live T&Cs).
- **Before building a "Coming soon" stub for a missing backend feature:** check Section 9 first — it might already be listed, or the backend might have grown that endpoint since this doc was last updated (backend is not version-controlled here, so it can drift silently).
- **Before touching the Paystack flow:** re-read 6.6 and 8.4 together — the web/native split and the bridge route are both load-bearing and easy to break independently.
- **After finishing a feature:** update this file — the relevant row in Section 10, and Section 9 if you closed or added a gap.
