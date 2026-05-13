# OASIS Mobile App Readiness Audit

**Date:** 2026-05-13  
**Strategy:** PWA first → Capacitor wrapper → Native enhancements  
**Principle:** No React Native rewrite. No duplication of business logic. RLS and auth remain unchanged.

---

## 1. Overall Assessment

| Area | Status | Priority |
|------|--------|----------|
| Responsive layout | ✅ Good — Tailwind breakpoints throughout | — |
| Viewport meta | ✅ Present | — |
| Auth / session | ✅ Supabase handles persistence | — |
| Dark mode | ✅ Full light/dark support | — |
| i18n | ✅ en / pl / de with localStorage | — |
| Mobile sidebar | ✅ Hamburger overlay, body scroll lock | — |
| Safe area support | ✅ `pb-safe` class on body | — |
| PWA manifest | ❌ Missing | P0 |
| Service worker | ❌ Missing | P0 |
| Offline fallback | ❌ Missing | P0 |
| PWA meta tags | ❌ Missing | P0 |
| App icons | ❌ Empty public/ | P0 |
| Touch targets | ⚠️ Many buttons < 44px | P1 |
| Mobile bottom nav | ⚠️ No role-aware shortcuts | P1 |
| Upload progress | ⚠️ No progress UI on file upload | P1 |
| Upload retry | ⚠️ No retry on failure | P1 |
| Deep link handling | ⚠️ No /mobile/* routes | P2 |
| Push notifications | ⚠️ In-app only, no device push | P2 |
| Capacitor shell | ❌ Not set up | P3 |
| Biometric auth | ❌ Not set up | P3 |

---

## 2. Screen-by-Screen Readiness

### Dashboard (`src/pages/Dashboard.jsx`)
- **Layout:** `grid-cols-1 md:grid-cols-5` — stacks correctly on mobile ✅
- **Cards:** Property cards, occupancy stats — readable on phone ✅
- **Tables:** Some table-heavy sections don't collapse to cards on mobile ⚠️
- **Action:** Add card-first view for the property list on < 640px

### Command Center (`src/pages/CommandCenterPage.jsx`)
- **Layout:** Attention queue cards — mobile-friendly ✅
- **AI briefing:** Scrollable card — works on phone ✅
- **Action:** None critical — good mobile surface

### Maintenance Inbox (`src/pages/MaintenanceInboxPage.jsx`)
- **Layout:** Kanban board (open / in_progress / waiting / resolved / closed)
- **Mobile:** Horizontal scroll on Kanban columns ⚠️ — kanban is hard to use on narrow screens
- **Action:** On < 768px, collapse Kanban to a vertical list sorted by urgency

### Work Orders (`src/pages/WorkOrderDetails.jsx`)
- **Layout:** Detail view — scrollable form ✅
- **Upload:** Photo upload exists but no progress bar ⚠️
- **Action:** Add upload progress; improve file picker label for camera

### Contractor Portal (`src/pages/ContractorPortal.jsx`)
- **Layout:** List of assigned jobs ✅
- **Upload:** Work order photo upload — no progress or retry ⚠️
- **Action:** MobileUploadZone component + progress hook

### Tenant Portal (`src/layout/TenantPortalLayout.jsx`, `src/pages/TenantHomePage.jsx`)
- **Layout:** 2-col grid nav on mobile → 1-col on desktop ✅
- **Upload:** Maintenance photo attachment — no mobile-specific UX ⚠️
- **Bottom nav:** No quick shortcuts to Issues / Documents / Payments ⚠️
- **Action:** Mobile bottom nav for tenant role; upload progress

### Finance (`src/pages/FinancePage.jsx`)
- **Layout:** Mobile card view / desktop table — already responsive ✅
- **Tested:** `tests/e2e/finance-mobile-responsive.spec.js` passes ✅
- **Action:** None critical

### Documents (`src/pages/Documents.jsx`)
- **Layout:** Document list — cards work on mobile ✅
- **Upload:** No progress or retry ⚠️
- **Preview:** PDF/image preview may be small on phone ⚠️
- **Action:** Upload progress; larger tap targets on document actions

### Compliance (multiple pages in `src/pages/compliance/`)
- **Layout:** Feature-gated pages, card-based ✅
- **Mobile:** Generally readable ✅
- **Action:** None critical

### Notifications (`src/components/NotificationsBell.jsx`)
- **Layout:** Dropdown — works on mobile ✅
- **Bell touch target:** `w-10 h-10` (40px) — borderline ⚠️
- **Action:** Increase to `w-11 h-11` (44px); add notification to mobile bottom nav

### Account Switcher
- **Desktop:** `hidden lg:flex` in Topbar ✅
- **Mobile:** Only in Sidebar overlay — requires opening menu ⚠️
- **Action:** Surface account name in mobile topbar; keep switcher in sidebar

### Language / Theme Settings
- **Desktop:** Visible in Topbar selects ✅
- **Mobile:** Both `hidden lg:flex` — not reachable without sidebar ⚠️
- **Action:** Move theme/language to a mobile settings sheet or sidebar bottom

### Login / Auth (`src/pages/Login.jsx`)
- **Layout:** Assumed form-based — needs audit ✅
- **Session:** Supabase `persistSession: true`, `autoRefreshToken: true` ✅
- **Deep link auth:** `detectSessionInUrl: true` — OAuth redirect works ✅
- **Action:** Ensure login form inputs use `type="email"`, `autocomplete`, `inputmode`

---

## 3. Auth & Session Readiness

| Check | Status |
|-------|--------|
| Supabase session persistence | ✅ `persistSession: true` |
| Auto token refresh | ✅ `autoRefreshToken: true` |
| OAuth deep link detection | ✅ `detectSessionInUrl: true` |
| Password reset flow | ✅ `/reset-password` route |
| Session on PWA install | ✅ Supabase stores in localStorage |
| Biometric unlock | ❌ Not implemented |
| Secure token storage (Capacitor) | ❌ Not configured |

---

## 4. Storage Upload Readiness

| Upload Surface | Bucket | Progress | Retry | Mobile Label | Status |
|---------------|--------|----------|-------|-------------|--------|
| Maintenance photos | `maintenance-request-attachments` | ❌ | ❌ | ⚠️ Generic | P1 |
| Work order photos | `work-order-attachments` | ❌ | ❌ | ⚠️ Generic | P1 |
| Documents | document storage | ❌ | ❌ | ⚠️ Generic | P1 |
| Invoice/quote (work order) | `work-order-attachments` | ❌ | ❌ | ⚠️ Generic | P1 |

**Existing guardrails (DO NOT CHANGE):**
- RLS policies on all buckets ✅
- `assertUuid` validation ✅  
- Max file size: 15 MB per file, 10 files max ✅
- Closed request guard ✅

---

## 5. Notification Readiness

| Check | Status |
|-------|--------|
| In-app realtime notifications | ✅ `useNotifications` hook + Supabase Realtime |
| Notification bell + dropdown | ✅ |
| Push notifications (device) | ❌ No service worker push |
| APNs / FCM token storage | ❌ No device_tokens table |
| Background sync | ❌ No service worker |
| Notification deep links | ⚠️ `linkPath` exists but no deep link routing |

---

## 6. PWA / App Store Readiness Gaps

### Missing for PWA Install
- [ ] `public/manifest.json` with name, icons, display, start_url, theme_color
- [ ] Service worker (`public/sw.js`) with offline fallback
- [ ] `<link rel="manifest">` in index.html
- [ ] `<meta name="theme-color">` in index.html
- [ ] Apple PWA meta tags (`apple-mobile-web-app-capable`, `apple-mobile-web-app-title`, `apple-mobile-web-app-status-bar-style`)
- [ ] App icons (192×192, 512×512 minimum; 180×180 for Apple touch)
- [ ] Maskable icon variant

### Missing for App Store (Capacitor path)
- [ ] `capacitor.config.json`
- [ ] iOS bundle identifier: `app.oasisrentalmgt.mobile`
- [ ] Android package: `app.oasisrentalmgt.mobile`
- [ ] Privacy policy URL
- [ ] Account deletion flow (App Store requirement)
- [ ] Camera / photo library permission descriptions
- [ ] Push notification permission descriptions

---

## 7. Deep Link Readiness

Currently: no `/mobile/*` routes defined.  
Supabase `detectSessionInUrl: true` handles OAuth deep links.

Planned deep link paths (Phase 7):
```
/mobile/command-center
/mobile/maintenance/:id
/mobile/work-orders/:id
/mobile/tenant/issues/:id
/mobile/documents/:id
/mobile/finance/payments/:id
/mobile/compliance/:id
```

---

## 8. Offline / Failure Handling Gaps

| Scenario | Current Behaviour | Target |
|----------|------------------|--------|
| No internet on load | White screen / JS error | Offline fallback HTML |
| Network drops mid-upload | Upload fails, no feedback | Retry with progress |
| Supabase down | Generic JS error | Friendly error state |
| Session expired offline | Redirect loop | Graceful re-auth prompt |
| Background notification | Not delivered | Service worker push (Phase 6) |

---

## 9. Highest Priority Fixes

### P0 — PWA Foundation (blocks install)
1. Add `public/manifest.json`
2. Add `public/sw.js` (app shell cache, offline fallback)
3. Add `public/offline.html`
4. Update `index.html` with PWA meta tags
5. Register service worker in `src/main.jsx`
6. Add OASIS icons (SVG + PNG for Apple)

### P1 — Mobile UX
7. Role-aware mobile bottom nav (`MobileBottomNav.jsx`)
8. Upload progress + retry (`useMobileUpload.js`, `MobileUploadZone.jsx`)
9. Increase touch targets to 44px minimum on Sidebar, Topbar, Notifications
10. Maintenance Kanban → list view on mobile

### P2 — Deep Links & Push
11. Define `/mobile/*` routes and role-guard them
12. `device_push_tokens` table and token management
13. Push notification event mapping

### P3 — Native
14. Capacitor config and plugin plan
15. Biometric auth (Capacitor Identity Vault or `@capacitor/biometrics`)
16. Secure storage (Capacitor Preferences)
