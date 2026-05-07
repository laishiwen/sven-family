from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlmodel.ext.asyncio.session import AsyncSession
from app.core.config import settings
from app.core.database import get_session
from app.models.admin import AdminUser

security = HTTPBearer()


async def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Security(security),
    session: AsyncSession = Depends(get_session),
) -> AdminUser:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        admin_id: str = payload.get("sub")
        if admin_id is None:
            raise HTTPException(401, "Invalid token")
    except JWTError:
        raise HTTPException(401, "Invalid token")
    admin = await session.get(AdminUser, admin_id)
    if not admin or admin.status != "active":
        raise HTTPException(401, "Admin not found or disabled")
    return admin


def require_role(*roles: str):
    async def dependency(admin: AdminUser = Depends(get_current_admin)):
        if admin.role not in roles:
            raise HTTPException(403, "Insufficient permissions")
        return admin

    return dependency
