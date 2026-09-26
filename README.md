# M.V.E. — Master Video Editor

M.V.E. is a high-performance single-page creative editing studio with local video preview, an interactive timeline, multi-track layout, creative workflow views, and a FastAPI backend with cryptographic session authentication.

---

## Architecture & Design System

The application is built on a clean, dependency-free architecture:
- **Frontend**: Native HTML5, modern CSS3 (`styles.css` & `auth.css`), and Vanilla JavaScript (`app.js` & `login.js`). No Node.js or React runtime required.
- **Design System**: Signature dark creative workspace (`#101211`), neon lime (`#d4ff52`), mint/cyan (`#67d9bf`), warm peach (`#f3a276`), and typography powered by **Syne** and **Space Grotesk**.
- **Backend**: Python FastAPI with Pydantic models in `backend/main.py`.

---

## Authentication & Roles

Authentication uses Argon2 password hashes and server-signed, expiring HMAC-SHA256 session cookies. The configured administrator email defaults during local setup to `natarajmanoj28@gmail.com`; email alone never grants access. Standard users receive the `user` role, while the admin view and `/api/admin/overview` require the `admin` role on the server.

Create account hashes and the random session key through a hidden-input local setup prompt:

```powershell
cd F:\M.V.E
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.\.venv\Scripts\python.exe backend\configure_accounts.py
```

This creates/updates the ignored `.env` with password hashes, not plaintext passwords. Use a fresh strong password rather than reusing credentials shared in chat. Configure a standard-user email and password separately when prompted. Never commit `.env`.

## Run Locally

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.\.venv\Scripts\python.exe backend\configure_accounts.py
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8001
```

Open `http://127.0.0.1:8001`. FastAPI serves the frontend and API together; the current HTML/CSS/JavaScript frontend does not need a separate development server. If the port is occupied, use another available port.

---

## API Endpoints

- `GET /api/health` — Service health probe.
- `POST /api/auth/login` — Authenticate and receive a signed session cookie.
- `GET /api/auth/me` — Retrieve the currently authenticated user.
- `POST /api/auth/logout` — Revoke the session cookie and sign out.
- `POST /api/generate-audio` — Queue asynchronous audio synthesis requests.
- `GET /api/generate-audio/{job_id}` — Query status of audio generation jobs.
- `GET /api/admin/overview` — Admin-only runtime overview.

## Infrastructure Status

There is no database, ORM schema, migration system, persistent user store, background job broker, object storage, or video/audio rendering worker configured. No database migrations are required for this in-memory prototype. The admin overview reports only actual process/configuration state; user management and influencer-directory operations are not yet implemented. Complete these services, add rate limiting, password reset, audit logs, and TLS before production deployment. Set `MVE_COOKIE_SECURE=true` when serving over HTTPS.

---

## Deployment Guide

### Deploy to Render / Railway / Cloud Run
The app runs on Python uvicorn and can be deployed with a single command or Dockerfile:

**Start Command:**
```bash
uvicorn backend.main:app --host 0.0.0.0 --port $PORT
```

### GitHub Repository Setup
```bash
git init
git add .
git commit -m "M.V.E. Master Video Editor with unified dark studio theme and admin authentication"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo-name>.git
git push -u origin main
```