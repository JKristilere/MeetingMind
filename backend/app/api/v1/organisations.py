import uuid
import re

from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import CurrentUser, DB
from app.core.exceptions import ConflictError, NotFoundError, ForbiddenError
from app.models.organisation import Organisation, OrganisationMember, MemberRole
from app.models.user import User
from app.schemas.organisation import (
    OrganisationCreate,
    OrganisationResponse,
    OrganisationUpdate,
    MemberInvite,
    MemberResponse,
)

router = APIRouter(prefix="/organisations", tags=["organisations"])


def _slugify(name: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", name.lower())
    slug = re.sub(r"[\s_-]+", "-", slug).strip("-")
    return slug[:80]


@router.post("", response_model=OrganisationResponse, status_code=201)
async def create_organisation(body: OrganisationCreate, current_user: CurrentUser, db: DB):
    base_slug = _slugify(body.name)
    slug = base_slug
    counter = 1
    while True:
        existing = await db.execute(select(Organisation).where(Organisation.slug == slug))
        if not existing.scalar_one_or_none():
            break
        slug = f"{base_slug}-{counter}"
        counter += 1

    org = Organisation(
        name=body.name,
        slug=slug,
        industry=body.industry,
        country=body.country,
        timezone=body.timezone,
    )
    db.add(org)
    await db.flush()

    owner = OrganisationMember(
        organisation_id=org.id,
        user_id=current_user.id,
        role=MemberRole.OWNER,
    )
    db.add(owner)
    return org


@router.get("", response_model=list[OrganisationResponse])
async def list_my_organisations(current_user: CurrentUser, db: DB):
    result = await db.execute(
        select(Organisation)
        .join(OrganisationMember)
        .where(
            OrganisationMember.user_id == current_user.id,
            OrganisationMember.is_active == True,
            Organisation.is_active == True,
        )
    )
    return result.scalars().all()


@router.get("/{org_id}", response_model=OrganisationResponse)
async def get_organisation(org_id: uuid.UUID, current_user: CurrentUser, db: DB):
    result = await db.execute(
        select(Organisation)
        .join(OrganisationMember)
        .where(
            Organisation.id == org_id,
            OrganisationMember.user_id == current_user.id,
            OrganisationMember.is_active == True,
        )
    )
    org = result.scalar_one_or_none()
    if not org:
        raise NotFoundError("Organisation")
    return org


@router.patch("/{org_id}", response_model=OrganisationResponse)
async def update_organisation(
    org_id: uuid.UUID, body: OrganisationUpdate, current_user: CurrentUser, db: DB
):
    member_result = await db.execute(
        select(OrganisationMember).where(
            OrganisationMember.organisation_id == org_id,
            OrganisationMember.user_id == current_user.id,
            OrganisationMember.role.in_([MemberRole.OWNER, MemberRole.ADMIN]),
        )
    )
    if not member_result.scalar_one_or_none():
        raise ForbiddenError("Admin or owner access required")

    result = await db.execute(select(Organisation).where(Organisation.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise NotFoundError("Organisation")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(org, field, value)
    return org


@router.get("/{org_id}/members", response_model=list[dict])
async def list_members(org_id: uuid.UUID, current_user: CurrentUser, db: DB):
    result = await db.execute(
        select(OrganisationMember, User)
        .join(User, OrganisationMember.user_id == User.id)
        .where(
            OrganisationMember.organisation_id == org_id,
            OrganisationMember.is_active == True,
        )
    )
    rows = result.all()
    member_result = await db.execute(
        select(OrganisationMember).where(
            OrganisationMember.organisation_id == org_id,
            OrganisationMember.user_id == current_user.id,
        )
    )
    if not member_result.scalar_one_or_none():
        raise ForbiddenError()

    return [
        {
            "id": str(m.id),
            "user_id": str(u.id),
            "full_name": u.full_name,
            "email": u.email,
            "avatar_url": u.avatar_url,
            "role": m.role,
            "joined_at": m.joined_at.isoformat(),
        }
        for m, u in rows
    ]


@router.post("/{org_id}/members/invite", status_code=201)
async def invite_member(org_id: uuid.UUID, body: MemberInvite, current_user: CurrentUser, db: DB):
    admin_result = await db.execute(
        select(OrganisationMember).where(
            OrganisationMember.organisation_id == org_id,
            OrganisationMember.user_id == current_user.id,
            OrganisationMember.role.in_([MemberRole.OWNER, MemberRole.ADMIN]),
        )
    )
    if not admin_result.scalar_one_or_none():
        raise ForbiddenError("Admin or owner access required")

    user_result = await db.execute(select(User).where(User.email == body.email))
    user = user_result.scalar_one_or_none()
    if not user:
        raise NotFoundError("User with that email")

    existing = await db.execute(
        select(OrganisationMember).where(
            OrganisationMember.organisation_id == org_id,
            OrganisationMember.user_id == user.id,
        )
    )
    if existing.scalar_one_or_none():
        raise ConflictError("User is already a member")

    member = OrganisationMember(
        organisation_id=org_id,
        user_id=user.id,
        role=body.role,
    )
    db.add(member)
    return {"message": f"{user.full_name} added to organisation"}
