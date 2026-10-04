# Pinsite Authentication & Authorization Architecture Audit (AUTH_AUDIT.md)

> **Document Status**: Production Security & Flow Audit  
> **Audited Version**: Pinsite v1.8 (Sprints 1–8 Shipped)  
> **Scope**: Pure Findings & Vulnerability Map (No Fixes Applied in this Pass)  
> **Target Project**: `c:\Users\Muzammil\Desktop\agency-os` (`pinsite.pro`)  
> **Date of Audit**: October 2026

---

## Executive Summary

Password recovery exists today: **Yes.**

The Pinsite authentication architecture relies on a hybrid model: Next.js 14 App Router with Edge Middleware (`@supabase/ssr`), Supabase GoTrue Auth (cloud-hosted at `tulnyoldbpwqdjpkqcxf.supabase.co`), PostgreSQL Row-Level Security (RLS) policies, and database triggers. While client session handling, token rotation preservation, and role-based redirect gating are operational, the audit revealed **1 CRITICAL security vulnerability**, **3 HIGH-severity architectural and routing gaps**, and multiple state/policy edge cases.

---

## Section 1 — Entry Paths (How Users Get In)

### 1.1 Full Trace of the Invite Lifecycle

```
[Manager in Team Center]
       │
       ▼  POST /api/invites
[API Route: src/app/api/invites/route.ts]
       │  ├─ verifyManagerSession() (Cookie / Bearer JWT)
       │  ├─ Checks existing email via admin.auth.admin.listUsers()
       │  ├─ Generates 16-char token: crypto.randomUUID().replace(/-/g, "").substring(0, 16)
       │  ├─ Sets expires_at = NOW() + 7 days
       │  └─ INSERT / UPDATE into public.invites
       │
       ▼  Resend REST API (https://api.resend.com/emails)
[Email Delivered to Operator]
  Subject: "You're invited to join Pinsite as [ROLE]"
  Link: "https://pinsite.pro/studio/signup?token=[16_CHAR_TOKEN]"
       │
       ▼  User Clicks Link
[Next.js Edge Middleware & Rewrite]
  next.config.mjs: Rewrites /studio/signup -> /signup
  src/lib/supabase/middleware.ts: Lines 68–71, 75, 80 (Identified as public route)
       │
       ▼
[Page Render: src/app/(auth)/signup/page.tsx]
       │  └─ useEffect() -> GET /api/invites/validate?token=[token]
       │     └─ src/app/api/invites/validate/route.ts checks public.invites
       │        (validates existence, accepted_at IS NULL, expires_at > NOW())
       │        Returns { valid: true, email, role }
       │
       ▼  User Enters Full Name & Password (min 6 chars)
[Submission: POST /api/auth/signup]
  src/app/api/auth/signup/route.ts
       │
       ├─ Step 1: Re-validates invite token in public.invites
       ├─ Step 2: supabase.auth.admin.createUser({ email: invite.email, password, email_confirm: true })
       │          │
       │          ▼ (PostgreSQL Trigger fires)
       │       auth.users INSERT -> trg on_auth_user_created -> public.handle_new_user()
       │       Inserts row into public.profiles: (id, full_name, role = 'caller')
       │
       ├─ Step 3: Service-role client upserts public.profiles:
       │          SET role = invite.role, full_name, active = true
       │
       ├─ Step 4: Service-role client updates public.invites:
       │          SET accepted_at = NOW(), accepted_by = userId
       │
       ▼
[Client Auto-Login & Navigation]
  src/app/(auth)/signup/page.tsx:
  await supabase.auth.signInWithPassword({ email: inviteData.email, password })
  Redirects to role workspace: /queue (caller), /projects (developer), /dashboard (manager/admin)
```

### 1.2 Files Involved in Entry Flow

| Component | File Path | Line Range | Role in Flow |
|---|---|---|---|
| Invite Generation | `src/app/api/invites/route.ts` | lines 72–202 | Manager session gate, token generator, DB insert, Resend email dispatch |
| Token Validation | `src/app/api/invites/validate/route.ts` | lines 4–52 | Read-only pre-flight check of token status (unaccepted & non-expired) |
| Onboarding Form | `src/app/(auth)/signup/page.tsx` | lines 9–259 | Client UI, token verification, credential input, auto-signin |
| Account Creation API | `src/app/api/auth/signup/route.ts` | lines 4–119 | Validates token, creates `auth.users`, updates `profiles`, marks invite consumed |
| Edge Middleware | `src/lib/supabase/middleware.ts` | lines 58–86 | Gating, token forwarding, public route definition |
| URL Rewriter | `next.config.mjs` | lines 11–14 | Rewrites `/studio/signup` to internal `/signup` |
| DB Trigger | `supabase/migrations/20260926000000_sprint1_schema.sql` | lines 415–436 | `handle_new_user()` creates default caller profile on auth user creation |
| Stored Procedure (Unused) | `supabase/migrations/20260926000000_sprint1_schema.sql` | lines 569–608 | `public.consume_invite(p_token, p_user_id)` (legacy/unwired atomic RPC) |

### 1.3 Edge Case Analysis

1. **Invite email ≠ signup email**:
   - In `src/app/(auth)/signup/page.tsx:191–202`, the UI locks the email display to `inviteData.email` and does not provide an editable email field.
   - In `src/app/api/auth/signup/route.ts:51–58`, the API ignores any user-supplied email in the request body and strictly binds `email: invite.email` from the verified invite database record.
   - In the database RPC `public.consume_invite()` (`sprint1_schema.sql:589–593`), an explicit exception is thrown if `LOWER(v_user_email) <> LOWER(v_invite.email)`.
   - **Result**: A user cannot register with an email different from the one invited.

2. **Invite expired**:
   - `src/app/api/invites/validate/route.ts:37–42` and `src/app/api/auth/signup/route.ts:43–48` check `new Date(invite.expires_at) < new Date()`.
   - Returns HTTP 400: `"This invitation has expired. Please ask your manager for a new link."`
   - Form shows an "Access Denied" error card and blocks submission.

3. **Invite already consumed**:
   - `src/app/api/invites/validate/route.ts:30–35` and `src/app/api/auth/signup/route.ts:36–41` check `invite.accepted_at IS NOT NULL`.
   - Returns HTTP 400: `"This invitation has already been accepted."`

4. **User clicks invite link twice**:
   - **First Click**: Full flow executes; account is created; `invites.accepted_at` is stamped.
   - **Second Click**: The page calls `/api/invites/validate?token=...`, receives HTTP 400 (`accepted_at` already populated), and renders the Access Denied alert with a direct link to sign in.
   - **If user is already logged in on second click**: Middleware (`src/lib/supabase/middleware.ts:161`) checks `((pathname === "/signup" || pathname === "/studio/signup") && !token)`. Because `token` is present in the query string, `!token` evaluates to `false`, meaning middleware **does NOT redirect the authenticated user to their workspace**; they remain on the signup page where the validation error is rendered.

5. **Direct signup attempt — bypassing the invite flow**:
   - **Middleware behavior**: Middleware **DOES NOT BLOCK** direct visits to `/signup` or `/studio/signup`. `pathname.startsWith("/signup")` is whitelisted as a public route (`src/lib/supabase/middleware.ts:75, 80`). Unauthenticated visitors without tokens are permitted to view the page (which displays a manual token entry box).
   - **Next.js API behavior**: `POST /api/auth/signup` rejects requests without a token (`src/app/api/auth/signup/route.ts:13–18`) with HTTP 400.
   - **Supabase GoTrue Auth API behavior (CRITICAL GAP)**: Live Supabase GoTrue endpoint (`POST https://tulnyoldbpwqdjpkqcxf.supabase.co/auth/v1/signup`) has `"disable_signup": false`. Any external user can call Supabase Auth directly using the public anon key. The database trigger `on_auth_user_created` fires and auto-creates a profile with `role = 'caller'`. The actor can then log in and access `/studio/queue` and `/studio/comms` without an invite. *(See Finding SEC-01).*

### 1.4 Origin of Core Administrative Accounts

1. **Muzammil (Owner / Super Admin)**:
   - **Email**: `muzammilpathan6047@gmail.com` | **UUID**: `a87c7c79-6c4c-4787-8132-8cff8f7a1e74`
   - **Origin**: The `auth.users` row was manually created in Supabase Auth. The `profiles` row is bootstrapped via a conditional SQL block in `supabase/COMPLETE_SETUP.sql:1463–1474`:
     ```sql
     DO $$
     BEGIN
       IF EXISTS (SELECT 1 FROM auth.users WHERE id = 'a87c7c79-6c4c-4787-8132-8cff8f7a1e74') THEN
         INSERT INTO public.profiles (id, full_name, role)
         VALUES ('a87c7c79-6c4c-4787-8132-8cff8f7a1e74', 'Muzammil (Owner)', 'admin')
         ON CONFLICT (id) DO UPDATE 
         SET role = 'admin', full_name = 'Muzammil (Owner)';
       END IF;
     END $$;
     ```
   - **Code Safeguards**: Hardcoded protections prevent password reset or role modification across `src/app/api/auth/reset-password/route.ts:57–65`, `src/app/api/manager/team/role/route.ts:14–15, 82–94`, and `src/app/api/manager/team/reset-password/route.ts:87–92`.

2. **Yadullah (Manager)**:
   - **Email**: *(Internal Account)*
   - **Origin**: **Completely unseeded.** Yadullah's account does not appear anywhere in `supabase/COMPLETE_SETUP.sql`, `supabase/seed.sql`, or any migration script. As documented in `HANDOFF.md:44, 212` and `pinsite_mobile_team_lifecycle_blueprint.md:43`, Yadullah was created manually in the live database / invited through normal channels and promoted to `manager` on September 27, 2026. A fresh staging or disaster recovery deployment from schema scripts will not create Yadullah's account.

---

## Section 2 — Login Flow

### 2.1 Supabase GoTrue Configuration in the Codebase

- **Authentication Provider**: Native Email & Password via GoTrue (`supabase.auth.signInWithPassword` in `src/app/(auth)/login/page.tsx:34–37`). OAuth and phone OTP providers are disabled.
- **Session Duration & Cookie Persistence**:
  - Browser Client (`src/lib/supabase/client.ts:4–14`): Enforces persistent cookies with `maxAge: 400 * 24 * 60 * 60` (400 days / 34,560,000 seconds), `sameSite: "lax"`, `path: "/"`.
  - Edge Middleware (`src/lib/supabase/middleware.ts:4–8`): Enforces identical 400-day `PERSISTENT_COOKIE_OPTIONS`.
- **Token Refresh Behavior**:
  - Middleware intercepts refreshed tokens during `supabase.auth.getUser()` calls via the `@supabase/ssr` `setAll` cookie handler (`src/lib/supabase/middleware.ts:39–50`).
  - To prevent session loss caused by Next.js dropping rotated tokens during redirects, `createRedirect()` (`src/lib/supabase/middleware.ts:14–23`) copies all refreshed cookies from `sourceResponse` onto the outgoing `NextResponse.redirect` (status 307).
- **GoTrue Configuration Files**: No local `supabase/config.toml` exists in the repository. All GoTrue server-side settings reside in Supabase Cloud.

### 2.2 Middleware Logic & Route Boundaries

`src/lib/supabase/middleware.ts:73–86`:
```ts
const isPublicRoute =
  pathname.startsWith("/login") ||
  pathname.startsWith("/signup") ||
  pathname.startsWith("/forgot-password") ||
  pathname.startsWith("/reset-password") ||
  pathname.startsWith("/unauthorized") ||
  pathname.startsWith("/studio/login") ||
  pathname.startsWith("/studio/signup") ||
  pathname.startsWith("/studio/forgot-password") ||
  pathname.startsWith("/studio/reset-password") ||
  pathname.startsWith("/studio/unauthorized") ||
  pathname.startsWith("/api") ||
  pathname === "/" ||
  pathname === "/studio";
```

- **Protected Routes**: Any route not matching `isPublicRoute`, notably:
  - `/queue`, `/studio/queue`
  - `/dashboard`, `/studio/dashboard`
  - `/projects`, `/studio/projects`
  - `/comms`, `/studio/comms`
  - `/manager/*`, `/studio/manager/*`
- **Unauthenticated / Expired Session Redirect**:
  - `src/lib/supabase/middleware.ts:98–102`: If `!user && !isPublicRoute`, returns `createRedirect("/studio/login", supabaseResponse, 307)`.
- **Authenticated User on Public Entry Routes**:
  - `src/lib/supabase/middleware.ts:156–168`: If authenticated and accessing `/studio`, `/login`, `/studio/login`, or `/signup` without a token:
    - `role === 'caller'` $\rightarrow$ redirected to `/studio/queue`
    - `role === 'developer'` $\rightarrow$ redirected to `/studio/projects`
    - `role === 'manager' | 'admin'` $\rightarrow$ redirected to `/studio/dashboard`
- **Role-Based Authorization Boundaries**:
  - `src/lib/supabase/middleware.ts:172–182`: Callers accessing `/dashboard`, `/projects`, or `/manager/*` are redirected with status 307 to `/studio/unauthorized`.
  - `src/lib/supabase/middleware.ts:184–194`: Developers accessing `/dashboard`, `/queue`, or `/manager/*` are redirected with status 307 to `/studio/unauthorized`.
  - Managers and Admins have unrestricted access to all routes.

### 2.3 Wrong Password & Lockout Behavior

- **Implementation**: `src/app/(auth)/login/page.tsx:28–57`.
- **Rate Limiting**: **Zero application-level rate limiting exists.** There is no Redis, Upstash, or database attempt counter tracking failed logins.
- **Account Lockout**: There is **no account lockout** after N failed attempts. A caller or attacker can submit password guesses continuously until Supabase GoTrue's default cloud-level IP rate limit is reached (default 30 requests per minute per IP).
- **Error Presentation**: Returns raw GoTrue error message (or fallback `"Invalid email or password."`) rendered in an alert badge (`src/app/(auth)/login/page.tsx:54, 80–84`).

### 2.4 Stale Session with Old Role (Caller Promoted to Manager)

- **Server-Side Middleware Recognition**: **Instant.** On every request, `src/lib/supabase/middleware.ts:111–120` queries `public.profiles` directly:
  ```ts
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, active")
    .eq("id", user.id)
    .maybeSingle();
  ```
  Because the query hits the database row rather than relying solely on the JWT, middleware recognizes the updated role immediately. The user will not be blocked from `/dashboard` or `/manager/team` on subsequent page loads.
- **Client-Side UI Desynchronization**: **Stale until hard reload.** `FloatingSidebar.tsx:28–48` loads the profile role once on mount via `useEffect`. Because `FloatingSidebar` is mounted in `src/app/(workspace)/layout.tsx`, Next.js App Router preserves the layout during soft client-side navigation. The sidebar will continue to render caller navigation links and omit manager items until the user manually triggers a hard page refresh (`F5` / `Ctrl+R`) or logs out and back in. *(See Finding SEC-05).*

---

## Section 3 — Logout Flow

### 3.1 Implementation Locations & Cleanup Scope

Logout logic is duplicated across two independent locations:

1. **Desktop / Sidebar**: `src/components/layout/FloatingSidebar.tsx:50–56`
   ```ts
   async function handleLogout() {
     try {
       await supabase.auth.signOut();
     } catch (e) {}
     document.cookie = "agency_demo_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
     router.push("/login");
   }
   ```
2. **Mobile Caller Cockpit**: `src/components/queue/CallerCockpit.tsx:1802–1805`
   ```ts
   onClick={async () => {
     await supabase.auth.signOut();
     router.push("/login");
   }}
   ```

### 3.2 Session Invalidation Mechanism

- **Server-Side Invalidation**: `supabase.auth.signOut()` calls GoTrue `POST /auth/v1/logout` with the active Bearer token. GoTrue deletes the active session from `auth.sessions` and revokes the refresh token server-side.
- **Cookie Deletion**: `@supabase/ssr` deletes the auth session cookies (`sb-<ref>-auth-token`).
- **Failure Mode / Exception Handling**: Both handlers wrap `signOut()` in try/catch and swallow errors. If network connectivity drops or GoTrue fails, the server-side session remains valid in Supabase until expiration, though browser cookies are dropped.
- **Cleanup Gaps**:
  - `CallerCockpit.tsx` does **not** clear the `agency_demo_role` cookie.
  - Neither component clears `sessionStorage` (e.g., `pinsite_dialer_active` used by caller auto-drawer logic) or `localStorage`.

### 3.3 Redirect Target

- Both components execute `router.push("/login")` (lines `FloatingSidebar.tsx:56` and `CallerCockpit.tsx:1804`).
- **Inconsistency**: Project routing standards (`HANDOFF.md:231–232`) mandate that all app links reside under `/studio/*` to prevent collisions with the marketing landing page. Edge middleware redirects unauthenticated users to `/studio/login` (`src/lib/supabase/middleware.ts:100`), but the client logout explicitly routes to `/login`.

---

## Section 4 — Password Recovery

**Password recovery exists today: Yes.** (Shipped in Sprint 6).

### 4.1 Full Recovery Trace

```
[1. User visits /forgot-password]
  src/app/(auth)/forgot-password/page.tsx
  Enters operator email -> clicks "Send Recovery Link"
       │
       ▼  POST /api/auth/forgot-password
[2. Backend Handler: src/app/api/auth/forgot-password/route.ts]
  - Normalizes email
  - Calls admin.auth.admin.generateLink({
      type: "recovery",
      email: normalizedEmail,
      options: { redirectTo: "https://pinsite.pro/studio/reset-password" }
    })
  - Verifies profile is not soft-deleted or inactive (lines 45–55)
  - Enforces redirectTo = "https://pinsite.pro/studio/reset-password" (no www)
  - Sends branded transactional HTML email via Resend API (invites@pinsite.pro)
       │
       ▼  User Receives Email & Clicks "Reset Password ->"
[3. Supabase GoTrue Verification]
  https://tulnyoldbpwqdjpkqcxf.supabase.co/auth/v1/verify?token=...&type=recovery&redirect_to=https://pinsite.pro/studio/reset-password
       │
       ▼  Redirect to Application
[4. Arrival at https://pinsite.pro/studio/reset-password#access_token=...&type=recovery]
  Next.js Middleware: src/lib/supabase/middleware.ts:82 recognizes /studio/reset-password as public
  Page: src/app/(auth)/reset-password/page.tsx
  - Supabase client processes hash fragment via onAuthStateChange ("PASSWORD_RECOVERY")
  - Renders password input with real-time strength meter (8+ chars, uppercase, lowercase, special/number)
       │
       ▼  User Submits Form
[5. Password Update Execution]
  POST /api/auth/reset-password (with Authorization: Bearer <session_token>)
  src/app/api/auth/reset-password/route.ts
  - Authenticates caller session from cookie or Bearer token (lines 17–35)
  - Safeguard: Blocks reset attempt if target is muzammilpathan6047@gmail.com (lines 57–65)
  - admin.auth.admin.updateUserById(userId, { password: newPassword })
  - admin.from("profiles").update({ require_password_change: false }) (lines 80–87)
  - Returns { success: true, role }
       │
       ▼
[6. Redirect to Workspace]
  Redirects to role destination (/queue, /projects, or /dashboard)
```

### 4.2 Manager Server-Side Password Reset

In addition to self-service recovery, managers can set temporary passwords:
- **Endpoint**: `POST /api/manager/team/reset-password` (`src/app/api/manager/team/reset-password/route.ts:51–136`).
- **Mechanism**: Updates target user password in Supabase Auth via `admin.auth.admin.updateUserById`, then sets `require_password_change = true` and `temp_password_issued_at = NOW()` on `public.profiles`.
- **Forced Gate**: On subsequent login, middleware intercepts the user and returns `307 Temporary Redirect` to `/studio/reset-password?forced=true` (`src/lib/supabase/middleware.ts:141–154`).

### 4.3 Verification of Earlier "Password Change Loop" Bug

- **Status**: **Fixed in main flow, but 1 edge case remains.**
  - **Why it was looping previously**: Middleware intercepted all requests when `require_password_change === true` and redirected to `/reset-password`. If `/api/auth/reset-password` or `/studio/reset-password` were caught in the redirect, or if the profile flag was not updated before the redirect, the user was trapped in a continuous 307 loop.
  - **Current Main Flow Fix**:
    1. Middleware (`src/lib/supabase/middleware.ts:143–148`) explicitly excludes `/reset-password`, `/studio/reset-password`, `/login`, `/studio/login`, and `/api/*` from the forced change redirect.
    2. `src/app/api/auth/reset-password/route.ts:80–87` updates `require_password_change = false` in the database via the admin client *before* returning HTTP 200.
    3. Middleware reads `require_password_change` directly from the database on every request, so the updated flag is recognized immediately upon routing to `/queue`.
  - **Remaining Edge Case (Finding SEC-02)**: If GoTrue redirects the user to the root URL (`https://pinsite.pro/#access_token=...`), the request is served by `src/app/route.ts` using `LANDING_HTML` from `src/lib/landingHtml.ts`. `LANDING_HTML` **does not have the hash interceptor script** that exists in `public/index.html:6–10`, leaving the user stranded on the landing page.

---

## Section 5 — Roles & Permissions

### 5.1 Verification of `handle_new_user()`

Definition from `supabase/migrations/20260926000000_sprint1_schema.sql:415–431`:
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
    'caller'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
```
- **Confirmation**: `role = 'caller'` is a literal string constant on line 426.
- It does **not** read `NEW.raw_user_meta_data->>'role'` or `NEW.raw_app_meta_data->>'role'`.
- Even if a malicious actor passes `{ "role": "admin" }` in raw user metadata during signup, `handle_new_user()` strictly writes `'caller'`.

### 5.2 Verification of `prevent_role_self_change()`

Definition from `supabase/migrations/20260926000000_sprint1_schema.sql:390–407`:
```sql
CREATE OR REPLACE FUNCTION public.prevent_role_self_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Allow bypass only if explicitly enabled inside trusted consume_invite RPC
  IF current_setting('agency_os.invite_bypass', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF OLD.role IS DISTINCT FROM NEW.role AND current_user_role() NOT IN ('manager', 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Only managers and admins can modify user roles';
  END IF;
  RETURN NEW;
END;
$$;
```

**Attack Simulation**: Can a caller execute `supabase.from("profiles").update({ role: "admin" }).eq("id", callerId)`?
1. **RLS Check**: Policy `"profiles_update"` (`sprint1_schema.sql:1141–1143`) allows `USING (id = auth.uid()) WITH CHECK (id = auth.uid())`. **RLS passes the update.**
2. **Trigger Evaluation**: `BEFORE UPDATE` trigger `trg_prevent_role_self_change` executes `prevent_role_self_change()`.
3. `current_setting('agency_os.invite_bypass', true)` is empty (`NULL`). Bypass fails.
4. `OLD.role` (`'caller'`) is distinct from `NEW.role` (`'admin'`).
5. `current_user_role()` runs `SELECT role FROM public.profiles WHERE id = auth.uid()`, returning `'caller'`.
6. `'caller' NOT IN ('manager', 'admin')` is `TRUE`.
7. **Result**: Raises exception `Unauthorized: Only managers and admins can modify user roles`. The transaction rolls back. Self-promotion via direct client update is **fully blocked**.
- **Important Distinction**: The block is enforced by the **database trigger**, NOT by Row-Level Security.

### 5.3 Verification of `consume_invite()`

Definition from `supabase/migrations/20260926000000_sprint1_schema.sql:569–608`:
- Checks `SELECT id, email, role INTO v_invite FROM public.invites WHERE token = p_token AND expires_at > NOW() AND accepted_at IS NULL FOR UPDATE;`.
- Checks `SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;`.
- Line 591: `IF v_user_email IS NULL OR LOWER(v_user_email) <> LOWER(v_invite.email) THEN RAISE EXCEPTION 'Invite email does not match authenticated user';`.
- **Finding**: Email verification inside `consume_invite()` cannot be skipped.
- **Architectural Disconnect**: As noted in Finding SEC-03, this stored procedure is **completely dead code**. The application executes signup via `src/app/api/auth/signup/route.ts` and never calls `consume_invite()`.

### 5.4 Comprehensive RLS Matrix Audit (`public.profiles`, `auth.users`, `public.invites`)

| Table | Operation | Policy Name | Permitted Roles / Rule | Gap / Security Concern |
|---|---|---|---|---|
| `public.profiles` | `SELECT` | `"profiles_select"` | `authenticated` where `active = TRUE AND deleted_at IS NULL` | **Information Disclosure**: Any authenticated caller can view phone numbers of all agency staff via `supabase.from('profiles').select('*')`. (Finding SEC-09). |
| `public.profiles` | `UPDATE` | `"profiles_update"` | `id = auth.uid() OR current_user_role() IN ('manager', 'admin')` | RLS does not restrict column updates; role column protection relies entirely on trigger. |
| `public.profiles` | `INSERT` | *(None)* | Denied to all `authenticated` and `anon` | None. Profile insertion correctly reserved for `handle_new_user()` trigger or service-role. |
| `public.profiles` | `DELETE` | *(None)* | Denied to all `authenticated` and `anon` | None. Profiles are soft-deleted via `deleted_at`. |
| `public.invites` | `ALL` | `"invites_manager_all"` | `current_user_role() IN ('manager', 'admin')` | None. Callers and anonymous users cannot read or write to `public.invites` directly. |
| `auth.users` | `ALL` | *(GoTrue Internal)* | Supabase Auth Managed | Standard GoTrue boundaries. Regular callers cannot query `auth.users`. |

---

## Section 6 — Known-Issue Verification

| Item | Status | Verification & Evidence |
|---|---|---|
| **Password change loop** | **FIXED** (with edge case) | Excluded `/reset-password`, `/studio/reset-password`, and `/api/*` from forced middleware redirect (`middleware.ts:143–148`). `POST /api/auth/reset-password:80–87` resets `require_password_change` in DB before redirecting. *Edge case: Root HTML missing hash interceptor.* |
| **Middleware public routes (correct list?)** | **OVERLY PERMISSIVE** | `pathname.startsWith("/api")` is whitelisted (`middleware.ts:84`), stripping middleware auth defense-in-depth from all API routes. `/signup` is accessible without a token (`middleware.ts:75, 80`). |
| **Auth.users FK bootstrap issue** | **FIXED** | System Bot (`00000000-0000-0000-0000-000000000001`) inserts into `auth.users` before `profiles` (`sprint6_lifecycle_recovery.sql:79–96`). Muzammil profile bootstrap checks `IF EXISTS (SELECT 1 FROM auth.users ...)` (`COMPLETE_SETUP.sql:1468`). |
| **Direct signup blocking** | **NOT FIXED** | Supabase GoTrue setting `"disable_signup": false` allows uninvited actors to POST directly to `${SUPABASE_URL}/auth/v1/signup`. `handle_new_user()` creates `caller` profile automatically. *(Finding SEC-01).* |
| **Invite race condition (v1.4 atomic invites)** | **NOT FIXED** | `src/app/api/auth/signup/route.ts` abandoned the atomic `consume_invite()` RPC in favor of separate non-transactional REST queries. Concurrent requests with same token can race during `createUser` and profile upsert. *(Finding SEC-03).* |

---

## Section 7 — Attack Surface Verification

### 7.1 Attack Vector Test Log & Evidence

#### 1. Sign up directly at /auth/signup or Supabase auth URL — blocked?
- **Next.js `/api/auth/signup`**: **BLOCKED.** Requires `token` parameter; returns HTTP 400.
- **Supabase GoTrue Endpoint (`POST /auth/v1/signup`)**: **NOT BLOCKED.**
- **Evidence**:
  ```powershell
  $headers = @{ "apikey" = "sb_publishable_TD6aeu4bXA6yAZgFHGqZeQ_7qEM2fkw" }
  $response = Invoke-RestMethod -Uri "https://tulnyoldbpwqdjpkqcxf.supabase.co/auth/v1/settings" -Headers $headers -Method Get
  $response.disable_signup # Returns: False
  $response.external.email  # Returns: True
  ```
  Because `disable_signup` is `false`, any caller can register an account directly against GoTrue. The trigger `on_auth_user_created` creates a caller profile in `public.profiles`, granting access to the app deck.

#### 2. Call `consume_invite()` with a different email than the invite was sent to — rejected?
- **Result**: **REJECTED.**
- **Evidence**: `supabase/migrations/20260926000000_sprint1_schema.sql:589–593`:
  ```sql
  SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;
  IF v_user_email IS NULL OR LOWER(v_user_email) <> LOWER(v_invite.email) THEN
    RAISE EXCEPTION 'Invite email does not match authenticated user';
  END IF;
  ```
  PostgreSQL aborts execution with an unhandled user mismatch exception.

#### 3. Call Supabase client to update profiles set role = 'admin' where id = <caller_id> — blocked by RLS?
- **Result**: **BLOCKED BY TRIGGER, NOT BY RLS.**
- **Evidence**:
  - RLS Policy `"profiles_update"` (`sprint1_schema.sql:1141–1143`):
    `USING (id = auth.uid()) WITH CHECK (id = auth.uid())` $\rightarrow$ Evaluates to `TRUE`. RLS permits the statement.
  - Trigger `trg_prevent_role_self_change` (`sprint1_schema.sql:402–404`):
    `OLD.role IS DISTINCT FROM NEW.role AND current_user_role() NOT IN ('manager', 'admin')` $\rightarrow$ Throws exception: `"Unauthorized: Only managers and admins can modify user roles"`.

#### 4. Reuse a consumed invite token — rejected?
- **Result**: **REJECTED.**
- **Evidence**:
  - `src/app/api/invites/validate/route.ts:30–35`: Checks `invite.accepted_at` $\rightarrow$ Returns HTTP 400: `"This invitation has already been accepted."`.
  - `src/app/api/auth/signup/route.ts:36–41`: Re-checks `invite.accepted_at` $\rightarrow$ Returns HTTP 400: `"This invitation has already been accepted."`.
  - Stored procedure `consume_invite()` line 581: Requires `accepted_at IS NULL` $\rightarrow$ Throws `"Invalid or expired invite token"`.

#### 5. Login with an expired JWT — clean redirect or error?
- **Result**: **CLEAN REDIRECT on Web Pages; CLEAN HTTP 401 on API Routes.**
- **Evidence**:
  - Web routes: `src/lib/supabase/middleware.ts:89–102`. When `supabase.auth.getUser()` fails due to expired access and refresh tokens, `user` is `null`. Line 98 evaluates `!user && !isPublicRoute` to `true`, executing `createRedirect("/studio/login", supabaseResponse, 307)`. Clean redirect without 500 error.
  - API routes: `src/app/api/queue/outcome/route.ts:28–30` (and counterpart API routes). Evaluates `if (!user)` and returns `NextResponse.json({ error: "Unauthorized: Active session required" }, { status: 401 })`.

---

## Detailed Findings Map

```
================================================================================
FINDING SEC-01 [CRITICAL]
Direct Supabase GoTrue Auth Signup Enabled (disable_signup: false)
================================================================================
File: https://tulnyoldbpwqdjpkqcxf.supabase.co/auth/v1/settings
Database Reference: supabase/migrations/20260926000000_sprint1_schema.sql:415–436
Current behavior:
  Supabase GoTrue project configuration has disable_signup set to false. Anyone 
  with the public publishable anon key (sb_publishable_TD6aeu4bXA6yAZgFHGqZeQ_7qEM2fkw) 
  can submit an HTTP POST directly to ${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/signup. 
  When GoTrue inserts the new record into auth.users, the database trigger 
  on_auth_user_created automatically executes handle_new_user(), which creates 
  a profile row with role = 'caller'. The actor can then sign in and access 
  the /studio/queue and /studio/comms workspace without receiving or consuming 
  an invitation.
Expected behavior:
  Public signups must be blocked. Direct registration against GoTrue should return 
  "Signups not allowed for this instance" (disable_signup: true in GoTrue settings), 
  or a BEFORE INSERT trigger on auth.users must verify that the incoming email matches 
  a pending invite in public.invites.
Evidence:
  Live GoTrue settings response from https://tulnyoldbpwqdjpkqcxf.supabase.co/auth/v1/settings:
  {
    "disable_signup": false,
    "external": { "email": true },
    "mailer_autoconfirm": false
  }
Fix complexity: S (Toggle "Disable email signups" in Supabase Auth dashboard or configure via Supabase Management API)

================================================================================
FINDING SEC-02 [HIGH]
Root Landing Page LANDING_HTML Drops Auth Recovery Tokens (Missing Hash Interceptor)
================================================================================
File: src/lib/landingHtml.ts:1 & src/app/route.ts:7–14
Current behavior:
  public/index.html (lines 6–10) contains an inline script in <head> to capture 
  and forward #type=recovery or #access_token= hash fragments to /studio/reset-password. 
  However, Next.js handles root traffic (GET /) via src/app/route.ts, which returns 
  the static string constant LANDING_HTML from src/lib/landingHtml.ts. LANDING_HTML 
  does NOT contain this script. If Supabase Auth redirects a recovery or invite link 
  to the root URL (https://pinsite.pro/#access_token=...), the user is stranded on 
  the marketing page with no password reset form or redirection.
Expected behavior:
  LANDING_HTML in src/lib/landingHtml.ts must include the same client-side script in <head> 
  as public/index.html to guarantee recovery fragments are forwarded to /studio/reset-password.
Evidence:
  Regex search in src/lib/landingHtml.ts for "type=recovery" returned 0 matches. 
  public/index.html lines 6–10:
  <script>
  if (typeof window !== 'undefined' && window.location.hash && 
     (window.location.hash.includes('type=recovery') || window.location.hash.includes('access_token='))) {
    window.location.replace('/studio/reset-password' + window.location.hash);
  }
  </script>
Fix complexity: S

================================================================================
FINDING SEC-03 [HIGH]
Abandoned Atomic Invite RPC (consume_invite) Causes Non-Atomic Invite Consumption
================================================================================
File: src/app/api/auth/signup/route.ts:51–105 vs supabase/migrations/20260926000000_sprint1_schema.sql:569–608
Current behavior:
  The v1.4 atomic invite procedure public.consume_invite() (which implements FOR UPDATE 
  locking and sets agency_os.invite_bypass in a single transaction) was never wired up 
  in the application. src/app/api/auth/signup/route.ts runs four disconnected queries: 
  unlocked SELECT on invites, auth.admin.createUser(), profiles.upsert(), and invites.update(). 
  If two requests with the same token hit simultaneously, or if the server crashes between 
  user creation and invite consumption, the user account is created with default role 'caller' 
  while the invite remains unconsumed or in a corrupted state.
Expected behavior:
  Account creation and invite consumption should be transactionally synchronized, or the route 
  should call the validated consume_invite() stored procedure.
Evidence:
  src/app/api/auth/signup/route.ts lines 79–105 perform independent asynchronous REST calls 
  with no database transaction. consume_invite is mentioned 0 times across all src/ files.
Fix complexity: M

================================================================================
FINDING SEC-04 [HIGH]
Wholesale Exclusion of All /api/* Routes from Edge Middleware Defense
================================================================================
File: src/lib/supabase/middleware.ts:84
Current behavior:
  pathname.startsWith("/api") is unconditionally included in isPublicRoute. Next.js 
  Edge Middleware bypasses all authentication, session refresh, and role validation 
  for every route under /api/*. While individual route handlers currently call 
  verifyManagerSession() or createServerClient(), any newly created API route or route 
  with a missed authorization check is exposed to the public internet without perimeter defense.
Expected behavior:
  isPublicRoute should explicitly whitelist only public auth endpoints (e.g. /api/auth/forgot-password, 
  /api/auth/reset-password, /api/auth/signup, /api/invites/validate). All other API endpoints 
  (/api/manager/*, /api/queue/*, /api/leads/*) must be protected at the middleware perimeter.
Evidence:
  src/lib/supabase/middleware.ts line 84:
    pathname.startsWith("/api") ||
Fix complexity: S

================================================================================
FINDING SEC-05 [MEDIUM]
Client-Side State Desynchronization on Role Promotion (Stale Role in UI)
================================================================================
File: src/components/layout/FloatingSidebar.tsx:28–48 & src/app/(workspace)/layout.tsx:1–28
Current behavior:
  FloatingSidebar queries the user profile once on mount inside a one-shot useEffect. 
  Because WorkspaceLayout preserves layout components during App Router soft navigation, 
  promoting a caller to manager updates the database and edge middleware instantly, but 
  the caller's active browser continues to display caller navigation links until a manual 
  hard reload (F5) or logout/login is performed.
Expected behavior:
  FloatingSidebar should subscribe to Supabase Realtime changes on public.profiles 
  for auth.uid() or revalidate the profile role on route changes.
Evidence:
  FloatingSidebar.tsx lines 28–48: loadUser() has dependency array [supabase] and no Realtime 
  listener.
Fix complexity: M

================================================================================
FINDING SEC-06 [MEDIUM]
Inconsistent Logout Cleanup and Canonical Route Divergence
================================================================================
File: src/components/layout/FloatingSidebar.tsx:50–56 & src/components/queue/CallerCockpit.tsx:1802–1805
Current behavior:
  Logout logic is implemented independently in two places with divergent behavior. 
  FloatingSidebar clears the agency_demo_role cookie; CallerCockpit does not. Neither 
  handler clears sessionStorage (leaving dialer state intact). Both handlers execute 
  router.push("/login") instead of the canonical /studio/login path mandated by project 
  standards.
Expected behavior:
  A single, shared auth utility (e.g., signOutAndRedirect()) that wipes auth cookies, 
  removes demo cookies, clears sessionStorage/localStorage, and redirects to /studio/login.
Evidence:
  CallerCockpit.tsx:1802–1805 vs FloatingSidebar.tsx:50–56.
Fix complexity: S

================================================================================
FINDING SEC-07 [MEDIUM]
Unauthenticated Visitors Allowed to Access /signup Without Token Parameter
================================================================================
File: src/lib/supabase/middleware.ts:68–71, 75, 80
Current behavior:
  While line 68 allows /signup when accompanied by a token, lines 75 and 80 list 
  pathname.startsWith("/signup") and pathname.startsWith("/studio/signup") under 
  isPublicRoute. An unauthenticated user navigating directly to /signup or /studio/signup 
  without a token query parameter is not redirected to login; the onboarding form loads 
  and renders a manual token entry input.
Expected behavior:
  If onboarding is strictly invite-link driven, navigating to /signup without a valid 
  ?token= query parameter should redirect to /studio/login.
Evidence:
  src/lib/supabase/middleware.ts lines 75 and 80.
Fix complexity: S

================================================================================
FINDING SEC-08 [LOW]
consume_invite RPC Parameter Injection Vulnerability
================================================================================
File: supabase/migrations/20260926000000_sprint1_schema.sql:569–608
Current behavior:
  The stored procedure public.consume_invite(p_token TEXT, p_user_id UUID) accepts 
  p_user_id as an arbitrary parameter rather than reading auth.uid() directly. While it 
  verifies that auth.users.email matches invites.email, any authenticated caller who 
  obtains another user's UUID and invite token could call the RPC to trigger consumption 
  on behalf of that target user.
Expected behavior:
  The stored procedure should remove p_user_id as a parameter and enforce p_user_id := auth.uid().
Evidence:
  sprint1_schema.sql line 569:
  CREATE OR REPLACE FUNCTION public.consume_invite(p_token TEXT, p_user_id UUID)
Fix complexity: S

================================================================================
FINDING SEC-09 [LOW]
Employee Phone Numbers Exposed to All Authenticated Callers via Profiles RLS
================================================================================
File: supabase/migrations/20260926000000_sprint1_schema.sql:1136–1139
Current behavior:
  RLS policy "profiles_select" permits any authenticated user to SELECT all columns 
  where active = TRUE AND deleted_at IS NULL. While the public view public.profiles_public 
  (lines 54–57) omits phone numbers, the underlying table public.profiles has no column-level 
  security. Any caller can run supabase.from('profiles').select('*') to dump the personal 
  phone numbers of all callers, managers, and administrators.
Expected behavior:
  Phone column access should be restricted via column-level privileges, or "profiles_select" 
  should be scoped so callers can only view their own phone number while managers/admins 
  view all.
Evidence:
  sprint1_schema.sql lines 1136–1139:
  CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
    USING (active = TRUE AND deleted_at IS NULL);
Fix complexity: S

================================================================================
FINDING SEC-10 [LOW]
Core Administrative Accounts Lack Resilient Automated DB Seeding
================================================================================
File: supabase/COMPLETE_SETUP.sql:1463–1474 & HANDOFF.md:44–54
Current behavior:
  Muzammil's admin profile bootstrap is conditional on an existing auth user with UUID 
  a87c7c79-6c4c-4787-8132-8cff8f7a1e74, which is not seeded by the migration. Yadullah's 
  manager account is absent from all database schema and seed files. Spinning up a fresh 
  database instance from schema migrations creates zero manager or admin accounts, 
  requiring manual SQL intervention to establish workspace ownership.
Expected behavior:
  A dedicated seed file (or idempotent bootstrap script) that reliably provisions initial 
  administrative credentials.
Evidence:
  COMPLETE_SETUP.sql lines 1466–1474; absence of Yadullah in supabase/ directory.
Fix complexity: S
```
