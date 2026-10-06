"""Supabase Auth JWT validation.

Validates the Supabase-issued JWT from the Authorization header, then loads the
caller's Profile (which carries the RBAC role). Never implements custom password
storage — all auth is delegated to Supabase Auth.
"""
from __future__ import annotations
import time
import uuid
from dataclasses import dataclass

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import Profile, Role
from app.utils.http import http_client

_bearer = HTTPBearer(auto_error=False)
_jwks_cache: dict | None = None
_jwks_fetched_at: float = 0.0
_JWKS_TTL = 600  # seconds


@dataclass
class AuthUser:
    id: uuid.UUID
    email: str | None
    role: Role
    profile: Profile


def _jwks() -> dict:
    """Fetch and cache the Supabase JWKS (public keys only)."""
    global _jwks_cache, _jwks_fetched_at
    settings = get_settings()
    if _jwks_cache and (time.time() - _jwks_fetched_at) < _JWKS_TTL:
        return _jwks_cache
    url = settings.supabase_url.rstrip("/") + "/auth/v1/.well-known/jwks.json"
    try:
        with http_client(timeout=10) as client:
            resp = client.get(url)
        resp.raise_for_status()
        _jwks_cache = resp.json()
        _jwks_fetched_at = time.time()
        return _jwks_cache
    except Exception as exc:  # network failure -> fail closed
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            "Authentication service unavailable") from exc


def decode_supabase_jwt(token: str) -> dict:
    """Verify signature + expiry + audience of a Supabase access token."""
    settings = get_settings()
    if not settings.supabase_url:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR,
                            "Supabase is not configured")

    # Fast path for tests/dev: HS256 secret verification when configured.
    if settings.supabase_jwt_secret and not settings.supabase_url.startswith("https://your-project"):
        pass  # fall through to JWKS path unless it looks like a placeholder

    jwks = _jwks()
    try:
        header = jwt.get_unverified_header(token)
        key = next((k for k in jwks.get("keys", []) if k.get("kid") == header.get("kid")), None)
        if key is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token key")
        public_key = jwt.algorithms.RSAAlgorithm.from_jwk(key)
        return jwt.decode(
            token, public_key, algorithms=["RS256", "ES256"],
            audience="authenticated",
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired. Please log in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or malformed token")


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> AuthUser:
    if creds is None or not creds.credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required")
    claims = decode_supabase_jwt(creds.credentials)
    try:
        user_id = uuid.UUID(claims["sub"])
    except (KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token subject")

    profile = db.get(Profile, user_id)
    if profile is None:
        # Auto-provision: Supabase Auth user exists but profile row missing
        # (e.g. created via dashboard). Role defaults to TRAVELER.
        profile = Profile(id=user_id, email=claims.get("email") or "", role=Role.TRAVELER)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return AuthUser(id=profile.id, email=profile.email, role=profile.role, profile=profile)


def require_roles(*roles: Role):
    """Dependency factory: allow only the given roles."""
    def _check(user: AuthUser = Depends(get_current_user)) -> AuthUser:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN,
                                "You don't have permission to perform this action")
        return user
    return _check


def can_access_trip(user: AuthUser, trip) -> bool:
    """Trip-level authorization: owner, assigned staff, or admin/operator."""
    if user.role in (Role.ADMIN, Role.OPERATOR):
        return True
    if trip.traveler_id == user.id:
        return True
    if user.role == Role.COORDINATOR and trip.coordinator_id == user.id:
        return True
    return False


def assert_trip_access(user: AuthUser, trip) -> None:
    if not can_access_trip(user, trip):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You don't have access to this trip")


def can_access_vendor(user: AuthUser, vendor) -> bool:
    if user.role in (Role.ADMIN, Role.OPERATOR):
        return True
    return vendor.profile_id is not None and vendor.profile_id == user.id
