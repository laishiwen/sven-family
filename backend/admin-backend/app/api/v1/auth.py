import hashlib
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from jose import jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import settings
from app.core.database import get_session
from app.models.admin import AdminUser
from app.middleware.auth import get_current_admin, require_role
from app.middleware.audit import log_admin_action
from app.middleware.ratelimit import auth_rate_limit

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _hash_password(raw: str) -> str:
    """SHA-256 pre-hash to avoid plaintext transmission, then bcrypt for storage."""
    return hashlib.sha256(raw.encode()).hexdigest()


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    admin: dict


class AdminCreateRequest(BaseModel):
    username: str
    email: str
    password: str
    role: str = "moderator"


class AdminUpdateRequest(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.jwt_expire_minutes))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest, session: AsyncSession = Depends(get_session), _=Depends(auth_rate_limit)):
    result = await session.exec(select(AdminUser).where(AdminUser.email == req.email))
    admin = result.first()
    # Frontend sends SHA-256(password); backend bcrypt-verifies it directly
    if not admin:
        raise HTTPException(401, "Admin not found")
    if not pwd_context.verify(req.password, admin.password_hash):
        raise HTTPException(401, "Invalid email or password")
    if admin.status != "active":
        raise HTTPException(403, "Account is disabled")

    # Extract values before commit to avoid MissingGreenlet
    admin_id = admin.id
    admin_role = admin.role
    admin_username = admin.username
    admin_email = admin.email
    admin_status = admin.status

    admin.last_login_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(admin)
    await session.commit()

    token = create_access_token({"sub": admin_id, "role": admin_role})
    return LoginResponse(
        access_token=token,
        admin={
            "id": admin_id,
            "username": admin_username,
            "email": admin_email,
            "role": admin_role,
            "status": admin_status,
        },
    )


@router.get("/me")
async def get_me(admin: AdminUser = Depends(get_current_admin)):
    return {
        "id": admin.id,
        "username": admin.username,
        "email": admin.email,
        "role": admin.role,
        "status": admin.status,
        "last_login_at": admin.last_login_at,
        "created_at": admin.created_at,
    }


@router.post("/admins")
async def create_admin(
    req: AdminCreateRequest,
    session: AsyncSession = Depends(get_session),
    current_admin: AdminUser = Depends(require_role("super_admin")),
):
    existing = await session.exec(
        select(AdminUser).where(
            (AdminUser.username == req.username) | (AdminUser.email == req.email)
        )
    )
    if existing.first():
        raise HTTPException(409, "Username or email already exists")
    admin = AdminUser(
        username=req.username,
        email=req.email,
        password_hash=pwd_context.hash(req.password),
        role=req.role,
    )
    session.add(admin)
    await session.commit()
    await session.refresh(admin)

    await log_admin_action(
        admin_id=current_admin.id, admin_name=current_admin.username,
        action="create_admin", target_type="admin", target_id=admin.id,
    )

    return {
        "id": admin.id,
        "username": admin.username,
        "email": admin.email,
        "role": admin.role,
        "status": admin.status,
    }


@router.get("/admins")
async def list_admins(
    session: AsyncSession = Depends(get_session),
    _: AdminUser = Depends(require_role("super_admin")),
):
    result = await session.exec(select(AdminUser).order_by(AdminUser.created_at.desc()))
    admins = result.all()
    return [
        {
            "id": a.id,
            "username": a.username,
            "email": a.email,
            "role": a.role,
            "status": a.status,
            "last_login_at": a.last_login_at,
            "created_at": a.created_at,
        }
        for a in admins
    ]


@router.put("/admins/{admin_id}")
async def update_admin(
    admin_id: str,
    req: AdminUpdateRequest,
    session: AsyncSession = Depends(get_session),
    current_admin: AdminUser = Depends(require_role("super_admin")),
):
    admin = await session.get(AdminUser, admin_id)
    if not admin:
        raise HTTPException(404, "Admin not found")
    if req.email is not None:
        admin.email = req.email
    if req.password is not None:
        admin.password_hash = pwd_context.hash(req.password)
    if req.role is not None:
        admin.role = req.role
    if req.status is not None:
        admin.status = req.status
    admin.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(admin)
    await session.commit()
    await session.refresh(admin)

    await log_admin_action(
        admin_id=current_admin.id, admin_name=current_admin.username,
        action="update_admin", target_type="admin", target_id=admin_id,
    )

    return {
        "id": admin.id,
        "username": admin.username,
        "email": admin.email,
        "role": admin.role,
        "status": admin.status,
    }


@router.delete("/admins/{admin_id}")
async def delete_admin(
    admin_id: str,
    session: AsyncSession = Depends(get_session),
    current_admin: AdminUser = Depends(require_role("super_admin")),
):
    if admin_id == current_admin.id:
        raise HTTPException(400, "Cannot delete yourself")
    admin = await session.get(AdminUser, admin_id)
    if not admin:
        raise HTTPException(404, "Admin not found")
    await session.delete(admin)
    await session.commit()

    await log_admin_action(
        admin_id=current_admin.id, admin_name=current_admin.username,
        action="delete_admin", target_type="admin", target_id=admin_id,
    )

    return {"message": "Admin deleted"}
