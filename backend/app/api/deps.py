import uuid
from typing import Annotated

from fastapi import Depends, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import UnauthorizedError, ForbiddenError
from app.core.security import decode_token
from app.database import get_db
from app.models.user import User
from app.models.organisation import Organisation, OrganisationMember, MemberRole

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    if not credentials:
        raise UnauthorizedError()
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise UnauthorizedError("Invalid token type")
        user_id = uuid.UUID(payload["sub"])
    except (JWTError, ValueError, KeyError):
        raise UnauthorizedError("Invalid or expired token")

    result = await db.execute(select(User).where(User.id == user_id, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        raise UnauthorizedError("User not found or inactive")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


async def get_org_member(
    org_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
) -> OrganisationMember:
    result = await db.execute(
        select(OrganisationMember).where(
            OrganisationMember.organisation_id == org_id,
            OrganisationMember.user_id == current_user.id,
            OrganisationMember.is_active == True,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise ForbiddenError("Not a member of this organisation")
    return member


async def require_org_admin(
    org_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
) -> OrganisationMember:
    member = await get_org_member(org_id, current_user, db)
    if member.role not in (MemberRole.OWNER, MemberRole.ADMIN):
        raise ForbiddenError("Admin access required")
    return member
