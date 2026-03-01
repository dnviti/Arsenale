# Components

> Auto-generated on 2026-03-01 by `/docs create components`.
> Source of truth is the codebase. Run `/docs update components` after code changes.

## Overview

**Client tech stack**: React 19, Vite, Material-UI (MUI) v6, Zustand, Axios, XTerm.js, guacamole-common-js

Source: `client/src/`

<!-- manual-start -->
<!-- manual-end -->

## Pages

### LoginPage

- **Route**: `/login`
- **Purpose**: Multi-step login flow with email/password and MFA support
- **Features**: Standard login form → MFA method selection (if multiple) → TOTP code entry OR SMS code entry
- **Stores**: `authStore`, `notificationStore`

### RegisterPage

- **Route**: `/register`
- **Purpose**: User registration with email verification
- **Features**: Registration form, resend verification email
- **Stores**: `authStore`, `notificationStore`

### OAuthCallbackPage

- **Route**: `/oauth/callback`
- **Purpose**: Handle OAuth provider callback redirects
- **Features**: Parses tokens from URL, auto-redirects to dashboard or vault setup
- **Stores**: `authStore`

### DashboardPage

- **Route**: `/` (authenticated)
- **Purpose**: Main application entry point
- **Features**: Initializes vault status polling, fetches connections and folders
- **Stores**: `connectionsStore`, `vaultStore`, `tabsStore`

### ConnectionViewerPage

- **Route**: `/viewer/:id` (also supports popup window mode)
- **Purpose**: Full-screen SSH terminal or RDP viewer
- **Features**: Renders SshTerminal or RdpViewer based on connection type, popup window support with independent token refresh
- **Stores**: `authStore`, `tabsStore`

### SettingsPage

- **Route**: `/settings`
- **Purpose**: User settings and preferences
- **Features**: Profile editing, avatar upload, password change, SSH terminal defaults, RDP defaults, TOTP 2FA, SMS MFA, linked OAuth accounts, email provider status
- **Stores**: `authStore`, `terminalSettingsStore`, `rdpSettingsStore`, `notificationStore`

### TenantSettingsPage

- **Route**: `/tenant`
- **Purpose**: Organization (tenant) management
- **Features**: Create tenant, update name, invite members, manage roles (OWNER/ADMIN/MEMBER), remove members, delete tenant
- **Stores**: `tenantStore`, `notificationStore`

### TeamManagementPage

- **Route**: `/teams`
- **Purpose**: Team management within a tenant
- **Features**: Create/edit/delete teams, add members with role selection (ADMIN/EDITOR/VIEWER), manage memberships
- **Stores**: `teamStore`, `notificationStore`

### AuditLogPage

- **Route**: `/audit`
- **Purpose**: Activity log viewer
- **Features**: Filterable by action type and date range, paginated results
- **Stores**: `notificationStore`

### VaultSetupPage

- **Route**: `/vault-setup`
- **Purpose**: Initial vault password setup for OAuth-only users
- **Features**: Password entry form, redirects to dashboard on completion
- **Stores**: `authStore`, `notificationStore`

<!-- manual-start -->
<!-- manual-end -->

## Components

### Layout

#### MainLayout

- **File**: `client/src/components/Layout/MainLayout.tsx`
- **Purpose**: Root layout wrapping authenticated pages
- **Features**: Sidebar with connection tree, tab bar, main content area, vault unlock dialog, notification bell
- **Children**: ConnectionTree (sidebar), TabBar, TabPanel

#### NotificationBell

- **File**: `client/src/components/Layout/NotificationBell.tsx`
- **Purpose**: Notification indicator in the header
- **Features**: Badge with unread count, dropdown list of notifications, mark as read, delete
- **Stores**: `notificationListStore`

<!-- manual-start -->
<!-- manual-end -->

### Sidebar

#### ConnectionTree

- **File**: `client/src/components/Sidebar/ConnectionTree.tsx`
- **Purpose**: Hierarchical tree view of connections and folders
- **Features**: Favorites section, recent connections, personal folders, shared connections, team sections (collapsible), drag-to-reorder, context menu (edit, delete, share)
- **Stores**: `connectionsStore`, `tabsStore`, `uiPreferencesStore`

#### TeamConnectionSection

- **File**: `client/src/components/Sidebar/TeamConnectionSection.tsx`
- **Purpose**: Expandable section for a team's connections in the sidebar
- **Features**: Collapse state persisted via `uiPreferencesStore`, shows team folders and connections
- **Stores**: `uiPreferencesStore`

#### treeHelpers

- **File**: `client/src/components/Sidebar/treeHelpers.tsx`
- **Purpose**: Utility functions for building connection tree structure
- **Features**: Recursive tree building from flat folder/connection arrays

<!-- manual-start -->
<!-- manual-end -->

### Tabs

#### TabBar

- **File**: `client/src/components/Tabs/TabBar.tsx`
- **Purpose**: Horizontal tab bar for open connections
- **Features**: Active tab highlighting, close button, connection type icon
- **Stores**: `tabsStore`

#### TabPanel

- **File**: `client/src/components/Tabs/TabPanel.tsx`
- **Purpose**: Content container for each tab
- **Features**: Renders SshTerminal or RdpViewer based on connection type, lazy rendering

<!-- manual-start -->
<!-- manual-end -->

### Terminal / SSH

#### SshTerminal

- **File**: `client/src/components/Terminal/SshTerminal.tsx`
- **Purpose**: SSH terminal emulator
- **Features**: XTerm.js terminal, Socket.IO connection, resize handling, configurable theme/font/cursor, SFTP browser toggle
- **Stores**: `terminalSettingsStore`, `uiPreferencesStore`

#### SftpBrowser

- **File**: `client/src/components/SSH/SftpBrowser.tsx`
- **Purpose**: SFTP file browser panel alongside SSH terminal
- **Features**: Directory listing, navigate, create directory, delete files/dirs, rename, upload/download files
- **Stores**: `uiPreferencesStore`

#### SftpTransferQueue

- **File**: `client/src/components/SSH/SftpTransferQueue.tsx`
- **Purpose**: Upload/download progress queue
- **Features**: Progress bars per transfer, cancel button, clear completed
- **Stores**: `uiPreferencesStore`

<!-- manual-start -->
<!-- manual-end -->

### RDP

#### RdpViewer

- **File**: `client/src/components/RDP/RdpViewer.tsx`
- **Purpose**: RDP remote desktop viewer
- **Features**: Guacamole client rendering, keyboard/mouse input, clipboard sync, connection status
- **Stores**: `uiPreferencesStore`

#### FileBrowser

- **File**: `client/src/components/RDP/FileBrowser.tsx`
- **Purpose**: RDP drive redirection file browser
- **Features**: Browse, upload, download files shared via RDP drive redirection
- **Stores**: `uiPreferencesStore`

<!-- manual-start -->
<!-- manual-end -->

### Dialogs

#### ConnectionDialog

- **File**: `client/src/components/Dialogs/ConnectionDialog.tsx`
- **Purpose**: Create/edit connection form
- **Features**: Name, host, port, type (RDP/SSH), credentials, folder selection, team assignment, drive enable, SSH terminal config, RDP settings
- **Stores**: `connectionsStore`, `notificationStore`

#### FolderDialog

- **File**: `client/src/components/Dialogs/FolderDialog.tsx`
- **Purpose**: Create/rename folder
- **Stores**: `connectionsStore`, `notificationStore`

#### ShareDialog

- **File**: `client/src/components/Dialogs/ShareDialog.tsx`
- **Purpose**: Share a connection with another user
- **Features**: User search (by email), permission selection (READ_ONLY/FULL_ACCESS), list existing shares, update/revoke
- **Stores**: `notificationStore`

#### ConnectAsDialog

- **File**: `client/src/components/Dialogs/ConnectAsDialog.tsx`
- **Purpose**: Override credentials when opening a connection
- **Features**: Username/password input for one-time credential override
- **Stores**: `tabsStore`

#### TeamDialog

- **File**: `client/src/components/Dialogs/TeamDialog.tsx`
- **Purpose**: Create/edit team
- **Stores**: `teamStore`, `notificationStore`

#### InviteDialog

- **File**: `client/src/components/Dialogs/InviteDialog.tsx`
- **Purpose**: Invite user to tenant organization
- **Features**: Email input, role selection
- **Stores**: `tenantStore`, `notificationStore`

#### VaultUnlockDialog

- **File**: `client/src/components/Dialogs/VaultUnlockDialog.tsx`
- **Purpose**: Prompt for vault password when vault is locked
- **Stores**: `vaultStore`, `notificationStore`

<!-- manual-start -->
<!-- manual-end -->

### Settings

#### TerminalSettingsSection

- **File**: `client/src/components/Settings/TerminalSettingsSection.tsx`
- **Purpose**: SSH terminal defaults configuration
- **Features**: Font family, size, line height, letter spacing, cursor style/blink, theme, custom colors, scrollback, bell style
- **Stores**: `terminalSettingsStore`

#### RdpSettingsSection

- **File**: `client/src/components/Settings/RdpSettingsSection.tsx`
- **Purpose**: RDP connection defaults
- **Features**: Color depth, resolution, DPI, resize method, quality preset, wallpaper/theming/font smoothing toggles, audio settings, security mode, keyboard layout
- **Stores**: `rdpSettingsStore`

#### TwoFactorSection

- **File**: `client/src/components/Settings/TwoFactorSection.tsx`
- **Purpose**: TOTP authenticator setup/disable
- **Features**: QR code display, 6-digit code verification, enable/disable toggle
- **Stores**: `notificationStore`

#### SmsMfaSection

- **File**: `client/src/components/Settings/SmsMfaSection.tsx`
- **Purpose**: SMS MFA phone setup and management
- **Features**: Phone number input (E.164), verification code entry, enable/disable toggle
- **Stores**: `notificationStore`

#### LinkedAccountsSection

- **File**: `client/src/components/Settings/LinkedAccountsSection.tsx`
- **Purpose**: Manage linked OAuth accounts
- **Features**: List linked providers, link/unlink Google/Microsoft/GitHub accounts
- **Stores**: `notificationStore`

#### EmailProviderSection

- **File**: `client/src/components/Settings/EmailProviderSection.tsx`
- **Purpose**: Email provider status and testing
- **Features**: Shows active provider, configuration status, send test email
- **Stores**: `notificationStore`

<!-- manual-start -->
<!-- manual-end -->

### Overlays

#### VaultLockedOverlay

- **File**: `client/src/components/Overlays/VaultLockedOverlay.tsx`
- **Purpose**: Full-screen overlay when vault is locked and credentials are needed

<!-- manual-start -->
<!-- manual-end -->

### Shared

#### FloatingToolbar

- **File**: `client/src/components/shared/FloatingToolbar.tsx`
- **Purpose**: Floating action toolbar for RDP/SSH sessions
- **Features**: Clipboard, screenshot, disconnect, fullscreen, settings

#### OAuthButtons

- **File**: `client/src/components/OAuthButtons.tsx`
- **Purpose**: OAuth provider login/link buttons
- **Features**: Google, Microsoft, GitHub buttons with provider icons

#### UserPicker

- **File**: `client/src/components/UserPicker.tsx`
- **Purpose**: User search and selection autocomplete
- **Features**: Search by query, display user email/username, select user

<!-- manual-start -->
<!-- manual-end -->

## State Management

### authStore

- **File**: `client/src/store/authStore.ts`
- **Persistence**: localStorage (`rdm-auth`)
- **State**: `accessToken`, `refreshToken`, `user`, `isAuthenticated`
- **Actions**: `setAuth(tokens, user)`, `setAccessToken(token)`, `updateUser(user)`, `logout()`

### connectionsStore

- **File**: `client/src/store/connectionsStore.ts`
- **Persistence**: None (session only)
- **State**: `ownConnections`, `sharedConnections`, `teamConnections`, `folders`, `teamFolders`, `loading`
- **Actions**: `fetchConnections()`, `fetchFolders()`, `toggleFavorite(id)`, `moveConnection(id, folderId)`

### vaultStore

- **File**: `client/src/store/vaultStore.ts`
- **Persistence**: None
- **State**: `unlocked`, `initialized`
- **Actions**: `checkStatus()`, `setUnlocked(bool)`, `startPolling()`, `stopPolling()`
- **Notes**: Polls vault status every 60 seconds

### tabsStore

- **File**: `client/src/store/tabsStore.ts`
- **Persistence**: None
- **State**: `tabs` (array with connection data and optional credential overrides), `activeTabId`, `recentTick`
- **Actions**: `openTab(connection, credentials?)`, `closeTab(id)`, `setActiveTab(id)`
- **Notes**: Reuses existing tab for same connection unless credentials differ

### uiPreferencesStore

- **File**: `client/src/store/uiPreferencesStore.ts`
- **Persistence**: localStorage (`rdm-ui-preferences`)
- **State**: `rdpFileBrowserOpen`, `sshSftpBrowserOpen`, `sshSftpTransferQueueOpen`, `sidebarFavoritesOpen`, `sidebarRecentsOpen`, `sidebarSharedOpen`, `sidebarCompact`, `sidebarTeamSections` (Map of team collapse states)
- **Actions**: `set(key, value)`, `toggle(key)`, `toggleTeamSection(teamId)`

### terminalSettingsStore

- **File**: `client/src/store/terminalSettingsStore.ts`
- **Persistence**: None (fetched from server)
- **State**: `userDefaults`, `loaded`, `loading`
- **Actions**: `fetchDefaults()`, `updateDefaults(config)`

### rdpSettingsStore

- **File**: `client/src/store/rdpSettingsStore.ts`
- **Persistence**: None (fetched from server)
- **State**: `userDefaults`, `loaded`, `loading`
- **Actions**: `fetchDefaults()`, `updateDefaults(config)`

### notificationStore

- **File**: `client/src/store/notificationStore.ts`
- **Persistence**: None
- **State**: `notification` (message + severity)
- **Actions**: `notify(message, severity)`, `clear()`
- **Notes**: Toast/snackbar notifications (not persistent server notifications)

### notificationListStore

- **File**: `client/src/store/notificationListStore.ts`
- **Persistence**: None
- **State**: `notifications`, `unreadCount`, `total`, `loading`
- **Actions**: `fetchNotifications(limit, offset)`, `markAsRead(id)`, `markAllAsRead()`, `removeNotification(id)`, `addNotification(notif)`, `reset()`
- **Notes**: Server-persisted notifications (connection sharing events)

### tenantStore

- **File**: `client/src/store/tenantStore.ts`
- **Persistence**: None
- **State**: `tenant`, `users`, `loading`, `usersLoading`
- **Actions**: `fetchTenant()`, `createTenant(name)`, `updateTenant(id, data)`, `deleteTenant(id)`, `fetchUsers()`, `inviteUser(email, role)`, `updateUserRole(userId, role)`, `removeUser(userId)`, `reset()`

### teamStore

- **File**: `client/src/store/teamStore.ts`
- **Persistence**: None
- **State**: `teams`, `loading`, `selectedTeam`, `members`, `membersLoading`
- **Actions**: `fetchTeams()`, `createTeam(name, description?)`, `updateTeam(id, data)`, `deleteTeam(id)`, `selectTeam(team)`, `clearSelectedTeam()`, `fetchMembers(teamId)`, `addMember(teamId, userId, role)`, `updateMemberRole(teamId, userId, role)`, `removeMember(teamId, userId)`, `reset()`

### themeStore

- **File**: `client/src/store/themeStore.ts`
- **Persistence**: localStorage (`rdm-theme`)
- **State**: `mode` (`'light'` | `'dark'`)
- **Actions**: `toggle()`

<!-- manual-start -->
<!-- manual-end -->

## Hooks

### useAuth

- **File**: `client/src/hooks/useAuth.ts`
- **Purpose**: Bootstrap authentication from persisted refresh token
- **Behavior**: On mount, if not authenticated but `refreshToken` exists in store, attempts to refresh the access token. Redirects to `/login` on failure.
- **Returns**: `{ isAuthenticated: boolean }`

### useSocket

- **File**: `client/src/hooks/useSocket.ts`
- **Purpose**: Manage Socket.IO connection with JWT authentication
- **Parameters**: `namespace: string` (e.g., `"/ssh"`)
- **Behavior**: Creates Socket.IO connection with `accessToken` in auth, uses `websocket` transport only
- **Returns**: `socketRef` (React ref to Socket instance)

### useSftpTransfers

- **File**: `client/src/hooks/useSftpTransfers.ts`
- **Purpose**: SFTP file upload/download management
- **Parameters**: `socket` (Socket.IO instance)
- **Behavior**: Subscribes to server events (`sftp:progress`, `sftp:transfer:complete`, `sftp:transfer:error`, `sftp:transfer:cancelled`, `sftp:download:chunk`). Handles chunked uploads (64KB chunks) and assembles downloaded chunks for browser download.
- **Returns**: `{ transfers, uploadFile, downloadFile, cancelTransfer, clearCompleted }`

<!-- manual-start -->
<!-- manual-end -->

## API Layer

All API modules use the centralized Axios client from `client/src/api/client.ts`.

| Module | File | Key Functions |
|--------|------|---------------|
| auth | `auth.api.ts` | `loginApi`, `verifyTotpApi`, `requestSmsCodeApi`, `verifySmsApi`, `registerApi`, `refreshApi`, `logoutApi` |
| user | `user.api.ts` | `getProfile`, `updateProfile`, `changePassword`, `updateSshDefaults`, `updateRdpDefaults`, `uploadAvatar`, `searchUsers` |
| connections | `connections.api.ts` | CRUD operations, `toggleFavorite`, connection data for tabs |
| folders | `folders.api.ts` | `createFolder`, `getFolders`, `updateFolder`, `deleteFolder` |
| vault | `vault.api.ts` | `unlockVault`, `lockVault`, `getVaultStatus`, `revealPassword` |
| sharing | `sharing.api.ts` | `shareConnection`, `unshareConnection`, `updateSharePermission`, `listShares`, `createSession` (RDP), `createSshSession` |
| twofa | `twofa.api.ts` | `setup2FA`, `verify2FA`, `disable2FA`, `get2FAStatus` |
| smsMfa | `smsMfa.api.ts` | `setupSmsPhone`, `verifySmsPhone`, `enableSmsMfa`, `sendSmsMfaDisableCode`, `disableSmsMfa`, `getSmsMfaStatus` |
| oauth | `oauth.api.ts` | `getOAuthProviders`, `getLinkedAccounts`, `unlinkOAuthAccount`, `setupVaultPassword`, `initiateOAuthLogin`, `initiateOAuthLink` |
| audit | `audit.api.ts` | `getAuditLogs` (with filtering and pagination) |
| notifications | `notifications.api.ts` | `getNotifications`, `markAsRead`, `markAllAsRead`, `deleteNotification` |
| tenant | `tenant.api.ts` | Org CRUD, member invite/role management |
| team | `team.api.ts` | Team CRUD, member management with role selection |
| email | `email.api.ts` | `resendVerificationEmail` |
| files | `files.api.ts` | Upload (multipart), download, delete user drive files |
| admin | `admin.api.ts` | `getEmailStatus`, `sendTestEmail` |

<!-- manual-start -->
<!-- manual-end -->
