# Database

> Auto-generated on 2026-03-01 by `/docs create database`.
> Source of truth is the codebase. Run `/docs update database` after code changes.

## Overview

- **Provider**: PostgreSQL 16
- **ORM**: Prisma (`server/prisma/schema.prisma`)
- **Generated client**: `server/src/generated/prisma`
- **Connection**: Configured via `DATABASE_URL` environment variable

<!-- manual-start -->
<!-- manual-end -->

## Entity-Relationship Summary

```
Tenant ──1:N──► User ──1:N──► Connection ──1:N──► SharedConnection
  │                │                │
  │                │                └──N:1──► Folder
  │                │
  │                ├──1:N──► Folder (self-referencing tree via parentId)
  │                ├──1:N──► RefreshToken
  │                ├──1:N──► OAuthAccount
  │                ├──1:N──► AuditLog
  │                ├──1:N──► Notification
  │                └──1:N──► TeamMember
  │
  └──1:N──► Team ──1:N──► TeamMember
              ├──1:N──► Connection
              └──1:N──► Folder
```

- A **User** belongs to an optional **Tenant** (organization)
- A **Tenant** has many **Teams**; each **Team** has many **TeamMembers**
- **Connections** can be personal (userId) or team-owned (teamId)
- **Connections** are organized in a hierarchical **Folder** tree
- **SharedConnection** links a connection to a user with a permission level
- **Folders** support nesting via self-referencing `parentId`

<!-- manual-start -->
<!-- manual-end -->

## Models

### Tenant

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String | `@id @default(uuid())` | Primary key |
| name | String | | Organization name |
| slug | String | `@unique` | URL-friendly identifier |
| createdAt | DateTime | `@default(now())` | Creation timestamp |
| updatedAt | DateTime | `@updatedAt` | Last update timestamp |

**Relations**: `users` (User[]), `teams` (Team[])

<!-- manual-start -->
<!-- manual-end -->

### Team

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String | `@id @default(uuid())` | Primary key |
| name | String | | Team name |
| description | String? | | Optional description |
| tenantId | String | FK → Tenant | Parent organization |
| createdAt | DateTime | `@default(now())` | Creation timestamp |
| updatedAt | DateTime | `@updatedAt` | Last update timestamp |

**Relations**: `tenant` (Tenant), `members` (TeamMember[]), `connections` (Connection[]), `folders` (Folder[])

**Unique constraints**: `@@unique([tenantId, name])` — team names are unique within a tenant

<!-- manual-start -->
<!-- manual-end -->

### TeamMember

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String | `@id @default(uuid())` | Primary key |
| teamId | String | FK → Team (cascade delete) | Team reference |
| userId | String | FK → User (cascade delete) | User reference |
| role | TeamRole | | Member's role in team |
| encryptedTeamVaultKey | String? | | Team vault key encrypted with user's master key |
| teamVaultKeyIV | String? | | IV for team vault key encryption |
| teamVaultKeyTag | String? | | Auth tag for team vault key encryption |
| joinedAt | DateTime | `@default(now())` | Join timestamp |

**Relations**: `team` (Team), `user` (User)

**Unique constraints**: `@@unique([teamId, userId])` — one membership per user per team

<!-- manual-start -->
<!-- manual-end -->

### User

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String | `@id @default(uuid())` | Primary key |
| email | String | `@unique` | Login email |
| username | String? | | Display name |
| avatarData | String? | | Base64-encoded avatar image |
| passwordHash | String? | | Bcrypt hash (null for OAuth-only users) |
| vaultSalt | String? | | Argon2 salt for key derivation (hex) |
| encryptedVaultKey | String? | | AES-256-GCM encrypted master key |
| vaultKeyIV | String? | | IV for vault key encryption |
| vaultKeyTag | String? | | Auth tag for vault key encryption |
| vaultSetupComplete | Boolean | `@default(true)` | Whether vault has been initialized |
| sshDefaults | Json? | | Default SSH terminal configuration |
| rdpDefaults | Json? | | Default RDP connection settings |
| totpSecret | String? | | TOTP secret for authenticator app |
| totpEnabled | Boolean | `@default(false)` | TOTP 2FA enabled flag |
| phoneNumber | String? | | Phone number for SMS MFA (E.164) |
| phoneVerified | Boolean | `@default(false)` | Phone verification status |
| smsMfaEnabled | Boolean | `@default(false)` | SMS MFA enabled flag |
| smsOtpHash | String? | | Hashed SMS OTP code |
| smsOtpExpiresAt | DateTime? | | SMS OTP expiration |
| emailVerified | Boolean | `@default(false)` | Email verification status |
| emailVerifyToken | String? | `@unique` | Email verification token (64-char hex) |
| emailVerifyExpiry | DateTime? | | Token expiration (24h) |
| tenantId | String? | FK → Tenant | Organization membership |
| tenantRole | TenantRole? | | Role within organization |
| createdAt | DateTime | `@default(now())` | Registration timestamp |
| updatedAt | DateTime | `@updatedAt` | Last update timestamp |

**Relations**: `tenant` (Tenant?), `connections` (Connection[]), `folders` (Folder[]), `sharedWithMe` (SharedConnection[]), `sharedByMe` (SharedConnection[]), `refreshTokens` (RefreshToken[]), `oauthAccounts` (OAuthAccount[]), `auditLogs` (AuditLog[]), `notifications` (Notification[]), `teamMembers` (TeamMember[])

<!-- manual-start -->
<!-- manual-end -->

### OAuthAccount

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String | `@id @default(uuid())` | Primary key |
| userId | String | FK → User (cascade delete) | Account owner |
| provider | AuthProvider | | OAuth provider |
| providerUserId | String | | User ID from provider |
| providerEmail | String? | | Email from provider |
| accessToken | String? | | OAuth access token |
| refreshToken | String? | | OAuth refresh token |
| createdAt | DateTime | `@default(now())` | Link timestamp |
| updatedAt | DateTime | `@updatedAt` | Last update timestamp |

**Relations**: `user` (User)

**Unique constraints**: `@@unique([provider, providerUserId])`

**Indexes**: `@@index([userId])`

<!-- manual-start -->
<!-- manual-end -->

### Folder

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String | `@id @default(uuid())` | Primary key |
| name | String | | Folder name |
| parentId | String? | FK → Folder (self-ref) | Parent folder for nesting |
| userId | String | FK → User | Owner |
| teamId | String? | FK → Team | Team ownership (null = personal) |
| sortOrder | Int | `@default(0)` | Display order |
| createdAt | DateTime | `@default(now())` | Creation timestamp |
| updatedAt | DateTime | `@updatedAt` | Last update timestamp |

**Relations**: `parent` (Folder?), `children` (Folder[]), `user` (User), `team` (Team?), `connections` (Connection[])

<!-- manual-start -->
<!-- manual-end -->

### Connection

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String | `@id @default(uuid())` | Primary key |
| name | String | | Display name |
| type | ConnectionType | | RDP or SSH |
| host | String | | Hostname or IP |
| port | Int | | Port number |
| folderId | String? | FK → Folder (SetNull on delete) | Parent folder |
| teamId | String? | FK → Team | Team ownership |
| encryptedUsername | String | | AES-256-GCM encrypted username |
| usernameIV | String | | IV for username encryption |
| usernameTag | String | | Auth tag for username |
| encryptedPassword | String | | AES-256-GCM encrypted password |
| passwordIV | String | | IV for password encryption |
| passwordTag | String | | Auth tag for password |
| description | String? | | Optional description |
| isFavorite | Boolean | `@default(false)` | Favorite flag |
| enableDrive | Boolean | `@default(false)` | RDP drive redirection |
| sshTerminalConfig | Json? | | Per-connection SSH terminal settings |
| rdpSettings | Json? | | Per-connection RDP settings |
| userId | String | FK → User | Owner |
| createdAt | DateTime | `@default(now())` | Creation timestamp |
| updatedAt | DateTime | `@updatedAt` | Last update timestamp |

**Relations**: `folder` (Folder?), `team` (Team?), `user` (User), `shares` (SharedConnection[])

<!-- manual-start -->
<!-- manual-end -->

### SharedConnection

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String | `@id @default(uuid())` | Primary key |
| connectionId | String | FK → Connection (cascade delete) | Shared connection |
| sharedWithUserId | String | FK → User | Recipient |
| sharedByUserId | String | FK → User | Sharer |
| permission | Permission | | Access level |
| encryptedUsername | String? | | Re-encrypted username for recipient |
| usernameIV | String? | | IV for re-encrypted username |
| usernameTag | String? | | Auth tag for re-encrypted username |
| encryptedPassword | String? | | Re-encrypted password for recipient |
| passwordIV | String? | | IV for re-encrypted password |
| passwordTag | String? | | Auth tag for re-encrypted password |
| createdAt | DateTime | `@default(now())` | Share timestamp |

**Relations**: `connection` (Connection), `sharedWith` (User), `sharedBy` (User)

**Unique constraints**: `@@unique([connectionId, sharedWithUserId])` — one share per user per connection

<!-- manual-start -->
<!-- manual-end -->

### RefreshToken

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String | `@id @default(uuid())` | Primary key |
| token | String | `@unique` | Token value (UUID) |
| userId | String | FK → User (cascade delete) | Token owner |
| expiresAt | DateTime | | Expiration timestamp |
| createdAt | DateTime | `@default(now())` | Issue timestamp |

**Relations**: `user` (User)

<!-- manual-start -->
<!-- manual-end -->

### AuditLog

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String | `@id @default(uuid())` | Primary key |
| userId | String | FK → User (cascade delete) | Acting user |
| action | AuditAction | | Action type |
| targetType | String? | | Type of target entity |
| targetId | String? | | ID of target entity |
| details | Json? | | Additional context |
| ipAddress | String? | | Client IP address |
| createdAt | DateTime | `@default(now())` | Timestamp |

**Relations**: `user` (User)

**Indexes**: `@@index([userId])`, `@@index([action])`, `@@index([createdAt])`

<!-- manual-start -->
<!-- manual-end -->

### Notification

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String | `@id @default(uuid())` | Primary key |
| userId | String | FK → User (cascade delete) | Recipient |
| type | NotificationType | | Notification category |
| message | String | | Display message |
| read | Boolean | `@default(false)` | Read status |
| relatedId | String? | | Related entity ID |
| createdAt | DateTime | `@default(now())` | Timestamp |

**Relations**: `user` (User)

**Indexes**: `@@index([userId, read])`, `@@index([userId, createdAt])`

<!-- manual-start -->
<!-- manual-end -->

## Enums

### TenantRole

| Value | Description |
|-------|-------------|
| `OWNER` | Full control, can delete tenant |
| `ADMIN` | Can manage members and settings |
| `MEMBER` | Basic access |

### TeamRole

| Value | Description |
|-------|-------------|
| `TEAM_ADMIN` | Full team management |
| `TEAM_EDITOR` | Can edit team connections |
| `TEAM_VIEWER` | Read-only access |

### ConnectionType

| Value | Description |
|-------|-------------|
| `RDP` | Remote Desktop Protocol |
| `SSH` | Secure Shell |

### Permission

| Value | Description |
|-------|-------------|
| `READ_ONLY` | View connection details only |
| `FULL_ACCESS` | View and use credentials |

### AuthProvider

| Value | Description |
|-------|-------------|
| `LOCAL` | Email/password registration |
| `GOOGLE` | Google OAuth |
| `MICROSOFT` | Microsoft OAuth |
| `GITHUB` | GitHub OAuth |

### NotificationType

| Value | Description |
|-------|-------------|
| `CONNECTION_SHARED` | A connection was shared with you |
| `SHARE_PERMISSION_UPDATED` | Share permission was changed |
| `SHARE_REVOKED` | A share was revoked |

### AuditAction

38 action types tracking all significant operations:

| Category | Actions |
|----------|---------|
| Authentication | `LOGIN`, `LOGIN_OAUTH`, `LOGIN_TOTP`, `LOGIN_SMS`, `LOGOUT`, `REGISTER` |
| Vault | `VAULT_UNLOCK`, `VAULT_LOCK`, `VAULT_SETUP` |
| Connections | `CREATE_CONNECTION`, `UPDATE_CONNECTION`, `DELETE_CONNECTION` |
| Sharing | `SHARE_CONNECTION`, `UNSHARE_CONNECTION`, `UPDATE_SHARE_PERMISSION` |
| Folders | `CREATE_FOLDER`, `UPDATE_FOLDER`, `DELETE_FOLDER` |
| User | `PASSWORD_CHANGE`, `PROFILE_UPDATE`, `PASSWORD_REVEAL` |
| MFA | `TOTP_ENABLE`, `TOTP_DISABLE`, `SMS_MFA_ENABLE`, `SMS_MFA_DISABLE`, `SMS_PHONE_VERIFY` |
| OAuth | `OAUTH_LINK`, `OAUTH_UNLINK` |
| Tenants | `TENANT_CREATE`, `TENANT_UPDATE`, `TENANT_DELETE`, `TENANT_INVITE_USER`, `TENANT_REMOVE_USER`, `TENANT_UPDATE_USER_ROLE` |
| Teams | `TEAM_CREATE`, `TEAM_UPDATE`, `TEAM_DELETE`, `TEAM_ADD_MEMBER`, `TEAM_REMOVE_MEMBER`, `TEAM_UPDATE_MEMBER_ROLE` |
| Admin | `EMAIL_TEST_SEND` |

<!-- manual-start -->
<!-- manual-end -->

## Indexes and Unique Constraints

| Model | Type | Fields |
|-------|------|--------|
| Tenant | Unique | `slug` |
| Team | Unique | `[tenantId, name]` |
| TeamMember | Unique | `[teamId, userId]` |
| User | Unique | `email` |
| User | Unique | `emailVerifyToken` |
| OAuthAccount | Unique | `[provider, providerUserId]` |
| OAuthAccount | Index | `[userId]` |
| SharedConnection | Unique | `[connectionId, sharedWithUserId]` |
| RefreshToken | Unique | `token` |
| AuditLog | Index | `[userId]` |
| AuditLog | Index | `[action]` |
| AuditLog | Index | `[createdAt]` |
| Notification | Index | `[userId, read]` |
| Notification | Index | `[userId, createdAt]` |

<!-- manual-start -->
<!-- manual-end -->
