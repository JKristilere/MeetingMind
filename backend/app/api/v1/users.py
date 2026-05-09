from fastapi import APIRouter

from app.api.deps import CurrentUser, DB
from app.models.user import User
from app.schemas.user import UserResponse, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
async def get_profile(current_user: CurrentUser):
    return current_user


@router.patch("/me", response_model=UserResponse)
async def update_profile(body: UserUpdate, current_user: CurrentUser, db: DB):
    import json
    for field, value in body.model_dump(exclude_none=True).items():
        if field == "notification_prefs":
            setattr(current_user, field, json.dumps(value))
        else:
            setattr(current_user, field, value)
    return current_user
