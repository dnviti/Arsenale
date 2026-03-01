# Security

> Auto-generated on 2026-03-01 by `/docs create security`.
> Source of truth is the codebase. Run `/docs update security` after code changes.

## Overview

Remote Desktop Manager implements defense-in-depth security:

- **Credentials at rest**: AES-256-GCM encryption with per-user master keys
- **Key derivation**: Argon2id from user password
- **Authentication**: JWT access/refresh tokens with automatic refresh
- **Multi-factor**: TOTP (authenticator app) and SMS OTP
- **Audit trail**: All security-relevant actions logged

Source files: `server/src/services/crypto.service.ts`, `server/src/services/auth.service.ts`, `server/src/services/vault.service.ts`, `server/src/middleware/auth.middleware.ts`

<!-- manual-start -->
<!-- manual-end -->

## Vault Encryption

### Algorithm

| Parameter | Value | Source |
|-----------|-------|--------|
| Algorithm | AES-256-GCM | `crypto.service.ts` |
| Key length | 32 bytes (256 bits) | `KEY_LENGTH` |
| IV length | 16 bytes | `IV_LENGTH` |
| Salt length | 32 bytes | `SALT_LENGTH` |

### Key Derivation (Argon2id)

| Parameter | Value | Source |
|-----------|-------|--------|
| Type | Argon2id | `argon2.hash()` options |
| Memory cost | 65,536 KiB (64 MB) | `memoryCost` |
| Time cost | 3 iterations | `timeCost` |
| Parallelism | 1 | `parallelism` |
| Hash length | 32 bytes | `hashLength` |
| Output | Raw buffer | `raw: true` |

### Encrypted Field Structure

Each encrypted value is stored as three separate database columns:

```typescript
interface EncryptedField {
  ciphertext: string;  // Hex-encoded encrypted data
  iv: string;          // Hex-encoded 16-byte initialization vector
  tag: string;         // Hex-encoded GCM authentication tag
}
```

### Master Key Lifecycle

```
User Password
      │
      ▼
  Argon2id(password, salt) → Derived Key (32 bytes)
      │
      ▼
  AES-256-GCM Decrypt(encryptedVaultKey, derivedKey) → Master Key (32 bytes)
      │
      ▼
  Stored in-memory (VaultSession Map) with TTL
      │
      ▼
  Used to encrypt/decrypt connection credentials
```

1. **Registration**: Random 32-byte master key generated, encrypted with Argon2-derived key, stored in DB
2. **Vault unlock**: Password → Argon2 → derived key → decrypt master key → store in memory
3. **Credential operations**: Master key retrieved from memory to encrypt/decrypt
4. **Vault lock**: Master key buffer zeroed with `.fill(0)`, session deleted

<!-- manual-start -->
<!-- manual-end -->

## Vault Session Management

### User Vault Sessions

- **Storage**: In-memory `Map<userId, { masterKey: Buffer, expiresAt: number }>`
- **TTL**: Configurable via `VAULT_TTL_MINUTES` (default: 30 minutes)
- **Sliding window**: TTL resets on every `getVaultSession()` call
- **Cleanup interval**: Every 60 seconds, expired sessions are found, keys zeroed, entries deleted
- **Defensive copying**: Master keys are copied (`Buffer.from()`) on store and retrieve to prevent external mutations

### Team Vault Sessions

- **Storage**: Separate `Map<"${teamId}:${userId}", { teamKey: Buffer, expiresAt: number }>`
- **Same TTL and cleanup** as user vault sessions
- **Team key flow**: Team master key encrypted with user's master key → stored in `TeamMember` table → decrypted and cached in memory on team vault unlock
- **Lock operations**: `lockTeamVault(teamId)` locks all users for a team; `lockUserTeamVaults(userId)` locks all teams for a user

### Memory Security

- All key buffers are zeroed with `.fill(0)` before deletion
- Defensive copies prevent key leakage through shared references
- Periodic cleanup ensures expired keys don't linger in memory
- No keys are ever written to disk or logs

<!-- manual-start -->
<!-- manual-end -->

## Authentication

### Password Hashing

| Parameter | Value |
|-----------|-------|
| Algorithm | bcrypt |
| Rounds | 12 |

### JWT Tokens

**Access Token**:
- Payload: `{ userId, email, tenantId?, tenantRole? }`
- Signing: HMAC-SHA256 with `JWT_SECRET`
- Expiration: Configurable via `JWT_EXPIRES_IN` (default: 15 minutes)

**Refresh Token**:
- Format: UUID v4
- Storage: Database (`RefreshToken` model) with expiration timestamp
- Expiration: Configurable via `JWT_REFRESH_EXPIRES_IN` (default: 7 days)
- Rotation: Not rotated on use; only deleted on logout or when expired

**MFA Temporary Token**:
- Payload: `{ userId, email, purpose: 'mfa-verify' }`
- Expiration: 5 minutes
- Used for TOTP and SMS verification during login

### Token Refresh Flow

1. Client receives 401 response
2. Axios interceptor sends `POST /api/auth/refresh` with refresh token
3. Server validates token exists in DB and is not expired
4. Server issues new access token (same refresh token remains valid)
5. Original request is retried with new access token
6. On refresh failure: client calls `authStore.logout()` and redirects to login

### Socket.IO Authentication

- Socket.IO `/ssh` namespace uses JWT middleware
- Token passed in `socket.handshake.auth.token`
- Verified with same `JWT_SECRET` as HTTP endpoints
- Payload attached to socket as `socket.user`

<!-- manual-start -->
<!-- manual-end -->

## Multi-Factor Authentication

### TOTP (Authenticator App)

1. **Setup**: Server generates random secret, returns QR code URI
2. **Verify**: User enters 6-digit code, server validates with `speakeasy`
3. **Login**: After password verification, `purpose: 'mfa-verify'` temp token issued → user submits TOTP code → real tokens issued

### SMS OTP

1. **Phone setup**: User provides E.164 phone number → 6-digit code sent via SMS provider
2. **Phone verify**: User submits code → phone marked as verified
3. **Enable**: SMS MFA activated (requires verified phone)
4. **Login**: After password verification, SMS code sent to verified phone → user submits code → real tokens issued

**SMS Providers**: Twilio, AWS SNS, Vonage (configurable via `SMS_PROVIDER` env var). Dev mode logs codes to console.

**Rate Limiting**: SMS endpoints use rate limiting middleware to prevent abuse.

<!-- manual-start -->
<!-- manual-end -->

## Connection Sharing Security

When a connection is shared with another user:

1. Sharer's vault must be unlocked (master key in memory)
2. Connection credentials are decrypted with sharer's master key
3. Recipient's master key is retrieved (their vault must also be unlocked)
4. Credentials are re-encrypted with recipient's master key
5. Re-encrypted credentials stored in `SharedConnection` table

This ensures each user's credentials are encrypted with their own unique key, and the sharer cannot access credentials without unlocking their vault.

For team connections, a shared team master key is used, encrypted per-member with each member's personal master key.

<!-- manual-start -->
<!-- manual-end -->

## Email Verification

- **Token**: 32 random bytes → 64-character hex string
- **TTL**: 24 hours
- **Storage**: `emailVerifyToken` and `emailVerifyExpiry` on User model
- **Resend cooldown**: 60 seconds between resend requests (silent ignore, prevents enumeration)
- **Providers**: SMTP, SendGrid, Amazon SES, Resend, Mailgun

<!-- manual-start -->
<!-- manual-end -->

## Security Considerations for Production

1. **JWT_SECRET**: Must be a strong random value (≥32 bytes). Generate with `openssl rand -base64 32`
2. **GUACAMOLE_SECRET**: Must match between server config and guacamole-lite. Generate similarly
3. **POSTGRES_PASSWORD**: Strong random password for database
4. **HTTPS**: Deploy behind a TLS-terminating reverse proxy (not handled by the app)
5. **CORS**: Update origin in `app.ts` to match your production domain
6. **Vault TTL**: Adjust `VAULT_TTL_MINUTES` based on security requirements vs. convenience
7. **Rate limiting**: SMS rate limiter is built-in; consider adding general API rate limiting for production
8. **OAuth secrets**: Keep `CLIENT_SECRET` values secure; never expose to client

<!-- manual-start -->
<!-- manual-end -->
