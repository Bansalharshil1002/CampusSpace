from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.deps import get_current_user, require_roles
from app.models import Room, RoomAssignment, User
from app.permissions import assign_room, can_toggle_assignment
from app.schemas import AssignmentCreateIn, AssignmentOut, AssignmentPatchIn

router = APIRouter(prefix="/assignments", tags=["assignments"])


def dump(row: RoomAssignment) -> AssignmentOut:
    person = row.user
    room = row.room
    return AssignmentOut(
        id=row.id,
        active=row.active,
        created_at=row.created_at,
        room_id=row.room_id,
        user_id=row.user_id,
        rooms={"code": room.code if room else None, "room_type": room.room_type if room else None},
        user={"name": person.name if person else None, "email": person.email if person else None},
    )


@router.get("", response_model=list[AssignmentOut])
def list_assignments(
    user: User = Depends(require_roles("admin", "teacher")),
    db: Session = Depends(get_db),
):
    del user
    rows = (
        db.query(RoomAssignment)
        .options(joinedload(RoomAssignment.user), joinedload(RoomAssignment.room))
        .order_by(RoomAssignment.created_at.desc())
        .all()
    )
    return [dump(row) for row in rows]


@router.post("", response_model=AssignmentOut)
def create_assignment(
    body: AssignmentCreateIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = db.query(Room).filter(Room.id == body.room_id).one_or_none()
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    row = assign_room(db, user, str(body.email), room)
    row = (
        db.query(RoomAssignment)
        .options(joinedload(RoomAssignment.user), joinedload(RoomAssignment.room))
        .filter(RoomAssignment.id == row.id)
        .one()
    )
    return dump(row)


@router.patch("/{assignment_id}", response_model=AssignmentOut)
def patch_assignment(
    assignment_id: str,
    body: AssignmentPatchIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = (
        db.query(RoomAssignment)
        .options(joinedload(RoomAssignment.user), joinedload(RoomAssignment.room))
        .filter(RoomAssignment.id == assignment_id)
        .one_or_none()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if not can_toggle_assignment(user, row.room):
        raise HTTPException(status_code=403, detail="You are not allowed to change this assignment")
    row.active = body.active
    db.commit()
    db.refresh(row)
    return dump(row)
