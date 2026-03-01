# API Reference

> Auto-generated on 2026-03-01 by `/docs create api`.
> Source of truth is the codebase. Run `/docs update api` after code changes.

## Overview

All REST endpoints are served under `/api` on port 3001. Authentication uses JWT Bearer tokens unless noted otherwise.

| Route Group | Base Path | Auth Required |
|-------------|-----------|---------------|
| Auth | `/api/auth` | Mostly public |
| OAuth | `/api/auth` | Mixed |
| Vault | `/api/vault` | Yes |
| Connections | `/api/connections` | Yes |
| Folders | `/api/folders` | Yes |
| Sharing | `/api/connections` | Yes |
| Sessions | `/api/sessions` | Yes |
| User | `/api/user` | Yes |
| 2FA (TOTP) | `/api/user/2fa` | Yes |
| SMS MFA | `/api/user/2fa/sms` | Yes |
| Files | `/api/files` | Yes |
| Audit | `/api/audit` | Yes |
| Notifications | `/api/notifications` | Yes |
| Tenants | `/api/tenants` | Yes |
| Teams | `/api/teams` | Yes |
| Admin | `/api/admin` | Yes |
| Health | `/api/health` | No |

<!-- manual-start -->
<!-- manual-end -->

## Authentication

Protected endpoints require the `Authorization` header:

```
Authorization: Bearer <access-token>
```

If the token is expired, the client automatically refreshes via `POST /api/auth/refresh`. A 401 response with an invalid/expired token triggers this flow.

<!-- manual-start -->
<!-- manual-end -->

## Auth (`/api/auth`)

### `POST /api/auth/register`

Register a new user account.

- **Auth**: No
- **Body**: `{ email: string, password: string }` (password min 8 chars)
- **Response**: `201` `{ accessToken, refreshToken, user: { id, email, username } }`
- **Errors**: `409` email already exists, `400` validation error

### `POST /api/auth/login`

Authenticate with email and password.

- **Auth**: No
- **Body**: `{ email: string, password: string }`
- **Response**: `200` `{ accessToken, refreshToken, user }` or `{ mfaRequired: true, tempToken, mfaMethods: string[] }` if MFA enabled
- **Errors**: `401` invalid credentials, `403` email not verified

### `POST /api/auth/verify-totp`

Verify TOTP code during MFA login.

- **Auth**: No
- **Body**: `{ tempToken: string, code: string }` (code: exactly 6 digits)
- **Response**: `200` `{ accessToken, refreshToken, user }`
- **Errors**: `401` invalid code or token

### `POST /api/auth/request-sms-code`

Request SMS verification code during MFA login. Rate-limited.

- **Auth**: No
- **Body**: `{ tempToken: string }`
- **Response**: `200` `{ message: "SMS code sent" }`
- **Errors**: `401` invalid token, `429` rate limited

### `POST /api/auth/verify-sms`

Verify SMS code during MFA login.

- **Auth**: No
- **Body**: `{ tempToken: string, code: string }` (code: exactly 6 digits)
- **Response**: `200` `{ accessToken, refreshToken, user }`
- **Errors**: `401` invalid code or token

### `POST /api/auth/refresh`

Refresh an expired access token.

- **Auth**: No
- **Body**: `{ refreshToken: string }`
- **Response**: `200` `{ accessToken, user }`
- **Errors**: `401` invalid or expired refresh token

### `POST /api/auth/logout`

Invalidate a refresh token.

- **Auth**: No
- **Body**: `{ refreshToken: string }`
- **Response**: `200` `{ message: "Logged out" }`

### `GET /api/auth/verify-email?token=<token>`

Verify email address with 64-character hex token.

- **Auth**: No
- **Query**: `token` (64 chars)
- **Response**: `200` `{ message: "Email verified" }`
- **Errors**: `400` invalid or expired token

### `POST /api/auth/resend-verification`

Resend email verification link. 60-second cooldown.

- **Auth**: No
- **Body**: `{ email: string }`
- **Response**: `200` `{ message: "Verification email sent" }` (always succeeds to prevent enumeration)

<!-- manual-start -->
<!-- manual-end -->

## OAuth (`/api/auth`)

### `GET /api/auth/oauth/providers`

List available OAuth providers.

- **Auth**: No
- **Response**: `200` `{ providers: Array<{ name, enabled }> }`

### `GET /api/auth/:provider`

Initiate OAuth login flow. Redirects to provider.

- **Auth**: No
- **Params**: `provider` (google, microsoft, github)

### `GET /api/auth/:provider/callback`

OAuth callback handler. Redirects to client with tokens.

- **Auth**: No

### `GET /api/auth/oauth/link/:provider?token=<jwt>`

Link OAuth account to existing user. JWT passed as query param.

- **Auth**: JWT in query param

### `GET /api/auth/oauth/accounts`

List linked OAuth accounts.

- **Auth**: Yes
- **Response**: `200` `Array<{ provider, providerEmail, createdAt }>`

### `DELETE /api/auth/oauth/link/:provider`

Unlink OAuth account.

- **Auth**: Yes
- **Response**: `200` `{ message: "Account unlinked" }`

### `POST /api/auth/oauth/vault-setup`

Set up vault for OAuth-only users (no password yet).

- **Auth**: Yes
- **Body**: `{ vaultPassword: string }` (min 8 chars)
- **Response**: `200` `{ message: "Vault set up" }`

<!-- manual-start -->
<!-- manual-end -->

## Vault (`/api/vault`)

All endpoints require authentication.

### `POST /api/vault/unlock`

Unlock the vault (loads master key into memory).

- **Body**: `{ password: string }`
- **Response**: `200` `{ message: "Vault unlocked" }`
- **Errors**: `401` invalid password

### `POST /api/vault/lock`

Lock the vault (clears master key from memory).

- **Response**: `200` `{ message: "Vault locked" }`

### `GET /api/vault/status`

Check vault lock state.

- **Response**: `200` `{ unlocked: boolean }`

### `POST /api/vault/reveal-password`

Decrypt and reveal a connection's password.

- **Body**: `{ connectionId: string, password?: string }` (password required if vault is locked)
- **Response**: `200` `{ password: string }`
- **Errors**: `401` invalid password, `403` insufficient permission

<!-- manual-start -->
<!-- manual-end -->

## Connections (`/api/connections`)

All endpoints require authentication.

### `GET /api/connections`

List all connections (own, shared, and team).

- **Response**: `200` `{ own: Connection[], shared: SharedConnection[], team: TeamConnection[] }`

### `POST /api/connections`

Create a new connection.

- **Body**:
  ```json
  {
    "name": "string",
    "type": "RDP | SSH",
    "host": "string",
    "port": 1-65535,
    "username": "string",
    "password": "string",
    "description?": "string",
    "folderId?": "uuid",
    "teamId?": "uuid",
    "enableDrive?": false,
    "sshTerminalConfig?": { ... },
    "rdpSettings?": { ... }
  }
  ```
- **Response**: `201` `Connection`

### `GET /api/connections/:id`

Get a single connection.

- **Response**: `200` `Connection`
- **Errors**: `404` not found

### `PUT /api/connections/:id`

Update a connection.

- **Body**: Same fields as create (all optional)
- **Response**: `200` `Connection`

### `DELETE /api/connections/:id`

Delete a connection.

- **Response**: `200` `{ message: "Deleted" }`

### `PATCH /api/connections/:id/favorite`

Toggle favorite status.

- **Response**: `200` `{ isFavorite: boolean }`

<!-- manual-start -->
<!-- manual-end -->

## Folders (`/api/folders`)

All endpoints require authentication.

### `GET /api/folders`

List all folders (tree structure).

- **Response**: `200` `Folder[]`

### `POST /api/folders`

Create a folder.

- **Body**: `{ name: string, parentId?: uuid, teamId?: uuid }`
- **Response**: `201` `Folder`

### `PUT /api/folders/:id`

Update a folder.

- **Body**: `{ name?: string, parentId?: uuid | null }`
- **Response**: `200` `Folder`

### `DELETE /api/folders/:id`

Delete a folder.

- **Response**: `200` `{ message: "Deleted" }`

<!-- manual-start -->
<!-- manual-end -->

## Sharing (`/api/connections`)

All endpoints require authentication.

### `POST /api/connections/:id/share`

Share a connection with a user.

- **Body**: `{ email?: string, userId?: string, permission: "READ_ONLY" | "FULL_ACCESS" }` (at least one of email/userId)
- **Response**: `201` `SharedConnection`

### `DELETE /api/connections/:id/share/:userId`

Revoke a share.

- **Response**: `200` `{ message: "Share removed" }`

### `PUT /api/connections/:id/share/:userId`

Update share permission.

- **Body**: `{ permission: "READ_ONLY" | "FULL_ACCESS" }`
- **Response**: `200` `SharedConnection`

### `GET /api/connections/:id/shares`

List all shares for a connection.

- **Response**: `200` `SharedConnection[]`

<!-- manual-start -->
<!-- manual-end -->

## Sessions (`/api/sessions`)

All endpoints require authentication.

### `POST /api/sessions/rdp`

Create an RDP session token for Guacamole.

- **Body**: `{ connectionId: uuid, username?: string, password?: string }` (credential overrides optional, must be both or neither)
- **Response**: `200` `{ token: string, enableDrive: boolean }`

### `POST /api/sessions/ssh`

Validate access to an SSH connection (session handled via Socket.IO).

- **Body**: `{ connectionId: uuid }`
- **Response**: `200` `{ connectionId, type: "SSH" }`

<!-- manual-start -->
<!-- manual-end -->

## User (`/api/user`)

All endpoints require authentication.

### `GET /api/user/profile`

Get current user profile.

- **Response**: `200` `{ id, email, username, avatarData, vaultSetupComplete, totpEnabled, smsMfaEnabled, tenantId, tenantRole }`

### `PUT /api/user/profile`

Update profile.

- **Body**: `{ username?: string (1-50), email?: string }`
- **Response**: `200` `User`

### `PUT /api/user/password`

Change password.

- **Body**: `{ oldPassword: string, newPassword: string (min 8) }`
- **Response**: `200` `{ message: "Password changed" }`

### `PUT /api/user/ssh-defaults`

Save SSH terminal defaults.

- **Body**: `{ fontFamily?, fontSize? (10-24), lineHeight? (1.0-2.0), letterSpacing? (0-5), cursorStyle?, cursorBlink?, theme?, customColors?, scrollback? (100-10000), bellStyle? }`
- **Response**: `200` `User`

### `PUT /api/user/rdp-defaults`

Save RDP connection defaults.

- **Body**: `{ colorDepth? (8|16|24), width? (640-7680), height? (480-4320), dpi? (48-384), resizeMethod?, qualityPreset?, enableWallpaper?, enableTheming?, enableFontSmoothing?, enableFullWindowDrag?, enableDesktopComposition?, enableMenuAnimations?, forceLossless?, disableAudio?, enableAudioInput?, security?, ignoreCert?, serverLayout?, console?, timezone? }`
- **Response**: `200` `User`

### `POST /api/user/avatar`

Upload avatar image.

- **Body**: `{ avatarData: string }` (base64)
- **Response**: `200` `User`

### `GET /api/user/search?q=&scope=&teamId=`

Search users.

- **Auth**: Yes + tenant membership required
- **Query**: `q` (1-100 chars), `scope` (tenant|team), `teamId` (required if scope=team)
- **Response**: `200` `User[]`

<!-- manual-start -->
<!-- manual-end -->

## 2FA / TOTP (`/api/user/2fa`)

All endpoints require authentication.

### `POST /api/user/2fa/setup`

Generate TOTP secret and QR code.

- **Response**: `200` `{ secret, qrCodeUrl }`

### `POST /api/user/2fa/verify`

Verify TOTP code and enable 2FA.

- **Body**: `{ code: string }` (exactly 6 digits)
- **Response**: `200` `{ message: "TOTP enabled" }`

### `POST /api/user/2fa/disable`

Disable TOTP 2FA.

- **Body**: `{ code: string }` (exactly 6 digits)
- **Response**: `200` `{ message: "TOTP disabled" }`

### `GET /api/user/2fa/status`

Check TOTP status.

- **Response**: `200` `{ enabled: boolean }`

<!-- manual-start -->
<!-- manual-end -->

## SMS MFA (`/api/user/2fa/sms`)

All endpoints require authentication.

### `POST /api/user/2fa/sms/setup-phone`

Initiate phone number setup. Sends SMS code. Rate-limited.

- **Body**: `{ phoneNumber: string }` (E.164 format: `+[1-9]\d{1,14}`)
- **Response**: `200` `{ message: "Verification code sent" }`
- **Errors**: `429` rate limited

### `POST /api/user/2fa/sms/verify-phone`

Verify phone number with SMS code.

- **Body**: `{ code: string }` (exactly 6 digits)
- **Response**: `200` `{ message: "Phone verified" }`

### `POST /api/user/2fa/sms/enable`

Enable SMS MFA (requires verified phone).

- **Response**: `200` `{ message: "SMS MFA enabled" }`

### `POST /api/user/2fa/sms/send-disable-code`

Send verification code to disable SMS MFA. Rate-limited.

- **Response**: `200` `{ message: "Code sent" }`

### `POST /api/user/2fa/sms/disable`

Disable SMS MFA with verification code.

- **Body**: `{ code: string }` (exactly 6 digits)
- **Response**: `200` `{ message: "SMS MFA disabled" }`

### `GET /api/user/2fa/sms/status`

Check SMS MFA status.

- **Response**: `200` `{ enabled: boolean, phoneVerified: boolean, phoneNumber?: string }`

<!-- manual-start -->
<!-- manual-end -->

## Files (`/api/files`)

All endpoints require authentication. File uploads use multipart form data with quota checking.

### `GET /api/files`

List user's uploaded files.

- **Response**: `200` `Array<{ name, size, createdAt }>`

### `GET /api/files/:name`

Download a file.

- **Params**: `name` (1-255 chars)
- **Response**: File binary with appropriate content type

### `POST /api/files`

Upload a file (multipart). Subject to quota check.

- **Body**: Multipart form data with `file` field
- **Response**: `201` `{ name, size }`
- **Errors**: `413` quota exceeded, `400` no file

### `DELETE /api/files/:name`

Delete a file.

- **Response**: `200` `{ message: "Deleted" }`

<!-- manual-start -->
<!-- manual-end -->

## Audit (`/api/audit`)

### `GET /api/audit`

List audit log entries with pagination and filtering.

- **Auth**: Yes
- **Query**: `page? (min 1)`, `limit? (1-100, default 50)`, `action?` (AuditAction enum), `startDate?`, `endDate?`
- **Response**: `200` `{ entries: AuditLog[], total: number, page: number, limit: number }`

<!-- manual-start -->
<!-- manual-end -->

## Notifications (`/api/notifications`)

All endpoints require authentication.

### `GET /api/notifications`

List notifications.

- **Query**: `limit? (1-100, default 50)`, `offset? (default 0)`
- **Response**: `200` `{ notifications: Notification[], total: number, unreadCount: number }`

### `PUT /api/notifications/read-all`

Mark all notifications as read.

- **Response**: `200` `{ message: "All marked as read" }`

### `PUT /api/notifications/:id/read`

Mark a single notification as read.

- **Response**: `200` `Notification`

### `DELETE /api/notifications/:id`

Delete a notification.

- **Response**: `200` `{ message: "Deleted" }`

<!-- manual-start -->
<!-- manual-end -->

## Tenants (`/api/tenants`)

All endpoints require authentication.

### `POST /api/tenants`

Create a new tenant (organization). Current user becomes OWNER.

- **Body**: `{ name: string }` (2-100 chars)
- **Response**: `201` `Tenant`

### `GET /api/tenants/mine`

Get current user's tenant.

- **Auth**: Yes + tenant membership required
- **Response**: `200` `Tenant`

### `PUT /api/tenants/:id`

Update tenant name.

- **Auth**: Yes + ADMIN role required
- **Body**: `{ name?: string }` (2-100 chars)
- **Response**: `200` `Tenant`

### `DELETE /api/tenants/:id`

Delete tenant and all associated data.

- **Auth**: Yes + OWNER role required
- **Response**: `200` `{ message: "Deleted" }`

### `GET /api/tenants/:id/users`

List tenant members.

- **Auth**: Yes + tenant membership required
- **Response**: `200` `User[]`

### `POST /api/tenants/:id/invite`

Invite a user to the tenant by email.

- **Auth**: Yes + ADMIN role required
- **Body**: `{ email: string, role: "ADMIN" | "MEMBER" }`
- **Response**: `200` `{ message: "User invited" }`

### `PUT /api/tenants/:id/users/:userId`

Update a user's tenant role.

- **Auth**: Yes + ADMIN role required
- **Body**: `{ role: "OWNER" | "ADMIN" | "MEMBER" }`
- **Response**: `200` `User`

### `DELETE /api/tenants/:id/users/:userId`

Remove a user from the tenant.

- **Auth**: Yes + ADMIN role required
- **Response**: `200` `{ message: "User removed" }`

<!-- manual-start -->
<!-- manual-end -->

## Teams (`/api/teams`)

All endpoints require authentication + tenant membership.

### `POST /api/teams`

Create a team within the tenant.

- **Body**: `{ name: string (2-100), description?: string (max 500) }`
- **Response**: `201` `Team`

### `GET /api/teams`

List teams the user belongs to.

- **Response**: `200` `Team[]`

### `GET /api/teams/:id`

Get team details.

- **Auth**: Yes + team membership required
- **Response**: `200` `Team`

### `PUT /api/teams/:id`

Update team name/description.

- **Auth**: Yes + TEAM_ADMIN role required
- **Body**: `{ name?: string (2-100), description?: string | null (max 500) }`
- **Response**: `200` `Team`

### `DELETE /api/teams/:id`

Delete a team.

- **Auth**: Yes + TEAM_ADMIN role required (tenant ADMINs can also delete)
- **Response**: `200` `{ message: "Deleted" }`

### `GET /api/teams/:id/members`

List team members.

- **Auth**: Yes + team membership required
- **Response**: `200` `TeamMember[]`

### `POST /api/teams/:id/members`

Add a member to the team.

- **Auth**: Yes + TEAM_ADMIN role required
- **Body**: `{ userId: uuid, role: "TEAM_ADMIN" | "TEAM_EDITOR" | "TEAM_VIEWER" }`
- **Response**: `201` `TeamMember`

### `PUT /api/teams/:id/members/:userId`

Update a team member's role.

- **Auth**: Yes + TEAM_ADMIN role required
- **Body**: `{ role: "TEAM_ADMIN" | "TEAM_EDITOR" | "TEAM_VIEWER" }`
- **Response**: `200` `TeamMember`

### `DELETE /api/teams/:id/members/:userId`

Remove a member from the team.

- **Auth**: Yes + TEAM_ADMIN role required (tenant ADMINs can also remove)
- **Response**: `200` `{ message: "Member removed" }`

<!-- manual-start -->
<!-- manual-end -->

## Admin (`/api/admin`)

All endpoints require authentication.

### `GET /api/admin/email/status`

Get email provider configuration status.

- **Response**: `200` `{ provider, configured: boolean }`

### `POST /api/admin/email/test`

Send a test email.

- **Body**: `{ to: string }` (email address)
- **Response**: `200` `{ message: "Test email sent" }`

<!-- manual-start -->
<!-- manual-end -->

## Health Check

### `GET /api/health`

Simple health check endpoint.

- **Auth**: No
- **Response**: `200` `{ status: "ok" }`

<!-- manual-start -->
<!-- manual-end -->

## WebSocket Endpoints

### Socket.IO — SSH Namespace (`/ssh`)

**Connection**: `io("/ssh", { auth: { token: "<jwt>" } })`

**Authentication**: JWT verified in middleware before connection.

#### Client → Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `session:start` | `{ connectionId, username?, password? }` | Start SSH session (optional credential overrides) |
| `data` | `string` | Terminal input data |
| `resize` | `{ cols, rows }` | Terminal resize |
| `sftp:list` | `{ path }` | List directory contents |
| `sftp:mkdir` | `{ path }` | Create directory |
| `sftp:delete` | `{ path }` | Delete file |
| `sftp:rmdir` | `{ path }` | Delete directory |
| `sftp:rename` | `{ oldPath, newPath }` | Rename/move file |
| `sftp:upload:start` | `{ remotePath, fileSize, filename }` | Start upload |
| `sftp:upload:chunk` | `{ transferId, chunk }` | Upload data chunk |
| `sftp:upload:end` | `{ transferId }` | Finish upload |
| `sftp:download:start` | `{ remotePath }` | Start download |
| `sftp:cancel` | `{ transferId }` | Cancel transfer |

#### Server → Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `session:ready` | — | SSH session established |
| `session:closed` | — | SSH session ended |
| `session:error` | `{ message }` | Error occurred |
| `data` | `string` | Terminal output data |
| `sftp:progress` | `{ transferId, bytesTransferred, totalBytes, filename }` | Transfer progress |
| `sftp:transfer:complete` | `{ transferId }` | Transfer finished |
| `sftp:transfer:error` | `{ transferId, message }` | Transfer error |
| `sftp:transfer:cancelled` | `{ transferId }` | Transfer cancelled |
| `sftp:download:chunk` | `{ transferId, chunk }` | Download data chunk |
| `sftp:download:end` | `{ transferId }` | Download finished |

### Guacamole WebSocket (Port 3002)

**Connection**: `ws://host:3002/?token=<encrypted-token>`

The Guacamole WebSocket is managed by `guacamole-lite`. The encrypted token is obtained from `POST /api/sessions/rdp` and contains the RDP connection parameters (host, port, credentials, settings) encrypted with AES-256-CBC using `GUACAMOLE_SECRET`.

In production, nginx proxies `/guacamole` to `server:3002`.

<!-- manual-start -->
<!-- manual-end -->
