# Quest Mode Guide: User Management System

> **Project:** User Management & RBAC System  
> **Status:** Ready to Start  
> **Estimated Time:** 1-2 hours  
> **Quest Type:** Feature Implementation with Architecture Design

---

## Overview

The current user management page has basic CRUD functionality but lacks modern UX, permission matrix, activity tracking, and invitation system. This quest transforms it into a production-grade user management system.

---

## Quest 1: Permission Matrix & Role-Based Access Control

**Prompt:**
> Design and implement a role-based access control (RBAC) system with a visual permission matrix. Create a database schema for permissions, map them to roles (Admin/Editor/Viewer), and build a UI showing which roles can access which features. Include middleware to enforce permissions on API routes.

**Anchor Files:**
- `prisma/schema.prisma` (add Permission, RolePermission models)
- `app/settings/users/page.tsx` (permission matrix UI)
- `app/api/users/route.ts` (permission validation)
- `lib/auth/permissions.ts` (new: permission checking logic)
- `middleware.ts` (new: route protection)

**Steps:**
1. Design permission schema in `schema.prisma`:
   ```prisma
   model Permission {
     id          String   @id @default(cuid())
     resource    String   // e.g., "users", "alarms", "devices"
     action      String   // "read", "write", "delete"
     roles       RolePermission[]
   }

   model RolePermission {
     id           String     @id @default(cuid())
     roleId       UserRole
     permissionId String
     permission   Permission @relation(fields: [permissionId], references: [id])
     @@unique([roleId, permissionId])
   }
   ```

2. Create `lib/auth/permissions.ts` with `canAccess(userId, resource, action)` function
3. Add middleware to protect routes: `app/api/[resource]/route.ts` checks permissions
4. Build permission matrix UI: Grid showing roles (columns) vs permissions (rows)
5. Add checkboxes to toggle permissions per role
6. Seed initial permissions: users (CRUD), alarms (read/write), devices (read/write), etc.

**Success Criteria:**
- ✅ Permission schema in database
- ✅ Middleware blocks unauthorized API calls (403 Forbidden)
- ✅ Permission matrix UI shows all permissions
- ✅ Admin can toggle permissions per role
- ✅ Viewer cannot edit users (UI hidden + API blocked)

**Test Commands:**
```bash
npx prisma migrate dev --name add-permissions
npm run build  # No TypeScript errors
curl http://localhost:8170/api/users  # Should return 403 for Viewer role
```

**Knowledge Capture:**
- [ ] Create ADR-005: Role-Based Access Control Architecture
- [ ] Update docs/10-architecture/OVERVIEW.md with permission system diagram
- [ ] Add permission matrix to docs/00-product/CONSTITUTION.md

---

## Quest 2: Modern User Card with Avatar & Activity

**Prompt:**
> Redesign the user list with modern card-based layout, avatar placeholders, activity status indicators, and inline actions. Show last login time, role badge, and recent activity (e.g., "Edited alarm 2 hours ago"). Add search/filter by name/email/role.

**Anchor Files:**
- `app/settings/users/page.tsx` (card grid layout)
- `components/ui/avatar.tsx` (new: avatar component)
- `app/api/users/route.ts` (add activity tracking)
- `prisma/schema.prisma` (add UserActivity model)

**Steps:**
1. Design activity schema:
   ```prisma
   model UserActivity {
     id        String   @id @default(cuid())
     userId    String
     user      User     @relation(fields: [userId], references: [id])
     action    String   // "login", "edit_user", "delete_alarm"
     details   Json?
     createdAt DateTime @default(now())
   }
   ```

2. Create avatar component with initials fallback (e.g., "John Doe" → "JD")
3. Build card grid: Each card shows avatar, name, role badge, status, last login
4. Add search bar: Filter by name/email/role
5. Add role filter dropdown: Show only Admins/Editors/Viewers
6. Display recent activity in expandable section (accordion)
7. Add inline actions: Edit, Delete, View Activity Log

**Success Criteria:**
- ✅ Modern card grid layout (responsive)
- ✅ Avatar with initials fallback
- ✅ Search/filter by name/email/role
- ✅ Activity log shows last 5 actions per user
- ✅ Stats cards: Total users, Active, Inactive, Admins

**Test Commands:**
```bash
npx prisma migrate dev --name add-user-activity
npm run dev
# Navigate to http://localhost:8170/settings/users
# Test search: type "admin" → filters to admin users only
# Test activity log: expand card → shows recent actions
```

**Knowledge Capture:**
- [ ] Document card design pattern in docs/20-design-system/CARD_PATTERNS.md
- [ ] Update components/README.md with Avatar component usage

---

## Quest 3: Invitation System with Email Verification

**Prompt:**
> Implement an invitation system where Admins can invite users via email. Send invitation email with verification link. User clicks link to set password and activate account. Track invitation status (pending/accepted/expired).

**Anchor Files:**
- `app/api/users/invite/route.ts` (new: invitation endpoint)
- `app/api/users/verify/route.ts` (new: email verification)
- `lib/email/sendInvitation.ts` (new: email sender)
- `app/settings/users/invitations/page.tsx` (new: invitation list)
- `prisma/schema.prisma` (add Invitation model)

**Steps:**
1. Design invitation schema:
   ```prisma
   model Invitation {
     id         String   @id @default(cuid())
     email      String   @unique
     role       UserRole @default(VIEWER)
     token      String   @unique
     invitedBy  String
     status     InvitationStatus @default(PENDING)
     expiresAt  DateTime
     acceptedAt DateTime?
     createdAt  DateTime @default(now())
   }

   enum InvitationStatus {
     PENDING
     ACCEPTED
     EXPIRED
   }
   ```

2. Create email service (use Nodemailer or SendGrid)
3. Build invitation dialog: Enter email, select role, send invitation
4. Generate secure token (crypto.randomBytes)
5. Send email with verification link: `http://localhost:8170/verify?token=xyz`
6. Build verification page: User sets password, account activated
7. Show invitation list: Pending/Accepted/Expired invitations
8. Auto-expire invitations after 7 days (cron job or check on access)

**Success Criteria:**
- ✅ Admin can send invitation via email
- ✅ Invitation email contains verification link
- ✅ User clicks link → sets password → account created
- ✅ Invitation list shows status (pending/accepted/expired)
- ✅ Expired invitations cannot be used

**Test Commands:**
```bash
npx prisma migrate dev --name add-invitations
npm run dev
# Send invitation → check email (or logs in dev mode)
# Click verification link → set password → login works
# Check invitation list: status = ACCEPTED
```

**Knowledge Capture:**
- [ ] Document email service setup in docs/30-runbooks/EMAIL_SETUP.md
- [ ] Add invitation flow diagram to docs/10-architecture/OVERVIEW.md
- [ ] Create ADR-006: Email Verification Strategy

---

## Quest 4: Password Management & Security

**Prompt:**
> Implement secure password hashing (bcrypt), password reset via email, and password strength validation. Add password change dialog for existing users. Enforce strong password policy (8+ chars, uppercase, number, special char).

**Anchor Files:**
- `lib/auth/password.ts` (new: hashing + validation)
- `app/api/users/password/route.ts` (new: password change endpoint)
- `app/api/users/reset-password/route.ts` (new: password reset)
- `app/settings/users/page.tsx` (password change dialog)
- `app/reset-password/page.tsx` (new: reset page)

**Steps:**
1. Install bcrypt: `npm install bcryptjs @types/bcryptjs`
2. Create password utilities:
   ```typescript
   export async function hashPassword(password: string): Promise<string>
   export async function verifyPassword(password: string, hash: string): Promise<boolean>
   export function validatePasswordStrength(password: string): { valid: boolean; errors: string[] }
   ```

3. Add password change dialog: Current password + new password + confirm
4. Implement password reset: Send email with reset link (similar to invitation)
5. Enforce password strength: Show requirements (✓ 8+ chars, ✓ uppercase, ✓ number, ✓ special)
6. Hash passwords before storing in database
7. Update login flow to verify password hash

**Success Criteria:**
- ✅ Passwords hashed with bcrypt (cost factor 12)
- ✅ Password change dialog works for authenticated users
- ✅ Password reset via email (token-based)
- ✅ Strong password validation (8+ chars, uppercase, number, special)
- ✅ UI shows password strength meter (weak/medium/strong)

**Test Commands:**
```bash
npm install bcryptjs @types/bcryptjs
npx prisma migrate dev --name add-password-field
npm run build  # No TypeScript errors
# Test password change: enter weak password → validation error
# Test password reset: request reset → check email → click link → set new password
```

**Knowledge Capture:**
- [ ] Document password security in docs/10-architecture/adr/ADR-007-password-security.md
- [ ] Add password policy to docs/00-product/CONSTITUTION.md

---

## Quest 5: Audit Log & Activity Timeline

**Prompt:**
> Build an audit log system tracking all user actions (login, create user, edit user, delete alarm, etc.). Display activity timeline per user and global audit log page. Filter by user, action type, date range.

**Anchor Files:**
- `prisma/schema.prisma` (add AuditLog model)
- `lib/audit/logger.ts` (new: audit logging utility)
- `app/api/audit/route.ts` (new: audit log API)
- `app/settings/audit/page.tsx` (new: audit log page)
- `app/settings/users/page.tsx` (activity timeline per user)

**Steps:**
1. Design audit log schema:
   ```prisma
   model AuditLog {
     id         String   @id @default(cuid())
     userId     String?  // null for system actions
     user       User?    @relation(fields: [userId], references: [id])
     action     String   // "user.login", "user.create", "alarm.delete"
     resource   String   // "user", "alarm", "device"
     resourceId String?  // ID of affected resource
     details    Json?
     ipAddress  String?
     userAgent  String?
     createdAt  DateTime @default(now())
   }
   ```

2. Create audit logger utility:
   ```typescript
   export async function logAudit(params: {
     userId?: string;
     action: string;
     resource: string;
     resourceId?: string;
     details?: any;
   }): Promise<void>
   ```

3. Add audit logging to all user actions (login, CRUD operations)
4. Build audit log page: Table with filters (user, action, date range)
5. Add activity timeline to user card: Shows last 10 actions
6. Export audit logs to CSV

**Success Criteria:**
- ✅ Audit log captures all user actions
- ✅ Audit log page with filters (user, action, date)
- ✅ Activity timeline per user (expandable in card)
- ✅ Export to CSV functionality
- ✅ Audit logs immutable (no update/delete)

**Test Commands:**
```bash
npx prisma migrate dev --name add-audit-log
npm run dev
# Perform actions (login, edit user) → check audit log page
# Filter by user → shows only that user's actions
# Export to CSV → downloads file
```

**Knowledge Capture:**
- [ ] Document audit logging in docs/30-runbooks/AUDIT_LOGGING.md
- [ ] Add audit requirements to docs/00-product/CONSTITUTION.md
- [ ] Create ADR-008: Audit Log Architecture

---

## Quest 6: Session Management & Active Sessions

**Prompt:**
> Implement session tracking showing which users are currently logged in, their active sessions (browser, IP, last activity), and ability to revoke sessions. Use JWT tokens with refresh mechanism.

**Anchor Files:**
- `lib/auth/session.ts` (new: session management)
- `app/api/auth/sessions/route.ts` (new: session endpoints)
- `app/settings/users/sessions/page.tsx` (new: active sessions UI)
- `prisma/schema.prisma` (add Session model)
- `middleware.ts` (JWT validation)

**Steps:**
1. Design session schema:
   ```prisma
   model Session {
     id           String   @id @default(cuid())
     userId       String
     user         User     @relation(fields: [userId], references: [id])
     token        String   @unique
     refreshToken String   @unique
     ipAddress    String?
     userAgent    String?
     lastActivity DateTime
     expiresAt    DateTime
     createdAt    DateTime @default(now())
   }
   ```

2. Implement JWT token generation (access token + refresh token)
3. Create session management utilities:
   ```typescript
   export async function createSession(userId: string, ip: string, userAgent: string): Promise<Session>
   export async function refreshSession(refreshToken: string): Promise<Session>
   export async function revokeSession(sessionId: string): Promise<void>
   export async function getActiveSessions(userId: string): Promise<Session[]>
   ```

4. Build active sessions UI: List of sessions with browser, IP, last activity
5. Add "Revoke" button to terminate session
6. Auto-expire sessions after 7 days (or configurable)
7. Show current session indicator ("This device")

**Success Criteria:**
- ✅ JWT tokens with refresh mechanism
- ✅ Active sessions list per user
- ✅ Revoke session functionality
- ✅ Session auto-expires after 7 days
- ✅ Current session indicator

**Test Commands:**
```bash
npm install jsonwebtoken @types/jsonwebtoken
npx prisma migrate dev --name add-sessions
npm run dev
# Login → check active sessions page
# Revoke session → user logged out
# Wait 7 days (or adjust expiry) → session auto-deleted
```

**Knowledge Capture:**
- [ ] Document session management in docs/10-architecture/adr/ADR-009-session-management.md
- [ ] Add session security to docs/00-product/CONSTITUTION.md

---

## Execution Order

1. **Quest 1: Permission Matrix** (foundation for all other features)
2. **Quest 2: Modern User Card** (improves UX immediately)
3. **Quest 5: Audit Log** (tracks all subsequent actions)
4. **Quest 3: Invitation System** (requires permissions + audit)
5. **Quest 4: Password Management** (requires invitation system)
6. **Quest 6: Session Management** (requires password + permissions)

---

## How to Use This Guide

1. **Open Cursor** in your project
2. **Copy Quest prompt** (e.g., Quest 1 prompt above)
3. **Paste into Cursor** and let it implement the feature
4. **Test** using provided test commands
5. **Review** and iterate
6. **Mark knowledge capture items** as complete
7. **Move to next Quest**

---

## Success Metrics

- ✅ All 6 Quests completed
- ✅ No TypeScript errors (`npm run build`)
- ✅ All tests passing
- ✅ Documentation updated (ADRs, runbooks)
- ✅ User management system production-ready

---

## Notes

- **Current state:** Basic CRUD exists, but no permissions, activity tracking, or password management
- **Dependencies:** Quest 1 (permissions) blocks most other Quests
- **Time estimate:** 1-2 hours per Quest (6-12 hours total)
- **Priority:** Quest 1 → Quest 2 → Quest 5 (core features), then Quests 3/4/6 (advanced)

---

**Last Updated:** 2026-02-17  
**Status:** Ready to Start
