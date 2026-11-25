from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import TimetableEntry, User
from app.permissions import (
    can_edit_timetable_entry,
    can_replace_timetable,
    deny,
    timetable_scope,
)
from app.schemas import (
    TimetableEntryOut,
    TimetableEntryPatchIn,
    TimetableOut,
    TimetableReplaceIn,
)
from app.seed import SEED_TIMETABLE

router = APIRouter(prefix="/timetable", tags=["timetable"])


def dump_entry(entry: TimetableEntry) -> TimetableEntryOut:
    return TimetableEntryOut(
        id=entry.id,
        day=entry.day,
        start=entry.start,
        end=entry.end,
        subject=entry.subject,
        room=entry.room,
        className=entry.class_name,
        teacher=entry.teacher,
    )


def effective_window(db: Session, user: User) -> tuple[list[TimetableEntry], str]:
    """Personal entries win; an empty personal plan falls back to the campus plan."""
    if timetable_scope(user) == "personal":
        personal = (
            db.query(TimetableEntry)
            .filter(TimetableEntry.owner_id == user.id)
            .order_by(TimetableEntry.day, TimetableEntry.start)
            .all()
        )
        if personal:
            return personal, "personal"
    campus = (
        db.query(TimetableEntry)
        .filter(TimetableEntry.owner_id.is_(None))
        .order_by(TimetableEntry.day, TimetableEntry.start)
        .all()
    )
    return campus, "campus"


def replace_window(db: Session, user: User, entries: TimetableReplaceIn) -> tuple[list[TimetableEntry], str]:
    owner_id = None if timetable_scope(user) == "campus" else user.id
    db.query(TimetableEntry).filter(TimetableEntry.owner_id == owner_id).delete(
        synchronize_session=False
    )
    for item in entries.entries:
        db.add(
            TimetableEntry(
                owner_id=owner_id,
                day=item.day,
                start=item.start,
                end=item.end,
                subject=item.subject.strip(),
                room=item.room.strip(),
                class_name=item.className.strip(),
                teacher=item.teacher.strip(),
            )
        )
    db.commit()
    return effective_window(db, user)


def seed_campus(db: Session) -> None:
    db.query(TimetableEntry).filter(TimetableEntry.owner_id.is_(None)).delete(
        synchronize_session=False
    )
    for item in SEED_TIMETABLE:
        db.add(TimetableEntry(owner_id=None, **item))
    db.commit()


@router.get("", response_model=TimetableOut)
def get_timetable(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    entries, scope = effective_window(db, user)
    return TimetableOut(entries=[dump_entry(entry) for entry in entries], scope=scope)


@router.put("", response_model=TimetableOut)
def put_timetable(
    payload: TimetableReplaceIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not can_replace_timetable(user):
        deny("Your role can move or cancel classes but cannot replace the timetable")
    entries, scope = replace_window(db, user, payload)
    return TimetableOut(entries=[dump_entry(entry) for entry in entries], scope=scope)


@router.patch("/{entry_id}", response_model=TimetableEntryOut)
def patch_timetable_entry(
    entry_id: str,
    payload: TimetableEntryPatchIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = db.query(TimetableEntry).filter(TimetableEntry.id == entry_id).one_or_none()
    if entry is None:
        raise HTTPException(status_code=404, detail="That class could not be found")
    if not can_edit_timetable_entry(user, entry):
        deny("You are not allowed to change this class")

    patch = payload.model_dump(exclude_unset=True)
    for key, value in patch.items():
        column = "class_name" if key == "className" else key
        if isinstance(value, str):
            value = value.strip()
        setattr(entry, column, value)
    db.commit()
    db.refresh(entry)
    return dump_entry(entry)


@router.delete("/{entry_id}")
def delete_timetable_entry(
    entry_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = db.query(TimetableEntry).filter(TimetableEntry.id == entry_id).one_or_none()
    if entry is None:
        raise HTTPException(status_code=404, detail="That class could not be found")
    if not can_edit_timetable_entry(user, entry):
        deny("You are not allowed to change this class")
    db.delete(entry)
    db.commit()
    return {"ok": True, "id": entry_id}


@router.post("/restore", response_model=TimetableOut)
def restore_timetable(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if timetable_scope(user) == "personal":
        db.query(TimetableEntry).filter(TimetableEntry.owner_id == user.id).delete(
            synchronize_session=False
        )
        db.commit()
    else:
        if not (user.has_role("teacher") or user.has_role("admin")):
            deny("Your role can move or cancel classes but cannot restore the timetable")
        seed_campus(db)
    entries, scope = effective_window(db, user)
    return TimetableOut(entries=[dump_entry(entry) for entry in entries], scope=scope)
