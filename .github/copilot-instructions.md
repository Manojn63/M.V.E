# M.V.E. Workspace Instructions

- Keep the official product name exactly `M.V.E.` and the full name `Master Video Editor`.
- The frontend is a dependency-free single-page app in `index.html`, `styles.css`, and `app.js`.
- Keep SPA navigation in `data-view-link` / `data-panel`; do not add separate HTML pages for product areas.
- Backend endpoints live in `backend/main.py` and use FastAPI/Pydantic. Do not imply provider-backed AI, persistence, or rendering exists until it is implemented and validated.
- Serve the editor through FastAPI; `/` must serve the login page until a valid signed session exists. Protect the editor bundle and private APIs with the same server-side session check.
- Configure accounts through `.env` using Argon2 hashes and a random 32-character `MVE_SESSION_SECRET`; never commit plaintext credentials or session secrets.
- Require a valid admin role for Admin UI views and private admin endpoints; standard users must not receive admin permissions.
- Keep browser media previews local. Never request social account passwords; use official OAuth for any future integrations.
- Run the FastAPI service from the workspace root with `.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload` after setting up local accounts.