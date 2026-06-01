# UI Architecture & Authentication

> **Last Updated:** 2026-02-17  
> **Status:** Production  
> **Related:** CHANGELOG.md, QUEST_MODE_USER_MANAGEMENT.md

---

## Overview

InfraScope uses a **dual-bar navigation architecture** with integrated authentication system:

- **Sidebar** (left): Full navigation menu + dynamic user profile
- **TopBar** (top): Notifications + compact user profile
- **Auth System:** Login/logout with bcrypt, localStorage sessions, activity tracking

---

## Architecture

### Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│  SIDEBAR (64px-256px)  │  TOPBAR (64px)                    │
│                        │                          🔔 👤    │
│  [Logo] InfraScope     │                     Fatih Ç. ▼    │
│                        │                     Sys Admin     │
│  ▼ Dashboard           │                                   │
│    - Genel Sağlık      │  ┌─────────────────────────────┐ │
│    - Kritik Alarmlar   │  │                             │ │
│                        │  │   Content Area (scrollable) │ │
│  ▼ Infrastructure      │  │                             │ │
│    - Locations         │  │   {children}                │ │
│    - Racks             │  │                             │ │
│    - Devices           │  │                             │ │
│                        │  └─────────────────────────────┘ │
│  [Theme Toggle]        │                                   │
│  [FC] Fatih Çelebigil  │                                   │
│  fatih@... (clickable) │                                   │
└─────────────────────────────────────────────────────────────┘
```

### Component Hierarchy

```
app/layout.tsx
├── <NavigationProgress />
├── <div className="flex min-h-screen">
│   ├── <Sidebar />
│   │   ├── Logo + Title
│   │   ├── Navigation Sections (collapsible)
│   │   ├── Theme Toggle
│   │   └── <UserProfile collapsed={isCollapsed} />
│   └── <main className="flex-1 flex flex-col">
│       ├── <Header /> (TopBar)
│       │   ├── Notifications Bell (with badge)
│       │   └── <UserProfile compact />
│       └── <div className="flex-1 overflow-y-auto">
│           └── {children} (page content)
│       </div>
│   </main>
└── <Toaster />
```

---

## Authentication System

### Login Flow

1. User visits `/login`
2. Enters email + password
3. POST `/api/auth/login`:
   - Find user by email
   - Check status (must be ACTIVE)
   - Verify password with bcrypt
   - Update `lastLoginAt`
   - Create UserActivity record (action: 'login')
   - Return user object (without password)
4. Store user in `localStorage`
5. Redirect to `/dashboard`

### Session Management

- **Storage:** `localStorage.getItem('user')` → `{ id, name, email, role, status }`
- **Sync:** `window.addEventListener('storage', ...)` for cross-tab updates
- **Logout:** `localStorage.removeItem('user')` + dispatch storage event → redirect `/login`

### Password Security

- **Hashing:** bcrypt with cost factor 12
- **Validation:**
  - Minimum 8 characters
  - At least 1 uppercase letter
  - At least 1 number
  - At least 1 special character
- **Verification:** `bcrypt.compare(plaintext, hash)`

### Default Admin User

```javascript
{
  name: "Fatih Çelebigil",
  email: "fatihcelebigil@gmail.com",
  password: "123456", // bcrypt hashed in DB
  role: "ADMIN",
  status: "ACTIVE"
}
```

Created via: `node scripts/create-admin.js`

---

## UI Components

### UserProfile Component

**File:** `components/layout/UserProfile.tsx`

**Props:**
- `collapsed?: boolean` — Sidebar collapsed mode (icon only)
- `compact?: boolean` — TopBar compact mode (avatar + name + chevron)

**Modes:**

1. **Sidebar Expanded** (default):
   ```
   ┌──────────────────────────┐
   │ [FC] Fatih Çelebigil     │
   │      fatih@gmail.com     │
   │                          │
   │ [⚙️ Profil & Ayarlar ▼] │
   └──────────────────────────┘
   ```
   Click name/email → Dropdown opens

2. **Sidebar Collapsed**:
   ```
   ┌─────┐
   │ [FC]│ (icon only)
   └─────┘
   ```
   Click icon → Dropdown opens (side popover)

3. **TopBar Compact**:
   ```
   [FC] Fatih Çelebigil ▼
        Sistem Yöneticisi
   ```
   Click → Dropdown opens (bottom popover)

**Dropdown Menu:**
- Kullanıcı Ayarları → `/settings/users`
- API Keys → `/settings/keys`
- Davetler → `/settings/users/invitations`
- Separator
- Çıkış Yap (red) → logout

### Header (TopBar)

**File:** `components/layout/Header.tsx`

**Features:**
- Notifications bell icon with red badge (mock count: 3)
- Compact UserProfile component
- No logo or navigation (moved to sidebar)

### Sidebar

**File:** `components/layout/Sidebar.tsx`

**Features:**
- Collapsible (64px ↔ 256px)
- Navigation sections (collapsible)
- Theme toggle (Light/Dark)
- Dynamic UserProfile (replaces hardcoded "Yönetici")

---

## API Endpoints

### Authentication

**POST /api/auth/login**
```json
Request:
{
  "email": "fatihcelebigil@gmail.com",
  "password": "123456"
}

Response (success):
{
  "success": true,
  "user": {
    "id": "cmpuyngue...",
    "name": "Fatih Çelebigil",
    "email": "fatihcelebigil@gmail.com",
    "role": "admin",
    "status": "active"
  }
}

Response (error):
{
  "success": false,
  "error": "Invalid email or password"
}
```

### Users

**GET /api/users** — List all users with stats  
**POST /api/users** — Create user  
**PATCH /api/users** — Update user  
**DELETE /api/users?id=xxx** — Delete user  

**GET /api/users/activities?userId=xxx&limit=5** — Recent activities  
**PATCH /api/users/password** — Change password  

### Permissions

**GET /api/permissions** — Get permission matrix (auto-seeds if empty)  
**PATCH /api/permissions** — Toggle permission for role  

---

## Database Schema

### User Model
```prisma
model User {
  id            String    @id @default(cuid())
  name          String
  email         String    @unique
  password      String?   // bcrypt hash
  role          UserRole  @default(VIEWER)
  status        UserStatus @default(ACTIVE)
  lastLoginAt   DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

enum UserRole {
  ADMIN
  EDITOR
  VIEWER
}

enum UserStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
}
```

### Permission Models
```prisma
model Permission {
  id          String   @id @default(cuid())
  resource    String   // "users", "alarms", "devices"
  action      String   // "read", "write", "delete"
  description String?
  roles       RolePermission[]
  
  @@unique([resource, action])
}

model RolePermission {
  id           String   @id @default(cuid())
  roleId       UserRole
  permissionId String
  permission   Permission @relation(fields: [permissionId], references: [id])
  
  @@unique([roleId, permissionId])
}
```

### Activity & Audit
```prisma
model UserActivity {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  action    String   // "login", "edit_user", "delete_alarm"
  details   Json?
  createdAt DateTime @default(now())
  
  @@index([userId, createdAt])
}

model AuditLog {
  id         String   @id @default(cuid())
  userId     String?
  user       User?    @relation(fields: [userId], references: [id])
  action     String
  resource   String?
  resourceId String?
  details    Json?
  ipAddress  String?
  userAgent  String?
  timestamp  DateTime @default(now())
}
```

---

## Files Modified/Created

### Created
- `app/login/page.tsx` — Login page UI
- `app/logout/page.tsx` — Logout confirmation page
- `app/api/auth/login/route.ts` — Login API endpoint
- `components/layout/UserProfile.tsx` — Reusable user profile component
- `scripts/create-admin.js` — Seed admin user script

### Modified
- `components/layout/Header.tsx` — Removed logo/nav, added notifications + profile
- `components/layout/Sidebar.tsx` — Replaced hardcoded user with UserProfile component
- `app/layout.tsx` — Added Header (TopBar) wrapper
- `prisma/schema.prisma` — Added Permission, RolePermission, UserActivity, Invitation, AuditLog models
- `package.json` — Added Radix UI packages, bcryptjs

---

## Testing

### Manual Testing Checklist

1. **Login:**
   - [ ] Visit http://localhost:8170/login
   - [ ] Enter credentials: fatihcelebigil@gmail.com / 123456
   - [ ] Verify redirect to /dashboard
   - [ ] Verify localStorage has user object

2. **Sidebar Profile:**
   - [ ] See "Fatih Çelebigil" + email in sidebar bottom
   - [ ] Click name → dropdown opens
   - [ ] Click "Çıkış Yap" → logout

3. **TopBar:**
   - [ ] See notifications bell with badge "3"
   - [ ] See avatar + "Fatih Çelebigil ▼" + "Sistem Yöneticisi"
   - [ ] Click profile → dropdown opens
   - [ ] Click "Çıkış Yap" → logout

4. **Logout:**
   - [ ] Verify localStorage cleared
   - [ ] Verify redirect to /login
   - [ ] Verify sidebar shows "Giriş Yap" button

5. **Cross-tab Sync:**
   - [ ] Open 2 tabs
   - [ ] Login in Tab 1
   - [ ] Tab 2 should show user profile (refresh if needed)
   - [ ] Logout in Tab 1
   - [ ] Tab 2 should show "Giriş Yap"

---

## Known Issues / TODOs

- [ ] Notifications are mock data (count: 3) — need real alarm count API
- [ ] Notification popover shows placeholder — need notification list endpoint
- [ ] Permission matrix UI works but no middleware enforcement yet
- [ ] Invitation system UI exists but email sending not implemented
- [ ] Password reset via email not implemented
- [ ] Session tokens (JWT) not implemented — using localStorage only
- [ ] No password expiration policy
- [ ] No 2FA/MFA support

---

## Related Documentation

- [CHANGELOG.md](../CHANGELOG.md) — Version history
- [QUEST_MODE_USER_MANAGEMENT.md](./QUEST_MODE_USER_MANAGEMENT.md) — Implementation guide
- [CONSTITUTION.md](./00-product/CONSTITUTION.md) — Product principles
- [ADR-004](./10-architecture/adr/ADR-004-port-mapping-strategy.md) — Port mapping strategy
