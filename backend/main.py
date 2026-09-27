"""API foundation for M.V.E. Master Video Editor."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import os
import time
from datetime import datetime, timezone
from enum import StrEnum
from pathlib import Path
from uuid import uuid4

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from argon2 import PasswordHasher
from argon2.exceptions import Argon2Error
from dotenv import load_dotenv


class AudioJobStatus(StrEnum):
    queued = "queued"
    processing = "processing"
    failed = "failed"


class AudioGenerationRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=1200)
    genre: str = Field(default="Electronic", max_length=80)
    mood: str = Field(default="Hopeful", max_length=80)
    bpm: int = Field(default=112, ge=40, le=240)
    duration_seconds: int = Field(default=30, ge=5, le=180)
    energy: float = Field(default=0.65, ge=0, le=1)
    instruments: list[str] = Field(default_factory=list, max_length=16)


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=1024)


class AuthenticatedUser(BaseModel):
    username: str
    email: str
    role: str


class AudioJob(BaseModel):
    id: str
    status: AudioJobStatus
    created_at: datetime
    prompt: str
    genre: str = "Electronic"
    mood: str = "Hopeful"
    bpm: int = 112
    duration_seconds: int = 30
    energy: float = 0.65
    instruments: list[str] = Field(default_factory=list)
    request: AudioGenerationRequest
    message: str | None = None


app = FastAPI(title="M.V.E. Master Video Editor API", version="0.1.0")
FRONTEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(FRONTEND_DIR / ".env")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)
audio_jobs: dict[str, AudioJob] = {}

SESSION_COOKIE = "mve_session"
SESSION_MAX_AGE = 8 * 60 * 60
password_hasher = PasswordHasher()


def get_auth_settings() -> tuple[str, str, str, str, bytes] | None:
    admin_email = os.getenv("MVE_ADMIN_EMAIL", "").strip().lower()
    admin_hash = os.getenv("MVE_ADMIN_PASSWORD_HASH", "").strip()
    user_email = os.getenv("MVE_USER_EMAIL", "").strip().lower()
    user_hash = os.getenv("MVE_USER_PASSWORD_HASH", "").strip()
    session_secret = os.getenv("MVE_SESSION_SECRET", "").encode("utf-8")

    if not admin_email or not admin_hash or len(session_secret) < 32:
        return None
    if bool(user_email) != bool(user_hash):
        return None
    if user_email == admin_email:
        return None
    return admin_email, admin_hash, user_email, user_hash, session_secret


def sign_session(email: str, role: str, expires_at: int, secret: bytes) -> str:
    session_data = json.dumps(
        {"email": email, "role": role, "exp": expires_at},
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    payload = base64.urlsafe_b64encode(session_data).decode("ascii").rstrip("=")
    signature = hmac.new(secret, payload.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{payload}.{signature}"


def session_identity(token: str | None, secret: bytes) -> AuthenticatedUser | None:
    if not token:
        return None
    try:
        payload, supplied_signature = token.split(".", 1)
        expected_signature = hmac.new(secret, payload.encode("ascii"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(supplied_signature, expected_signature):
            return None
        padded_payload = payload + "=" * (-len(payload) % 4)
        data = json.loads(base64.urlsafe_b64decode(padded_payload).decode("utf-8"))
        email = str(data["email"]).strip().lower()
        role = str(data["role"])
        if int(data["exp"]) <= int(time.time()) or role not in {"admin", "user"}:
            return None
        settings = get_auth_settings()
        if settings is None:
            return None
        admin_email, _, user_email, _, _ = settings
        if (role == "admin" and email != admin_email) or (
            role == "user" and email != user_email
        ):
            return None
        return AuthenticatedUser(username=email, email=email, role=role)
    except (KeyError, TypeError, ValueError, UnicodeDecodeError, json.JSONDecodeError):
        return None


async def require_authenticated(request: Request) -> AuthenticatedUser:
    settings = get_auth_settings()
    if settings is None:
        raise HTTPException(status_code=503, detail="Authentication is not configured")
    user = session_identity(request.cookies.get(SESSION_COOKIE), settings[4])
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


async def require_admin(
    user: AuthenticatedUser = Depends(require_authenticated),
) -> AuthenticatedUser:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Administrator access required")
    return user


async def process_audio_job(job_id: str) -> None:
    """Fail clearly until an authorized generation provider is configured."""
    await asyncio.sleep(0)
    job = audio_jobs.get(job_id)
    if job is None:
        return
    audio_jobs[job_id] = job.model_copy(
        update={
            "status": AudioJobStatus.failed,
            "message": "No audio generation provider is configured.",
        }
    )


@app.get("/", include_in_schema=False)
async def frontend(request: Request) -> FileResponse:
    settings = get_auth_settings()
    user = session_identity(request.cookies.get(SESSION_COOKIE), settings[4]) if settings else None
    page = "index.html" if user else "login.html"
    return FileResponse(FRONTEND_DIR / page, headers={"Cache-Control": "no-store"})


@app.get("/styles.css", include_in_schema=False)
async def frontend_styles() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "styles.css", media_type="text/css")


@app.get("/app.js", include_in_schema=False)
async def frontend_script(
    _user: AuthenticatedUser = Depends(require_authenticated),
) -> FileResponse:
    return FileResponse(
        FRONTEND_DIR / "app.js",
        media_type="text/javascript",
        headers={"Cache-Control": "private, no-store"},
    )


@app.get("/auth.css", include_in_schema=False)
async def login_styles() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "auth.css", media_type="text/css")


@app.get("/login.js", include_in_schema=False)
async def login_script() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "login.js", media_type="text/javascript")


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "product": "M.V.E."}


@app.post("/api/auth/login")
async def login(credentials: LoginRequest, response: Response) -> AuthenticatedUser:
    settings = get_auth_settings()
    if settings is None:
        raise HTTPException(
            status_code=503,
            detail="Configure admin/user password hashes and MVE_SESSION_SECRET before sign-in.",
        )

    admin_email, admin_hash, user_email, user_hash, secret = settings
    email_input = credentials.username.strip().lower()
    password_input = credentials.password
    authenticated_email: str | None = None
    role: str | None = None

    if email_input == admin_email:
        candidate_hash, candidate_role = admin_hash, "admin"
    elif user_email and email_input == user_email:
        candidate_hash, candidate_role = user_hash, "user"
    else:
        candidate_hash, candidate_role = "", ""

    if candidate_hash:
        try:
            password_hasher.verify(candidate_hash, password_input)
            authenticated_email, role = email_input, candidate_role
        except Argon2Error:
            pass
    if authenticated_email is None or role is None:
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    expires_at = int(time.time()) + SESSION_MAX_AGE
    response.set_cookie(
        key=SESSION_COOKIE,
        value=sign_session(authenticated_email, role, expires_at, secret),
        max_age=SESSION_MAX_AGE,
        httponly=True,
        secure=os.getenv("MVE_COOKIE_SECURE", "").lower() == "true",
        samesite="strict",
        path="/",
    )
    return AuthenticatedUser(username=authenticated_email, email=authenticated_email, role=role)


@app.get("/api/auth/me", response_model=AuthenticatedUser)
async def current_user(user: AuthenticatedUser = Depends(require_authenticated)) -> AuthenticatedUser:
    return user


@app.post("/api/auth/logout")
async def logout(response: Response) -> dict[str, str]:
    response.delete_cookie(key=SESSION_COOKIE, httponly=True, samesite="strict", path="/")
    return {"status": "signed out"}


@app.post("/api/generate-audio", response_model=AudioJob, status_code=202)
async def generate_audio(
    request: AudioGenerationRequest,
    background_tasks: BackgroundTasks,
    _user: AuthenticatedUser = Depends(require_authenticated),
) -> AudioJob:
    job = AudioJob(
        id=str(uuid4()),
        status=AudioJobStatus.queued,
        created_at=datetime.now(timezone.utc),
        prompt=request.prompt,
        genre=request.genre,
        mood=request.mood,
        bpm=request.bpm,
        duration_seconds=request.duration_seconds,
        energy=request.energy,
        instruments=request.instruments,
        request=request,
    )
    audio_jobs[job.id] = job
    background_tasks.add_task(process_audio_job, job.id)
    return job


@app.get("/api/generate-audio/{job_id}", response_model=AudioJob)
async def get_audio_job(
    job_id: str, _user: AuthenticatedUser = Depends(require_authenticated)
) -> AudioJob:
    job = audio_jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Audio job not found")
    return job


@app.get("/api/admin/overview")
async def admin_overview(
    _admin: AuthenticatedUser = Depends(require_admin),
) -> dict[str, str | int]:
    return {
        "product": "M.V.E.",
        "access": "administrator",
        "configured_accounts": 1 + int(bool(os.getenv("MVE_USER_EMAIL", "").strip())),
        "audio_jobs_in_memory": len(audio_jobs),
        "persistence": "not configured",
    }