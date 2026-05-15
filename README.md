# 📋 Smythe Task Manager

Smythe is a full-stack, multi-user task and board management platform with:

- **Node.js + Express API**
- **MongoDB + Mongoose data layer**
- **React + Vite frontend**
- **Socket.io real-time updates**
- **Role-based access control (admin/user)**
- **In-app + email notification workflows**
- **Organization branding and automation controls**

---

## Table of Contents

1. [What this project does](#what-this-project-does)
2. [Core capabilities](#core-capabilities)
3. [Architecture overview](#architecture-overview)
4. [Repository structure](#repository-structure)
5. [Backend deep dive](#backend-deep-dive)
6. [Frontend deep dive](#frontend-deep-dive)
7. [Data model](#data-model)
8. [Authentication, authorization, and access model](#authentication-authorization-and-access-model)
9. [API map](#api-map)
10. [Notifications and automations](#notifications-and-automations)
11. [File uploads](#file-uploads)
12. [Environment variables](#environment-variables)
13. [Local development setup](#local-development-setup)
14. [Scripts and operational commands](#scripts-and-operational-commands)
15. [Production deployment guide](#production-deployment-guide)
16. [Troubleshooting](#troubleshooting)
17. [Security notes](#security-notes)

---

## What this project does

Smythe helps teams manage work using project boards and tasks. It supports:

- Board-level organization and permissions
- Task lifecycle management (status, priority, assignment, comments, activity)
- Dynamic board columns (text/number/dropdown/date/etc.)
- Real-time board/task synchronization for active users
- Notifications (in-app and optional Noteify email delivery)
- Scheduled reminders and progress digests
- Organization-level settings and white-label branding

---

## Core capabilities

### Workspace and boards
- Create, update, archive, restore, and permanently delete boards
- Restrict board visibility and edit rights
- Customize board schema via configurable columns
- Archive boards separately from active workspace view

### Task management
- Full CRUD per task inside a board
- Bulk operations (assign/status/archive/delete)
- Task comments with mentions
- Parent/subtask linkage (`parentTask`)
- Task-level notification preferences

### Collaboration and UX
- Real-time events via Socket.io (`task:created`, `task:updated`, `task:deleted`, bulk updates, board updates)
- Dashboard board pinning and ordering persistence
- Board search/filter tools (status, priority, text)
- Spreadsheet import support from UI

### Notifications and reporting
- Per-user notification preferences
- Board-level recipient schedule controls
- Deadline reminder scheduler
- Progress digest scheduler (default every 4 hours)
- Optional email delivery via Noteify

### Admin and organization controls
- Invite users
- Role and status management
- Branding customization (logo/title/colors/favicon/header options)
- Automation mode controls (internal cron vs external)
- Organization member profile + notification preference management

---

## Architecture overview

### Backend
- **Runtime:** Node.js (CommonJS)
- **HTTP:** Express
- **DB:** MongoDB via Mongoose
- **Security middleware:** Helmet, CORS, rate limiting
- **Realtime:** Socket.io with JWT-authenticated handshake
- **Scheduling:** `node-cron` services

### Frontend
- **Framework:** React 18
- **Build tool:** Vite 5
- **Routing:** React Router v6
- **State/context:** React Context (Auth, Socket, Theme/Branding)
- **HTTP client:** Axios (JWT token injection interceptor)
- **Charts/UI:** Recharts, Framer Motion, toast/confirm alert system

### Runtime flow (high-level)
1. User logs in and receives JWT.
2. Frontend stores token and sends it on all `/api` calls.
3. Socket connection authenticates with the same JWT.
4. Board/task actions hit REST endpoints; backend persists data in MongoDB.
5. Backend emits board-level Socket.io events to connected users.
6. Notification services create in-app notices and optional emails.

---

## Repository structure

```text
smythe-task-manager/
├── backend/
│   ├── config/                # DB and socket setup
│   ├── controllers/           # Route handler logic
│   ├── middleware/            # Auth, RBAC, board access, validators
│   ├── models/                # Mongoose schemas
│   ├── routes/                # API route definitions
│   ├── services/              # Notifications, schedulers, uploads, activity
│   ├── scripts/               # Seed/reset and test utility scripts
│   ├── server.js              # App bootstrap + middleware + routes
│   └── .env.example           # Environment template
├── frontend/
│   ├── src/
│   │   ├── api/               # API clients
│   │   ├── components/        # Reusable UI pieces
│   │   ├── context/           # Auth/socket/branding/theme providers
│   │   ├── pages/             # Route-level pages
│   │   └── utils/             # UI/shared helpers
│   ├── vite.config.js         # Dev server and proxy config
│   └── index.html
├── deploy/
│   └── nginx-dev.anydb.pro.conf # Nginx production example
└── README.md
```

---

## Backend deep dive

### Server bootstrap (`backend/server.js`)
- Initializes Express + HTTP server
- Initializes Socket.io
- Registers middleware:
  - `helmet()`
  - `cors({ origin: true, credentials: true })`
  - `morgan('dev')`
  - `express.json({ limit: '10mb' })`
- Enables trust proxy (`app.set('trust proxy', 1)`)
- Applies `/api` rate limiter (skipping login/register/otp routes)
- Mounts route modules:
  - `/api/auth`
  - `/api/organizations`
  - `/api/boards`
  - `/api/users`
  - `/api/notifications`
  - `/api/activity`
  - `/api` (attachments endpoints)
- Exposes health endpoint: `GET /api/health`
- Starts scheduler services:
  - `progressDigestScheduler.start()`
  - `deadlineReminderScheduler.start()`

### Socket system (`backend/config/socket.js`)
- Validates JWT from `socket.handshake.auth.token`
- Joins users to `org:<orgId>` room
- Supports board rooms with:
  - `join:board`
  - `leave:board`
- Publishes presence/cell activity helpers and board/task sync events

### Database boot behavior (`backend/config/db.js`)
- Connects using `MONGO_URI`
- If local URI unavailable, can fallback to in-memory MongoDB server
- Runs role migration for legacy values (`creator/manager -> admin`)

---

## Frontend deep dive

### App shell and routing (`frontend/src/App.jsx`)
- Public routes: `/login`, `/register`
- Authenticated routes under `Layout`:
  - `/` dashboard
  - `/boards/:boardId`
  - `/boards/:boardId/notifications`
  - `/settings`
  - `/notifications`
  - `/profile`
  - `/archived`
  - `/logs`

### Auth and session behavior
- `AuthContext` stores token/user in localStorage
- `authApi.getMe()` validates persisted session on app boot
- Axios interceptor auto-attaches `Authorization: Bearer <token>`
- On unauthorized non-auth requests, client clears session and redirects to login

### Realtime behavior
- `SocketContext` establishes connection when token exists
- Dev socket URL targets `http(s)://<host>:5000`; production uses same-origin `/`
- Board view subscribes to board room and applies live updates in UI state

### API proxy behavior (local dev)
- Vite proxy forwards `/api` -> `http://localhost:5000`
- This allows frontend requests to use relative `/api` base URL

---

## Data model

### User
- Identity: `name`, `email`, hashed `password`
- Role: `admin` or `user`
- Status: `active`, `inactive`, `invited`
- Preferences: in-app/email toggles, quiet hours, digest mode, reminder interval settings

### Organization (single-org per instance)
- Organization metadata (`name`, `inviteCode`)
- `members[]` with per-member role
- `settings` (limits, automation mode/config)
- `branding` settings (title/logo/favicon/colors/header/sidebar options)

### Board
- Title/description
- Dynamic `columns[]` schema with type/options/order/visibility
- Permission model (`visibility`, allowed users/managers, comment/status controls)
- Progress digest controls (`enabled`, `intervalHours`)
- Custom statuses and priorities
- Archive state

### Task
- Relation: `board`
- Core fields: title, description, assignees, status, priority, due/start/completed dates
- `columnValues` map for board-specific fields
- History trail entries
- Comments + mentions
- Attachments references
- Per-task notification settings
- Parent/child relationship and archive state

### Other models
- `Notification`: in-app notification records and grouping keys
- `ActivityLog`: action timeline across system entities
- `Attachment`: metadata for uploaded files

---

## Authentication, authorization, and access model

### Authentication
- JWT issuance on successful login/OTP verification
- Protected API routes require Bearer token
- Socket connections require token during handshake auth

### Authorization
- Role guard middleware (`authorize('admin')`) for admin-only operations
- Board access middleware checks board-level view/edit permissions

### Registration flow
- `register/request`: sends temporary code
- `register/confirm`: verifies code, creates user, sends credentials email

### Invite flow
- Admin invites by email
- User gets temporary credentials and invited status

---

## API map

> Base URL: `/api`

### Auth routes
- `POST /auth/register/request`
- `POST /auth/register/confirm`
- `POST /auth/login`
- `POST /auth/otp/request`
- `POST /auth/otp/verify`
- `POST /auth/invite` (admin)
- `POST /auth/support`
- `GET /auth/me`

### Organization routes
- Branding public endpoints
- Current org read/update
- Branding upload
- Automation read/update
- Manual automation trigger endpoints

### Board + task routes
- Board CRUD + archive/restore/permanent-delete
- Column CRUD + reorder + replacement
- Board permissions update
- Board activity and scheduled notification configuration
- Task CRUD within board
- Task reminder trigger
- Task notification preference update
- Task comments CRUD
- Task activity
- Task bulk assign/status/archive/delete

### User routes
- Org members listing
- Current user profile/avatar/password/preferences
- Admin member profile/role/status/preferences management
- User removal/restore

### Notifications routes
- List notifications
- Unread count
- Mark one or all as read

### Attachments routes
- Upload/list task attachments
- Download/view/delete by attachment ID

### Activity routes
- Global activity feed for admins

---

## Notifications and automations

### In-app notifications
- Stored as `Notification` documents
- User-facing notifications page supports read/unread management

### Email notifications (Noteify)
- Enabled only when `NOTEIFY_API_KEY` is configured
- Request body format:
  - `apikey`
  - `email`
  - `subject`
  - `body` (HTML supported)

### Deadline reminder scheduler
- Service: `backend/services/deadlineReminderScheduler.js`
- Default cron: `*/30 * * * *`
- Honors:
  - user preference toggles
  - quiet hours
  - urgent thresholds
  - board/org archive and automation settings

### Progress digest scheduler
- Service: `backend/services/progressDigestScheduler.js`
- Default cron: `0 */4 * * *`
- Sends grouped assigned-task summaries to each user per board

---

## File uploads

- Handled with Multer disk storage (`backend/services/uploadService.js`)
- Default max upload size: **25MB**
- Stored under `backend/uploads/<taskId>/...`
- Allowed MIME types include common images, PDF, Office docs, text, CSV

---

## Environment variables

Copy `backend/.env.example` to `backend/.env` and update values.

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | No | API server port (default `5000`) |
| `NODE_ENV` | No | Runtime mode |
| `CLIENT_URL` | Yes | Frontend origin for CORS/email fallback links |
| `MONGO_URI` | Yes* | MongoDB connection URI (`*` in-memory fallback exists for some flows) |
| `JWT_SECRET` | Yes | JWT signing secret |
| `JWT_EXPIRES_IN` | No | JWT TTL (example `7d`) |
| `NOTEIFY_API_KEY` | No | Enables outbound email notifications |
| `NOTEIFY_URL` | No | Noteify endpoint override (default `https://noteify.org/email/`) |
| `APP_PUBLIC_URL` | No | Public app URL in email CTAs |
| `DEADLINE_REMINDER_CRON` | No | Cron expression for deadline scheduler |
| `PROGRESS_DIGEST_CRON` | No | Cron expression for digest scheduler |
| `SMYTHE_SEED_PASSWORD` | No | Seed script demo-user password override |

Also present in `.env.example` for storage integrations:
- `S3_REGION`
- `S3_ENDPOINT`
- `S3_BUCKET`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`

---

## Local development setup

### 1) Prerequisites
- Node.js 18+ (recommended)
- npm
- MongoDB (local or remote)

### 2) Backend setup

```bash
cd backend
npm ci
cp .env.example .env
# update JWT_SECRET, MONGO_URI, CLIENT_URL, etc.
npm run dev
```

Backend runs on `http://localhost:5000` by default.

### 3) Frontend setup

```bash
cd frontend
npm ci
npm run dev
```

Frontend runs on `http://localhost:5173` by default.

### 4) Seed demo data (optional)

```bash
cd backend
npm run db:reset
```

This drops current DB content and inserts rich sample data for testing boards/tasks/users/activity.

---

## Scripts and operational commands

### Backend (`backend/package.json`)
- `npm run start` — start API server
- `npm run dev` — start API server with nodemon
- `npm run db:reset` — drop and reseed database
- `npm run test:email` — run notification/email test utility

### Frontend (`frontend/package.json`)
- `npm run dev` — start Vite dev server
- `npm run build` — production build
- `npm run preview` — preview production build

### Useful maintenance scripts (backend root)
- `create-admin.js`
- `delete-user.js`
- `mergeOrgs.js`
- `remove-old-creds.js`
- `scripts/seed-admin.js`

Review each script before running in shared/production environments.

---

## Production deployment guide

A reference Nginx setup exists at:

`deploy/nginx-dev.anydb.pro.conf`

### Recommended topology
- MongoDB service
- Node API bound to localhost (`127.0.0.1:5000`)
- Nginx serves frontend static files and proxies:
  - `/api/` -> Node API
  - `/socket.io/` -> Node API (WebSocket upgrade)

### Deployment steps
1. Build frontend (`frontend`: `npm ci && npm run build`).
2. Place `frontend/dist/*` in web root.
3. Configure backend env vars (`backend/.env`) and run backend with process manager.
4. Apply Nginx config (adapt domain and filesystem paths).
5. Enable TLS via Certbot or equivalent.

---

## Troubleshooting

### Frontend cannot reach API
- Confirm backend runs on port `5000`.
- Confirm Vite proxy points to `http://localhost:5000`.
- Confirm browser is calling `/api/...` paths (not hardcoded host mismatch).

### 401 auth loops
- Check `JWT_SECRET` consistency across restarts.
- Clear browser localStorage token/user and log in again.

### Emails not sent
- Ensure `NOTEIFY_API_KEY` is set.
- Optionally test with `npm run test:email` in backend.

### Socket events not working
- Ensure Nginx forwards `/socket.io/` with upgrade headers.
- Ensure token exists and is valid on socket handshake.

### DB connection issues
- Verify `MONGO_URI`.
- For local default fallback behavior, check backend startup logs for in-memory fallback messages.

---

## Security notes

- Do **not** commit secrets (`JWT_SECRET`, API keys, DB credentials).
- Rotate credentials immediately if exposed.
- Keep dependencies updated and monitor `npm audit` output.
- Multer 1.x is installed; evaluate migration to Multer 2.x as part of dependency hardening.
- Consider replacing in-memory OTP/pending-registration storage with Redis for multi-instance production.

---

## Validation snapshot (documentation update)

During this README update:
- Frontend build succeeded (`frontend: npm run build`)
- Backend dependencies installed successfully (`backend: npm ci`)

No dedicated automated backend test suite or linter scripts are currently defined in `backend/package.json`.
