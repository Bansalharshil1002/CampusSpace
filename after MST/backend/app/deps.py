from fastapi import Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models import User
from app.security import decode_access_token

bearer = HTTPBearer(auto_error=False)


def load_user(db: Session, user_id: str) -> User | None:
    return (
        db.query(User)
        .options(joinedload(User.role_rows), joinedload(User.assignments))
        .filter(User.id == user_id)
        .one_or_none()
    )


def user_from_token(db: Session, token: str | None) -> User:
    if not token:
        raise HTTPException(status_code=401, detail="Please sign in first")
    user_id = decode_access_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Please sign in first")
    user = load_user(db, user_id)
    if user is None or not user.active:
        raise HTTPException(status_code=401, detail="Please sign in first")
    return user


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    return user_from_token(db, creds.credentials if creds else None)


def get_stream_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    token: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> User:
    return user_from_token(db, (creds.credentials if creds else None) or token)


def require_roles(*roles: str):
    def checker(user: User = Depends(get_current_user)) -> User:
        if not any(user.has_role(role) for role in roles):
            raise HTTPException(status_code=403, detail="You are not allowed to do that")
        return user

    return checker
