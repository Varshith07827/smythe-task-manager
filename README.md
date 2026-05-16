# 📋 Smythe — Task Management System

A full-stack task management application with a Node.js/Express backend, MongoDB database, React frontend, and real-time updates via Socket.io.

## Features

- **Shell UI** — Collapsed icon rail by default (Google-style); use the menu control in the top bar to expand. Choice is remembered for the browser tab; press **Escape** to collapse. On small screens the rail hides in favor of the top links.
- **Task CRUD** — Create, read, update, delete tasks and projects
- **User Authentication** — JWT-based login and registration
- **Real-time Updates** — Socket.io for live task status changes
- **File Attachments** — Upload files to tasks via Multer
- **Rate Limiting** — API protection against abuse
- **Security Headers** — Helmet.js for HTTP security
- **Email Notifications** — Optional outbound mail via [Noteify](https://noteify.org) when `NOTEIFY_API_KEY` is set (see `backend/.env.example`)
- **Notifications** — Sidebar **Notification** (always visible, under Settings) opens `/notifications`: your full preferences, links to each board’s recipient/schedule page, and a **Team (admin)** table for managers/creators to toggle in-app, email, and board-summary prefs per member (same toggles appear under **Settings → Members**). The **Dashboard** has quick toggles for your own in-app, email, and board summaries. Every 4 hours when a board schedule is on, assignees receive summaries according to these preferences.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express |
| Database | MongoDB (Mongoose) |
| Real-time | Socket.io |
| Auth | JWT (jsonwebtoken), bcryptjs |
| Frontend | React, Vite |
| Dev | Nodemon |

## Getting Started

### Backend
```bash
cd backend
npm install
cp .env.example .env   # Configure your MongoDB URI and JWT secret
npm run dev
```

To wipe the database and seed demo data (three accounts, two boards, tasks with assignments, custom columns, comments, a subtask, and sample activity), run `npm run db:reset` in `backend/`. Default password is `SmytheDemo123!` unless you set `SMYTHE_SEED_PASSWORD` in the environment.

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Project Structure

```
Smythe/
├── backend/
│   ├── server.js           # Express + Socket.io server
│   ├── config/             # DB and socket config
│   ├── controllers/        # Route controllers
│   ├── middleware/         # Auth middleware
│   ├── models/             # Mongoose models
│   ├── routes/             # API routes
│   ├── services/           # Business logic
│   └── utils/              # Helper functions
└── frontend/
    ├── src/                # React components
    ├── index.html
    └── vite.config.js
```

## Email (Noteify)

Transactional emails use the same JSON shape as the Noteify API: `apikey`, `email`, `subject`, `body`. Set `NOTEIFY_API_KEY` in `backend/.env`. Optional: `NOTEIFY_URL` (defaults to `https://noteify.org/email/`), and `APP_PUBLIC_URL` for the “Open Smythe” link in HTML messages (falls back to `CLIENT_URL`).

## Production deploy (example)

Typical layout: MongoDB on the same host, Node listening on `127.0.0.1:5002`, Nginx serving the Vite build from `/var/www/dev.anydb.pro` and proxying `/api/` and `/socket.io/` to Node.

1. **MongoDB** — Install MongoDB 7.x (or current LTS) for your OS; use `MONGO_URI=mongodb://127.0.0.1:27017/smythe` (or your DB name) in `backend/.env`.

2. **Backend** — In `backend/`: `npm ci`, copy `.env.example` to `.env`, set `JWT_SECRET`, `CLIENT_URL` (exact browser origin, e.g. `https://dev.anydb.pro`), `NOTEIFY_API_KEY`, and `APP_PUBLIC_URL` if it differs from `CLIENT_URL`. Run with a process manager, e.g. `pm2 start server.js --name smythe-api`.

3. **Frontend** — In `frontend/`: `npm ci && npm run build`. Upload the contents of `frontend/dist/` to your web root (e.g. `/var/www/dev.anydb.pro`).

4. **Nginx** — See `deploy/nginx-dev.anydb.pro.conf` for a starting server block. Enable HTTPS with your preferred ACME client (e.g. Certbot) once HTTP works.

**Secrets:** Never commit real API keys, JWT secrets, or SSH passwords. If a secret was shared in plain text, rotate it at the provider and on the server.
