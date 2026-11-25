from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.deps import get_current_user, require_roles
from app.models import StatusLog, User
from app.permissions import can_view_history
from app.schemas import HistoryOut

router = APIRouter(tags=["history"])


def dump(log: StatusLog, actor: User) -> HistoryOut:
    person = log.user
    room = log.room
    staff = actor.has_role("admin") or actor.has_role("teacher")
    return HistoryOut(
        id=log.id,
        status=log.status,
        note=log.note,
        created_at=log.created_at,
        room_id=log.room_id,
        rooms={"code": room.code} if room else None,
        profiles={
            "name": person.name if person else None,
            "email": person.email if person and staff else None,
        },
    )


@router.get("/history", response_model=list[HistoryOut])
def all_history(
    user: User = Depends(require_roles("admin", "teacher")),
    db: Session = Depends(get_db),
    limit: int = Query(default=100, le=500),
):
    rows = (
        db.query(StatusLog)
        .options(joinedload(StatusLog.user), joinedload(StatusLog.room))
        .order_by(StatusLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return [dump(row, user) for row in rows]


@router.get("/rooms/{room_id}/history", response_model=list[HistoryOut])
def room_history(
    room_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = Query(default=15, le=100),
):
    rows = (
        db.query(StatusLog)
        .options(joinedload(StatusLog.user), joinedload(StatusLog.room))
        .filter(StatusLog.room_id == room_id)
        .order_by(StatusLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return [dump(row, user) for row in rows if can_view_history(user, row)]
