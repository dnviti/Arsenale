# Environment Variables

> Auto-generated on 2026-03-01 by `/docs create environment`.
> Source of truth is the codebase. Run `/docs update environment` after code changes.

## Overview

Environment variables are loaded via `dotenv` in `server/src/config.ts`:

```typescript
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
```

The `.env` file lives at the **monorepo root**, not inside `server/`. The Prisma config (`server/prisma.config.ts`) also resolves to `../.env`. Never create a separate `server/.env`.

Source files: `.env.example`, `.env.production.example`, `server/src/config.ts`

<!-- manual-start -->
<!-- manual-end -->

## Variable Reference

### Database

| Variable | Type | Default | Required | Env | Description | Security |
|----------|------|---------|----------|-----|-------------|----------|
| `DATABASE_URL` | string | `postgresql://rdm:rdm_password@127.0.0.1:5432/remote_desktop_manager` | Yes | Both | PostgreSQL connection string | Use strong password in prod |

<!-- manual-start -->
<!-- manual-end -->

### Server

| Variable | Type | Default | Required | Env | Description | Security |
|----------|------|---------|----------|-----|-------------|----------|
| `PORT` | int | `3001` | No | Both | Express HTTP server port | — |
| `GUACAMOLE_WS_PORT` | int | `3002` | No | Both | Guacamole WebSocket port | — |
| `NODE_ENV` | string | `development` | No | Both | Runtime environment | — |
| `LOG_LEVEL` | string | `info` | No | Both | Log level (`error`, `warn`, `info`, `debug`) | — |
| `CLIENT_URL` | string | `http://localhost:3000` | No | Both | Client URL (email links, OAuth redirects) | — |

<!-- manual-start -->
<!-- manual-end -->

### Authentication

| Variable | Type | Default | Required | Env | Description | Security |
|----------|------|---------|----------|-----|-------------|----------|
| `JWT_SECRET` | string | `dev-secret-change-me` | **Prod** | Both | JWT signing secret | **Must** be strong random value in prod (≥32 bytes) |
| `JWT_EXPIRES_IN` | string | `15m` | No | Both | Access token lifetime (ms/s/m/h format) | — |
| `JWT_REFRESH_EXPIRES_IN` | string | `7d` | No | Both | Refresh token lifetime | — |

<!-- manual-start -->
<!-- manual-end -->

### Guacamole

| Variable | Type | Default | Required | Env | Description | Security |
|----------|------|---------|----------|-----|-------------|----------|
| `GUACD_HOST` | string | `localhost` | No | Both | Guacamole daemon host (use `guacd` in Docker) | — |
| `GUACD_PORT` | int | `4822` | No | Both | Guacamole daemon port | — |
| `GUACAMOLE_SECRET` | string | `dev-guac-secret` | **Prod** | Both | Guacamole token encryption key | **Must** be strong random value in prod |

<!-- manual-start -->
<!-- manual-end -->

### Vault

| Variable | Type | Default | Required | Env | Description | Security |
|----------|------|---------|----------|-----|-------------|----------|
| `VAULT_TTL_MINUTES` | int | `30` | No | Both | Vault session TTL in minutes | Lower = more secure, less convenient |

<!-- manual-start -->
<!-- manual-end -->

### File Storage

| Variable | Type | Default | Required | Env | Description | Security |
|----------|------|---------|----------|-----|-------------|----------|
| `DRIVE_BASE_PATH` | string | `./data/drive` | No | Both | Base path for RDP drive redirection files | Must be shared between server and guacd |
| `FILE_UPLOAD_MAX_SIZE` | int | `10485760` (10 MB) | No | Both | Max file upload size in bytes | — |
| `USER_DRIVE_QUOTA` | int | `104857600` (100 MB) | No | Both | Per-user drive storage quota in bytes | — |
| `SFTP_MAX_FILE_SIZE` | int | `104857600` (100 MB) | No | Dev | Max SFTP transfer file size in bytes | — |
| `SFTP_CHUNK_SIZE` | int | `65536` (64 KB) | No | Dev | SFTP transfer chunk size in bytes | — |

<!-- manual-start -->
<!-- manual-end -->

### Email Provider

| Variable | Type | Default | Required | Env | Description | Security |
|----------|------|---------|----------|-----|-------------|----------|
| `EMAIL_PROVIDER` | string | `smtp` | No | Both | Email provider: `smtp`, `sendgrid`, `ses`, `resend`, `mailgun` | — |

**Dev mode**: Leave `EMAIL_PROVIDER=smtp` with `SMTP_HOST` empty. Verification links will be logged to the console.

#### SMTP

| Variable | Type | Default | Required | Env | Description | Security |
|----------|------|---------|----------|-----|-------------|----------|
| `SMTP_HOST` | string | _(empty)_ | If smtp | Prod | SMTP server hostname | — |
| `SMTP_PORT` | int | `587` | No | Prod | SMTP port | — |
| `SMTP_USER` | string | _(empty)_ | If smtp | Prod | SMTP username | Credential |
| `SMTP_PASS` | string | _(empty)_ | If smtp | Prod | SMTP password | **Credential** |
| `SMTP_FROM` | string | `noreply@example.com` | No | Both | Sender email address | — |

#### SendGrid

| Variable | Type | Default | Required | Env | Description | Security |
|----------|------|---------|----------|-----|-------------|----------|
| `SENDGRID_API_KEY` | string | _(empty)_ | If sendgrid | Prod | SendGrid API key | **Credential** |

#### Amazon SES

| Variable | Type | Default | Required | Env | Description | Security |
|----------|------|---------|----------|-----|-------------|----------|
| `AWS_SES_REGION` | string | `us-east-1` | No | Prod | AWS SES region | — |
| `AWS_SES_ACCESS_KEY_ID` | string | _(empty)_ | Optional | Prod | AWS access key (empty = IAM role/default chain) | **Credential** |
| `AWS_SES_SECRET_ACCESS_KEY` | string | _(empty)_ | Optional | Prod | AWS secret key | **Credential** |

#### Resend

| Variable | Type | Default | Required | Env | Description | Security |
|----------|------|---------|----------|-----|-------------|----------|
| `RESEND_API_KEY` | string | _(empty)_ | If resend | Prod | Resend API key | **Credential** |

#### Mailgun

| Variable | Type | Default | Required | Env | Description | Security |
|----------|------|---------|----------|-----|-------------|----------|
| `MAILGUN_API_KEY` | string | _(empty)_ | If mailgun | Prod | Mailgun API key | **Credential** |
| `MAILGUN_DOMAIN` | string | _(empty)_ | If mailgun | Prod | Mailgun domain | — |
| `MAILGUN_REGION` | string | `us` | No | Prod | Mailgun region (`us` or `eu`) | — |

<!-- manual-start -->
<!-- manual-end -->

### SMS Provider

| Variable | Type | Default | Required | Env | Description | Security |
|----------|------|---------|----------|-----|-------------|----------|
| `SMS_PROVIDER` | string | _(empty)_ | No | Both | SMS provider: `twilio`, `sns`, `vonage` (empty = dev mode, logs to console) | — |

#### Twilio

| Variable | Type | Default | Required | Env | Description | Security |
|----------|------|---------|----------|-----|-------------|----------|
| `TWILIO_ACCOUNT_SID` | string | _(empty)_ | If twilio | Prod | Twilio account SID | **Credential** |
| `TWILIO_AUTH_TOKEN` | string | _(empty)_ | If twilio | Prod | Twilio auth token | **Credential** |
| `TWILIO_FROM_NUMBER` | string | _(empty)_ | If twilio | Prod | Twilio sender phone number | — |

#### AWS SNS

| Variable | Type | Default | Required | Env | Description | Security |
|----------|------|---------|----------|-----|-------------|----------|
| `AWS_SNS_REGION` | string | `us-east-1` | No | Prod | AWS SNS region | — |
| `AWS_SNS_ACCESS_KEY_ID` | string | _(empty)_ | Optional | Prod | AWS access key (empty = IAM role) | **Credential** |
| `AWS_SNS_SECRET_ACCESS_KEY` | string | _(empty)_ | Optional | Prod | AWS secret key | **Credential** |

#### Vonage

| Variable | Type | Default | Required | Env | Description | Security |
|----------|------|---------|----------|-----|-------------|----------|
| `VONAGE_API_KEY` | string | _(empty)_ | If vonage | Prod | Vonage API key | **Credential** |
| `VONAGE_API_SECRET` | string | _(empty)_ | If vonage | Prod | Vonage API secret | **Credential** |
| `VONAGE_FROM_NUMBER` | string | _(empty)_ | If vonage | Prod | Vonage sender number | — |

<!-- manual-start -->
<!-- manual-end -->

### OAuth

Leave `CLIENT_ID` empty to disable a provider. Each provider is independently optional.

#### Google

| Variable | Type | Default | Required | Env | Description | Security |
|----------|------|---------|----------|-----|-------------|----------|
| `GOOGLE_CLIENT_ID` | string | _(empty)_ | No | Both | Google OAuth client ID | — |
| `GOOGLE_CLIENT_SECRET` | string | _(empty)_ | If enabled | Both | Google OAuth client secret | **Credential** |
| `GOOGLE_CALLBACK_URL` | string | `http://localhost:3001/api/auth/google/callback` | No | Both | OAuth callback URL | Update for production domain |

#### Microsoft

| Variable | Type | Default | Required | Env | Description | Security |
|----------|------|---------|----------|-----|-------------|----------|
| `MICROSOFT_CLIENT_ID` | string | _(empty)_ | No | Both | Microsoft OAuth client ID | — |
| `MICROSOFT_CLIENT_SECRET` | string | _(empty)_ | If enabled | Both | Microsoft OAuth client secret | **Credential** |
| `MICROSOFT_CALLBACK_URL` | string | `http://localhost:3001/api/auth/microsoft/callback` | No | Both | OAuth callback URL | Update for production domain |

#### GitHub

| Variable | Type | Default | Required | Env | Description | Security |
|----------|------|---------|----------|-----|-------------|----------|
| `GITHUB_CLIENT_ID` | string | _(empty)_ | No | Both | GitHub OAuth client ID | — |
| `GITHUB_CLIENT_SECRET` | string | _(empty)_ | If enabled | Both | GitHub OAuth client secret | **Credential** |
| `GITHUB_CALLBACK_URL` | string | `http://localhost:3001/api/auth/github/callback` | No | Both | OAuth callback URL | Update for production domain |

<!-- manual-start -->
<!-- manual-end -->

### Docker-Specific Variables

These are used by `docker-compose.yml` (production) and are not consumed by the application directly:

| Variable | Type | Default | Required | Env | Description | Security |
|----------|------|---------|----------|-----|-------------|----------|
| `POSTGRES_USER` | string | `rdm` | No | Prod | PostgreSQL superuser name | — |
| `POSTGRES_PASSWORD` | string | — | **Yes** | Prod | PostgreSQL superuser password | **Must** be strong random value |
| `POSTGRES_DB` | string | `remote_desktop_manager` | No | Prod | Database name | — |

<!-- manual-start -->
<!-- manual-end -->

## Development Defaults

For development, copy `.env.example` to `.env`. All defaults are functional:

- Database connects to Docker PostgreSQL at `127.0.0.1:5432`
- JWT uses a placeholder secret (fine for local dev)
- Email verification links are logged to console (no SMTP needed)
- SMS OTP codes are logged to console (no SMS provider needed)
- OAuth is disabled by default (empty client IDs)
- Vault TTL is 30 minutes

## Production Configuration

For production, copy `.env.production.example` to `.env.production` and fill in:

1. **Mandatory secrets** — generate with `openssl rand -base64 32`:
   - `POSTGRES_PASSWORD`
   - `JWT_SECRET`
   - `GUACAMOLE_SECRET`

2. **Email provider** — configure at least one for email verification to work:
   - Set `EMAIL_PROVIDER` and the corresponding credentials
   - Set `SMTP_FROM` to your domain's email address

3. **OAuth** (optional) — for each provider you want:
   - Set `CLIENT_ID` and `CLIENT_SECRET`
   - Update `CALLBACK_URL` to your production domain

4. **SMS MFA** (optional) — configure if you want SMS-based MFA:
   - Set `SMS_PROVIDER` and the corresponding credentials

5. **CLIENT_URL** — set to your production domain (used in email links and OAuth redirects)

<!-- manual-start -->
<!-- manual-end -->
