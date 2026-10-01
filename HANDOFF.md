# Pinsite — Complete Agent Context & Handoff Document

> **Purpose:** This document gives any new AI agent or developer full context on the Pinsite project — who we are, what we built, where we are, and what comes next. It is not a technical spec. For all technical and SQL details, refer to the **[v1.8 Master Blueprint](./pinsite_mobile_team_lifecycle_blueprint.md)**.
> **Current Status:** Sprints 1–8 are **100% Shipped & Live in Production**. Sprints 9–10 are the active upcoming development targets.

---

## 1. Who We Are

**Pinsite** (internally called "Agency OS") is a cold-calling CRM built for a sales agency. The founder and product owner is **Muzammil** (`muzammilpathan6047@gmail.com`). He manages a team of callers who make outbound calls all day, track leads, and report outcomes. Muzammil oversees everything as the admin/manager.

The app was built because no off-the-shelf CRM fit the specific workflow of this agency. It is a fully custom, invite-only platform — meaning only Muzammil can bring new callers onto the platform.

- **Role Label Standard**: In the UI, Muzammil is styled as **`Muzammil (Admin)`** to strictly match the database enum `admin` (never display `(Owner)` to avoid role mismatches).

---

## 2. The Product — What Pinsite Does

Pinsite is a mobile-first web app where:

- **Callers** log in on their phones, access a streamlined single-column deck (`< 768px`), tap **"Dial Now"** via native `tel:` protocol, monitor a live call duration timer, and log outcomes via a slide-up bottom sheet (Interested, Callback, No Answer, Gatekeeper, Rejected, DNC).
- **Managers (Muzammil)** oversee live telemetry from the **Team Command Center** (`/manager/team`), monitor real-time dials, talk time, and queues, rebalance leads between callers, invite users, reset passwords, manage member roles, and inspect rejected leads in the **Quarantine Holding Bin** (`/manager/quarantine`).
- **Manager Mirror Mode** allows managers to jump into `/queue?impersonate=[caller_id]` to observe exactly what a caller sees with dual-attributed auditing (`acted_by` = manager, `on_behalf_of` = caller) and leave realtime coaching notes.
- **Leads** flow through an automated lifecycle:
  - Ingestion $\rightarrow$ `unassigned` pool
  - Automated depth-aware distribution (6:00 AM IST, max 30 leads per caller)
  - Cadence cooldowns (+3h, +24h, +48h, +72h; auto-quarantined on 5th failure)
  - 7-Day Quarantine Holding Bin with automated nightly soft-delete (2:00 AM UTC) or 3-way manager rescue
  - Hot deals escalate immediately with timestamps and team alerts
  - Do Not Call (DNC) requests are permanently SHA-256 hashed into `dnc_blacklist` (DPDP compliance) and soft-deleted.

---

## 3. Current Team (Accounts in the System)

| Name | Email Address | Role | Lead Holdings | Caller Pool Status |
|---|---|---|---|---|
| **Muzammil (Admin)** | `muzammilpathan6047@gmail.com` | `admin` | 0 leads | Owner / Super Admin (Protected) |
| **Ali Pathan** | `alipathan808063@gmail.com` | `caller` | 37 leads | Active Caller |
| **Sayyed Maaz** | `sayyedmaaz1020@gmail.com` | `caller` | 13 leads | Active Caller |
| **Melikecookie (Habib)** | `habib.yst255@gmail.com` | `caller` | 12 leads | Active Caller (Lightest caller) |
| **Anas Shaikh** | `anasshaikh17862010@gmail.com` | `caller` | 12 leads | Active Caller (Lightest caller) |
| **Yadullah** | *(Internal Account)* | `manager` | 0 leads | **MANAGER (EXCLUDED from caller pool)** |

> [!CRITICAL]
> **1. Owner Security Rule:** Do NOT change or reset `muzammilpathan6047@gmail.com`'s password. It is `AgencyOwner2026!`. The backend protects this account from modification, role changes, or automated resets.
>
> **2. Yadullah & Manager Boundary:** Yadullah was promoted to `manager` on Sept 27. **Managers are NOT callers.**
> - Active caller pool consists of exactly **4 callers** (Ali, Sayyed Maaz, Melikecookie, Anas) holding 74 total leads.
> - Team caller average is $74 / 4 = 18.5$ (~19 leads).
> - Yadullah holds 0 leads and must NEVER be targeted by lead assignment, distribution crons, lightest-caller detection, or rebalance transfers.
> - Active Callers card displays: `4 / 4 callers`.

---

## 4. Where the Code Lives

| Item | Detail |
|---|---|
| **Local project folder** | `c:\Users\Muzammil\Desktop\agency-os` |
| **GitHub repo** | `https://github.com/itsdecoding/pinsite.git` |
| **Live domain** | `https://pinsite.pro` |
| **Hosting** | Vercel (project slug: `pinsite20`, aliased to `pinsite.pro`) |
| **Database** | Supabase — `https://tulnyoldbpwqdjpkqcxf.supabase.co` |

### 4.1 How GitHub Is Connected

The repo at `https://github.com/itsdecoding/pinsite.git` is connected to **Vercel**. Every push to the `main` branch **automatically triggers a Vercel deployment** — no manual deploy needed. This is live CI/CD.

When working on code:
- All work happens locally in `c:\Users\Muzammil\Desktop\agency-os`
- Verify builds before pushing: `npm run build` (must pass cleanly with 0 errors)
- Changes are committed with `git add . ; git commit -m "msg" ; git push origin main`
- Vercel picks it up automatically and deploys within ~2 minutes
- GitHub Actions run on every push (all passing ✅)

> **PowerShell Note:** When chaining commands in PowerShell, use semicolons (`;`) — NOT `&&`. Example: `git add . ; git commit -m "msg" ; git push origin main`

---

## 5. Environment & Credentials

These are stored in `.env.local` at the root of the project. They are also configured in Vercel's production environment variables.

```env
NEXT_PUBLIC_SUPABASE_URL=https://tulnyoldbpwqdjpkqcxf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[Configured in .env.local / Vercel]
SUPABASE_SERVICE_ROLE_KEY=[Configured in .env.local / Vercel - Server-Side Only]
RESEND_API_KEY=[Configured in .env.local / Vercel]
RESEND_FROM_EMAIL=Pinsite <invites@pinsite.pro>
NEXT_PUBLIC_APP_URL=https://pinsite.pro
```

> **Security Rule:** The `SUPABASE_SERVICE_ROLE_KEY` must NEVER be used client-side. It is strictly used in server-side API routes (`src/app/api/.../route.ts`).

---

## 6. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14.2.35 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS (Dual Dark/Light Theme with `#F95721` accent) |
| Database | Supabase (PostgreSQL + Auth + Realtime + `pg_cron` + `pgcrypto`) |
| Email | Resend (domain: `pinsite.pro`, region: Tokyo) |
| Hosting | Vercel |
| DNS | Hostinger nameservers |

The project build (`npm run build`) passes cleanly with **32 routes** and Edge Middleware at 86.6 kB. Always verify zero type errors.

---

## 7. What Has Been Built (Sprints 1–8 Fully Shipped ✅)

Pinsite v1.8 Sprints 1 through 8 are **live in production** at `https://pinsite.pro`. Here is what exists and is operational:

### 7.1 Core Foundation (Sprints 1–5)
- **Auth & Invites**: Invite-only sign-up via Resend (`invites@pinsite.pro`), middleware access gates.
- **Lead Ingestion**: CSV parser and batch ingestion at `/manager/ingestion`.
- **Pipeline & Deals**: Deal stages, kanban tracking, company profiles.
- **Team Comms**: Channels (`#general`, `#callers`, `#developers`, `#management`, `#wins`, `#alerts`) and direct messages at `/comms`.
- **DNC Protection**: DPDP-compliant SHA-256 hashing into `public.dnc_blacklist`.

### 7.2 Sprint 6: Lead Lifecycle DB & Password Recovery (Shipped ✅)
- **Database Schema**: `quarantined_at`, `disposal_scheduled_at`, `escalated_at`, `rejected_by`, `rejection_reason`, `cooldown_until`, `claimed_by_manager`, `supervisor_id`, `require_password_change`, `temp_password_issued_at`.
- **Audit Columns**: `acted_by` and `on_behalf_of` on both `public.calls` and `public.assignment_history`.
- **Self-Service Password Recovery**: `/forgot-password` and `/reset-password` with interactive password strength meter.
- **Edge Middleware Gate**: Redirects users with `require_password_change === true` with a `307 Temporary Redirect` to `/reset-password?forced=true`.
- **Server-Side Manager Password Reset**: `POST /api/manager/team/reset-password` allows managers to set temporary passwords safely.
- **CRON 3 Patch**: `recycle_stale_leads()` strictly excludes `not_interested` leads from being recycled.

### 7.3 Sprint 7: Mobile Caller Cockpit & Mirror Mode (Shipped ✅)
- **Mobile-First Layout**: Clean single-column layout (< 768px) with zero horizontal scrolling.
- **One-Tap Telephony**: Bottom-anchored floating dial button using native `tel:` protocol.
- **Live Call Duration Timer**: Visual timer tracking active talk time.
- **Data Hygiene Fixes**: Title-casing space fix after honorifics (`Dr. Archana's`), queue item text overflow word wrap.
- **4 Required Fields in Deck**: Decision Maker (`John Doe — Owner`), Notes, clickable Website link, and Attempt counter with ceiling (`Attempt 2 / 5`).
- **Bottom-Sheet Outcome Drawer**: Slide-up drawer with large touch targets, cadence cooldown triggers, and required text input for rejection reasons.
- **Manager Mirror Mode**: Accessible via `/queue?impersonate=[caller_id]`.
  - Amber sticky banner: `"Actions logged here will record as Muzammil (Admin) acting on behalf of [Caller Name]."`
  - Dual attribution (`acted_by` + `on_behalf_of`) on all logged actions.
  - Read-Only Observer Mode disabling accidental direct dials.
  - Live coaching notes synced in real time via Supabase Realtime.

### 7.4 Sprint 8: Team Command Center & Quarantine Bin (Shipped ✅)
- **Team Command Center (`/manager/team`)**:
  - Live telemetry: Today's dials, connects, talk time, hot escalations, active queues, and online indicators.
  - **Connect Rate Guard**: Percentage is hidden until dials reach $\ge 20$ (displays raw numbers like `4 dials, 4 connects` to prevent misleading 100% metrics).
  - Real caller email display (no dummy domains).
  - **Unified `[ ⚖️ Distribute ▾ ]` Dropdown**:
    - `Distribute Unassigned`: Distributes unassigned leads up to depth cap.
    - `Rebalance Overloaded`: Targeted queue transfer modal between callers.
  - **Depth-Aware Distribution**: 6:00 AM IST daily cron (`assign_daily_leads`) ordered by `current_load ASC`, capped at 30 leads per caller maximum.
  - **Proactive Depth Rebalancing**: Every 4 hours cron (`rebalance_overloaded_callers`) rebalances callers $> 1.5\times$ team average.
  - Role management modal: In-app promotion/demotion between `caller`, `manager`, and `developer`.
- **7-Day Quarantine Holding Bin (`/manager/quarantine`)**:
  - Countdown timer tracking days/hours remaining until automated disposal.
  - Nightly disposal worker (`cron_dispose_quarantined_leads()`) at 2:00 AM UTC soft-deletes expired leads.
  - **3-Way Rescue Modal**: Return to Original Caller, Move to Unassigned Pool, or Reassign to Specific Caller (strictly filtering for `role === 'caller'`). Rescuing automatically clears all quarantine timestamps and attribution.

---

## 8. Current Key Pages & API Routes

| Route | Role / Access | Purpose |
|---|---|---|
| `/queue` | Caller / Manager | Caller dialer deck, call timer, outcome drawer, and manager mirror mode |
| `/dashboard` | All authenticated | High-level KPI overview |
| `/manager/team` | Manager / Admin | Team Command Center: live telemetry, distribute dropdown, rebalance, roles |
| `/manager/quarantine` | Manager / Admin | 7-day quarantine bin, auto-disposal countdown, 3-way rescue modal |
| `/manager/invites` | Manager / Admin | Team invite management |
| `/manager/ingestion` | Manager / Admin | Lead CSV upload & mapping |
| `/comms` | All authenticated | Team messaging channels (`#general`, `#wins`, etc.) and direct messages |
| `/forgot-password` | Public | Self-service password recovery email request |
| `/reset-password` | Public / Forced | Password reset with strength meter and forced redirect handling |
| `/api/manager/team-stats` | Manager / Admin | Team Command Center live statistics endpoint |
| `/api/manager/leads/distribute`| Manager / Admin | Distribute unassigned leads with depth capping |
| `/api/manager/leads/rebalance` | Manager / Admin | Transfer leads between callers |
| `/api/manager/quarantine` | Manager / Admin | Quarantine list and lead rescue endpoint |
| `/api/manager/team/role` | Manager / Admin | Promote/demote team members |
| `/api/manager/team/reset-password`| Manager / Admin | Server-side temporary password generator |

---

## 9. What We Are Building Next (Sprints 9 & 10)

Sprints 6, 7, and 8 are complete. Sprints 9 and 10 represent the final remaining features of v1.8:

### Sprint 9: Firebase Cloud Messaging (FCM) & PWA Onboarding
1. **Firebase Admin SDK Setup**: Configure service account credentials in Vercel.
2. **`public.fcm_tokens` Registry**: UPSERT route `POST /api/notifications/fcm-token` supporting multi-user device handoffs.
3. **PWA & Service Worker**: `manifest.json` + `public/firebase-messaging-sw.js` for background push notifications.
4. **Lock-Screen Push Notifications**:
   - Hot deal qualified $\rightarrow$ alert managers immediately.
   - Callback due in 15 minutes $\rightarrow$ alert assigned caller on locked phone.
   - Reassigned lead $\rightarrow$ alert receiving caller.
5. **iOS PWA Install Guide**: Safari mandate to "Add to Home Screen" to activate Apple Web Push (iOS 16.4+ requirement).

### Sprint 10: Escalation Polish, #wins Bot & Acceptance
1. **`#wins` System Bot**: Automated posting into `#wins` channel using seeded Pinsite Bot profile (`00000000-0000-0000-0000-000000000001`) whenever a lead is marked `interested`.
2. **Realtime Manager Escalation**: Audio chimes and pulsing alert badges on manager dashboard for hot deals.
3. **CRON 4 Enhancement**: Update callback notification scanner to trigger FCM pushes 15 minutes prior to scheduled callbacks.
4. **Full E2E Verification**: End-to-end regression testing across all roles.

---

## 10. Important Bug Fixes & Lessons Learned

1. **Yadullah Is a Manager, Not a Caller**:
   - Yadullah was promoted to `manager` on Sept 27.
   - He must never be counted in caller pool averages, never receives leads, and is excluded from rebalance targets. Active callers count is strictly 4.
2. **Connect Rate Percentage Sample Size**:
   - Cold call connects average 15–30%. When callers make 4 calls and connect 4 times, displaying `100%` is misleading. The UI hides the percentage until $\ge 20$ dials are logged.
3. **Mirror Mode Dual Attribution**:
   - Banner copy must state: `"Actions logged here will record as Muzammil (Admin) acting on behalf of [Caller Name]."`
   - Every call or reassignment in mirror mode writes `acted_by = manager_id` and `on_behalf_of = caller_id` so audit trails and scoreboards remain accurate.
4. **Lead Distribution Depth Limits**:
   - The old distribution gave 100 leads to the first random caller.
   - Fixed to `ORDER BY current_load ASC` with a depth ceiling of **30 leads per caller maximum**.
5. **Consolidated Distribution UI**:
   - Merged "Distribute Now" and "Rebalance Leads" into a single header dropdown: `[ ⚖️ Distribute ▾ ]`.
   - "Claim Leads" button on `/queue` was killed so callers cannot manipulate distribution.
6. **Title-Casing Honorifics Spacing**:
   - Title casers must preserve whitespace after honorifics (`Dr. Archana's`, not `Dr.Archana's`).
7. **Stale Lead Recycling vs. Quarantine**:
   - CRON 3 `recycle_stale_leads()` was patched to filter `status NOT IN ('closed_won', 'closed_lost', 'dnc', 'not_interested')` so quarantined leads are never accidentally resurrected.
8. **Landing Page vs. Studio Routing Boundary**:
   - The root domain `https://pinsite.pro/` hosts the marketing landing page.
   - The entire Agency OS app is mounted under `/studio/*` (e.g., `/studio/login`, `/studio/signup`, `/studio/reset-password`, `/studio/forgot-password`, `/studio/queue`, `/studio/dashboard`).
   - All external email links (Invites, Password Recovery) must explicitly route to `/studio/...` so callers never land on the marketing site.
9. **Single In-Card Dial Button & Clean Mobile Nav**:
   - Removed the duplicate floating bottom dial bar from `/queue`.
   - Callers now dial directly from the large in-card `Dial Now` button with embedded live call duration timer (`Call in progress: MM:SS`).
   - The bottom of mobile viewports (< 768px) is dedicated exclusively to the high-contrast `MobileNav` bar (`Queue`, `Projects`, `Comms`, `Dashboard`) with zero overlapping clutter.
10. **Supabase Auth Redirect URL Whitelist (Strictly NO `www`)**:
    - Supabase Auth URL whitelist configuration only permits `https://pinsite.pro/**` (without `www.`).
    - When generating recovery or invite links, `redirectTo` MUST be explicitly set to `https://pinsite.pro/studio/reset-password` (never `https://www.pinsite.pro/...`).
    - If `www.` is passed to Supabase's `generateLink`, Supabase treats it as untrusted, silently drops the path, and redirects the user to the default root Site URL `https://pinsite.pro` (the marketing landing page).
    - As an extra fail-safe, `public/index.html` has an inline script in `<head>` that instantly intercepts any incoming hash fragments containing `type=recovery` or `access_token=` and forwards them to `/studio/reset-password`.
11. **Queue Fork by Role (`<CallerCockpit />` vs `<AdminQueue />`)**:
    - `/queue` is forked by user role rather than relying on CSS breakpoint hiding.
    - `CallerCockpit` provides a verified zero-scroll ergonomic cockpit (total height ~508px out of 844px on iPhone 12 Pro 390×844):
      - Workspace `CommandBar` search hidden on mobile (`hidden md:block`).
      - Top header with compact `Prev` / `Next` lead navigation buttons.
      - Business name (2-line clamp) + exact existing badge system (niche, area, attempt count, decision maker).
      - Target phone number block immediately below badges.
      - **Phone Formatter Rule**: Must handle 11-digit numbers starting with `0` (e.g. `09765407679`) by slicing off leading `0` so `core10` becomes `9765407679` and displays as `+91 97654 07679` (same exact formatter as Team Center).
      - High-contrast `DIAL NOW` button with live integrated call duration timer (`CALL IN PROGRESS: MM:SS`) pulsing when call is active.
      - `Log Outcome` button directly below dial.
      - Single collapsible `Details & History` disclosure affordance (website, address, maps, past call note remain hidden until tapped).
      - **Amber Pitch Needed Badge**: Website opportunity flag uses amber (`bg-amber-500/10 text-amber-700 border-amber-500/30`), not red.
      - **Bulletproof Dialer Auto-Open**: Armed via `dialerOpenedRef` and backed up by `sessionStorage.getItem("pinsite_dialer_active")`. Listens to `visibilitychange`, `window.focus`, and iOS Safari `pageshow` events to reliably slide up the disposition drawer when caller returns from dialing.
      - Dismissible PWA install banner supporting iOS Safari and mobile Chrome.
      - Zero deck queue list or coaching discussion clutter on mobile.
    - `AdminQueue` provides the complete 3-column desktop management deck (scope filters, lead reassignment, internal notes, 23-lead queue list, and toggle to preview Caller Cockpit).
12. **Supabase SSR Auth Cookie Preservation & 400-Day Persistence**:
    - Previously, users were logged out frequently because Next.js Edge Middleware returned `NextResponse.redirect()` without copying cookies from `supabaseResponse`.
    - In Supabase Auth, tokens rotate on refresh. When `supabase.auth.getUser()` in middleware refreshed an access/refresh token, returning a plain `NextResponse.redirect()` caused the browser to miss the new rotated refresh token. On subsequent requests, the old token was rejected as revoked, kicking the user back to the login screen.
    - Fixed by introducing `createRedirect(url, supabaseResponse)` in `src/lib/supabase/middleware.ts` which transfers all refreshed cookies to every redirect response.
    - Browser client (`src/lib/supabase/client.ts`) and middleware (`src/lib/supabase/middleware.ts`) now explicitly enforce persistent `maxAge: 400 * 24 * 60 * 60` (400-day) cookies, preventing the browser/mobile OS from purging session cookies on app close.

---

## 11. Decisions That Are Final (Do Not Revisit)

- **Blueprint is the single technical specification**: Refer to [`pinsite_mobile_team_lifecycle_blueprint.md`](./pinsite_mobile_team_lifecycle_blueprint.md).
- **Yadullah is a manager**: Never assign leads to him or include him in caller averages.
- **DNC data must be SHA-256 hashed**: DPDP compliance is mandatory.
- **Service role key must stay on the server**: Never expose in client bundles.
- **7-day quarantine holding period**: Rejected leads sit in quarantine for 7 days before automated soft-deletion.
- **System Bot UUID**: Seeded profile `00000000-0000-0000-0000-000000000001` handles automated channel posts.
- **No new crons for callbacks**: Callback push rides the existing 5-minute CRON 4.

---

## 12. Rules for Any Agent Working on This Project

1. **Never change Muzammil's password** (`muzammilpathan6047@gmail.com` / `AgencyOwner2026!`).
2. **Never treat managers as callers**: Yadullah is a manager.
3. **Always push to `main`**: Commits on `main` auto-deploy to `https://pinsite.pro`.
4. **Use semicolons, not `&&`** when chaining terminal commands in PowerShell.
5. **Never use the service role key client-side**: Only in server API routes.
6. **Always verify the build**: Run `npm run build` and ensure 0 errors before pushing.
7. **Mirror Mode must be dual-attributed**: Always record `acted_by` and `on_behalf_of`.
8. **DNC = SHA-256 hashes only**: Hash normalized phone numbers before storing in `dnc_blacklist`.
9. **Technical details live in the blueprint**:
   `c:\Users\Muzammil\Desktop\agency-os\pinsite_mobile_team_lifecycle_blueprint.md`
