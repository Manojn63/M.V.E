
"""M.R-V.E. Master Video Editor FastAPI backend."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Literal, Optional

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHash, VerifyMismatchError
from fastapi import Cookie, Depends, FastAPI, HTTPException, Response
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / ".env"
USER_DB_PATH = BASE_DIR / "backend" / "users.json"


def load_env_file(path: Path) -> None:
	if not path.exists():
		return
	for raw_line in path.read_text(encoding="utf-8").splitlines():
		line = raw_line.strip()
		if not line or line.startswith("#") or "=" not in line:
			continue
		key, _, value = line.partition("=")
		os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env_file(ENV_PATH)
database_setting = os.environ.get("MVE_DATABASE_PATH", "backend/mve.db")
DATABASE_PATH = Path(database_setting)
if not DATABASE_PATH.is_absolute():
	DATABASE_PATH = BASE_DIR / DATABASE_PATH

ADMIN_EMAIL = os.environ.get("MVE_ADMIN_EMAIL", "").strip().lower()
ADMIN_PASSWORD_HASH = os.environ.get("MVE_ADMIN_PASSWORD_HASH", "").strip()
USER_EMAIL = os.environ.get("MVE_USER_EMAIL", "").strip().lower()
USER_PASSWORD_HASH = os.environ.get("MVE_USER_PASSWORD_HASH", "").strip()
SESSION_SECRET = os.environ.get("MVE_SESSION_SECRET", "").strip()
COOKIE_SECURE = os.environ.get("MVE_COOKIE_SECURE", "false").lower() == "true"

if len(SESSION_SECRET) < 32:
	raise RuntimeError("MVE_SESSION_SECRET must contain at least 32 characters.")
if not ADMIN_EMAIL or not ADMIN_PASSWORD_HASH:
	raise RuntimeError("MVE_ADMIN_EMAIL and MVE_ADMIN_PASSWORD_HASH are required.")

SESSION_COOKIE_NAME = "mve_session"
SESSION_TTL_SECONDS = 7 * 24 * 60 * 60
Role = Literal["admin", "user"]
hasher = PasswordHasher()


def database_connection() -> sqlite3.Connection:
	DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
	connection = sqlite3.connect(DATABASE_PATH, timeout=10)
	connection.row_factory = sqlite3.Row
	return connection


def initialize_database() -> None:
	with database_connection() as connection:
		connection.executescript(
			"""
			CREATE TABLE IF NOT EXISTS users (
				email TEXT PRIMARY KEY,
				password_hash TEXT NOT NULL,
				role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
				name TEXT NOT NULL DEFAULT '',
				created_at TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS sessions (
				token_id TEXT PRIMARY KEY,
				email TEXT NOT NULL,
				expires_at INTEGER NOT NULL,
				revoked_at INTEGER
			);
			CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions(email);
			"""
		)
		now = time.strftime("%Y-%m-%dT%H:%M:%SZ")
		connection.execute(
			"""INSERT INTO users(email, password_hash, role, name, created_at)
			   VALUES (?, ?, 'admin', ?, ?)
			   ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash,
				   role='admin'""",
			(ADMIN_EMAIL, ADMIN_PASSWORD_HASH, ADMIN_EMAIL.split("@", 1)[0], now),
		)
		if USER_EMAIL and USER_PASSWORD_HASH:
			connection.execute(
				"""INSERT INTO users(email, password_hash, role, name, created_at)
				   VALUES (?, ?, 'user', ?, ?)
				   ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash,
					   role='user'""",
				(USER_EMAIL, USER_PASSWORD_HASH, USER_EMAIL.split("@", 1)[0], now),
			)
		if USER_DB_PATH.exists():
			try:
				records = json.loads(USER_DB_PATH.read_text(encoding="utf-8"))
			except (OSError, json.JSONDecodeError):
				records = {}
			if isinstance(records, dict):
				for email, record in records.items():
					if not isinstance(record, dict):
						continue
					username = str(record.get("email", email)).strip().lower()
					password_hash = str(record.get("password_hash", "")).strip()
					if not username or not password_hash or username == ADMIN_EMAIL:
						continue
					connection.execute(
						"""INSERT OR IGNORE INTO users(email, password_hash, role, name, created_at)
						   VALUES (?, ?, 'user', ?, ?)""",
						(username, password_hash, str(record.get("name", "")).strip(),
						 str(record.get("created_at", now))),
					)


def find_user(username: str) -> sqlite3.Row | None:
	with database_connection() as connection:
		return connection.execute(
			"SELECT * FROM users WHERE email = ?", (username,)
		).fetchone()


initialize_database()


def encode(data: bytes) -> str:
	return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def decode(data: str) -> bytes:
	return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def sign(payload: str) -> str:
	digest = hmac.new(SESSION_SECRET.encode(), payload.encode("ascii"), hashlib.sha256).digest()
	return encode(digest)


def create_session_token(username: str, role: Role) -> str:
	expires_at = int(time.time()) + SESSION_TTL_SECONDS
	token_id = uuid.uuid4().hex
	payload = {"sub": username, "role": role, "exp": expires_at, "jti": token_id}
	payload_b64 = encode(json.dumps(payload, separators=(",", ":")).encode())
	token = f"{payload_b64}.{sign(payload_b64)}"
	with database_connection() as connection:
		connection.execute(
			"INSERT INTO sessions(token_id, email, expires_at) VALUES (?, ?, ?)",
			(token_id, username, expires_at),
		)
	return token


def verify_session_token(token: str) -> Optional[dict]:
	try:
		payload_b64, signature = token.split(".", 1)
		if not hmac.compare_digest(sign(payload_b64), signature):
			return None
		payload = json.loads(decode(payload_b64))
		if payload.get("exp", 0) < time.time() or not payload.get("jti"):
			return None
		with database_connection() as connection:
			session = connection.execute(
				"""SELECT sessions.email, users.role FROM sessions
				   JOIN users ON users.email = sessions.email
				   WHERE sessions.token_id = ? AND sessions.email = ?
				   AND sessions.revoked_at IS NULL AND sessions.expires_at > ?""",
				(payload["jti"], payload.get("sub"), int(time.time())),
			).fetchone()
		if session is None or payload.get("role") != session["role"]:
			return None
		return payload
	except (KeyError, TypeError, ValueError, UnicodeDecodeError, json.JSONDecodeError):
		return None


def set_session_cookie(response: Response, username: str, role: Role) -> None:
	response.set_cookie(
		key=SESSION_COOKIE_NAME,
		value=create_session_token(username, role),
		max_age=SESSION_TTL_SECONDS,
		httponly=True,
		secure=COOKIE_SECURE,
		samesite="lax",
		path="/",
	)


def get_current_user(mve_session: Optional[str] = Cookie(default=None)) -> dict:
	if not mve_session:
		raise HTTPException(status_code=401, detail="Not authenticated.")
	payload = verify_session_token(mve_session)
	if not payload:
		raise HTTPException(status_code=401, detail="Session expired or invalid.")
	return {"username": payload["sub"], "role": payload["role"]}


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
	if current_user["role"] != "admin":
		raise HTTPException(status_code=403, detail="Administrator access required.")
	return current_user


app = FastAPI(title="M.R-V.E. Master Video Editor")
audio_jobs: dict[str, dict] = {}


class LoginPayload(BaseModel):
	username: str = Field(min_length=3, max_length=254)
	password: str = Field(min_length=1, max_length=1024)


class RegisterPayload(BaseModel):
	username: str = Field(min_length=3, max_length=254)
	password: str = Field(min_length=8, max_length=1024)
	name: str = Field(default="", max_length=120)


class AudioBriefPayload(BaseModel):
	prompt: str = Field(min_length=3, max_length=1200)
	genre: str = Field(default="", max_length=80)
	mood: str = Field(default="", max_length=80)
	bpm: int = Field(default=112, ge=40, le=240)
	duration_seconds: int = Field(default=30, ge=5, le=180)
	energy: float = Field(default=0.65, ge=0, le=1)
	instruments: list[str] = Field(default_factory=list, max_length=16)


@app.get("/api/health")
def health() -> dict[str, str]:
	return {"status": "ok"}


@app.post("/api/auth/login")
def login(payload: LoginPayload, response: Response) -> dict[str, str]:
	return authenticate(payload, response)


@app.post("/api/auth/admin-login")
def admin_login(payload: LoginPayload, response: Response) -> dict[str, str]:
	return authenticate(payload, response, required_role="admin")


def authenticate(
	payload: LoginPayload,
	response: Response,
	required_role: Optional[Role] = None,
) -> dict[str, str]:
	username = payload.username.strip().lower()
	account = find_user(username)
	if account:
		try:
			hasher.verify(str(account["password_hash"]), payload.password)
		except (VerifyMismatchError, InvalidHash):
			account = None
	if not account:
		raise HTTPException(status_code=401, detail="Invalid email or password.")
	role: Role = "admin" if str(account["role"]) == "admin" else "user"
	if required_role is not None and role != required_role:
		raise HTTPException(status_code=401, detail="Invalid email or password.")
	set_session_cookie(response, username, role)
	return {"username": username, "role": role}


@app.post("/api/auth/register")
def register(payload: RegisterPayload, response: Response) -> dict[str, str]:
	username = payload.username.strip().lower()
	if "@" not in username or "." not in username.split("@")[-1]:
		raise HTTPException(status_code=422, detail="A valid email address is required.")
	if find_user(username) is not None:
		raise HTTPException(status_code=409, detail="An account with this email already exists.")
	password_hash = hasher.hash(payload.password)
	with database_connection() as connection:
		connection.execute(
			"INSERT INTO users(email, password_hash, role, name, created_at) VALUES (?, ?, 'user', ?, ?)",
			(username, password_hash, payload.name.strip(), time.strftime("%Y-%m-%dT%H:%M:%SZ")),
		)
	set_session_cookie(response, username, "user")
	return {"username": username, "role": "user"}


@app.get("/api/auth/me")
def me(current_user: dict = Depends(get_current_user)) -> dict:
	return current_user


@app.post("/api/auth/logout")
def logout(response: Response, mve_session: Optional[str] = Cookie(default=None)) -> dict[str, str]:
	if mve_session:
		try:
			payload_b64, _ = mve_session.split(".", 1)
			payload = json.loads(decode(payload_b64))
			with database_connection() as connection:
				connection.execute(
					"UPDATE sessions SET revoked_at = ? WHERE token_id = ?",
					(int(time.time()), payload.get("jti")),
				)
		except (TypeError, ValueError, UnicodeDecodeError, json.JSONDecodeError):
			pass
	response.delete_cookie(SESSION_COOKIE_NAME, path="/")
	return {"status": "ok"}


@app.post("/api/generate-audio")
def queue_audio_job(payload: AudioBriefPayload, current_user: dict = Depends(get_current_user)) -> dict[str, str]:
	job_id = uuid.uuid4().hex[:12]
	audio_jobs[job_id] = {
		"id": job_id,
		"status": "failed",
		"message": "No audio generation provider is configured for this workspace.",
		"brief": payload.model_dump(),
		"created_by": current_user["username"],
		"created_at": time.time(),
	}
	return {"id": job_id, "status": "queued"}


@app.get("/api/generate-audio/{job_id}")
def get_audio_job(job_id: str, current_user: dict = Depends(get_current_user)) -> dict:
	job = audio_jobs.get(job_id)
	if not job:
		raise HTTPException(status_code=404, detail="Job not found.")
	return job


@app.get("/api/admin/overview")
def admin_overview(current_user: dict = Depends(require_admin)) -> dict:
	with database_connection() as connection:
		configured_accounts = connection.execute("SELECT COUNT(*) FROM users").fetchone()[0]
	return {
		"configured_accounts": configured_accounts,
		"audio_jobs_in_memory": len(audio_jobs),
		"persistence": f"SQLite database: {DATABASE_PATH}",
	}


FRONTEND_DIR = BASE_DIR


@app.get("/admin-login", response_class=HTMLResponse)
def admin_login_page() -> FileResponse:
	return FileResponse(FRONTEND_DIR / "login.html")


@app.get("/", response_class=HTMLResponse)
def root(mve_session: Optional[str] = Cookie(default=None)) -> FileResponse:
	if mve_session and verify_session_token(mve_session):
		return FileResponse(FRONTEND_DIR / "index.html")
	return FileResponse(FRONTEND_DIR / "login.html")


app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=False), name="frontend-assets")