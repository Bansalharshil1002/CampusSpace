from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, require_roles
from app.models import ClassRecord, User
from app.schemas import ClassIn, ClassOut

router = APIRouter(prefix="/classes", tags=["classes"])

STAFF = ("cr", "teacher", "admin")


def dump(record: ClassRecord) -> ClassOut:
    created = record.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return ClassOut(
        id=record.id,
        name=record.name,
        code=record.code,
        department=record.department,
        year=record.year,
        section=record.section,
        crEmail=record.cr_email,
        room=record.room,
        students=record.students,
        createdAt=created,
    )


@router.get("", response_model=list[ClassOut])
def list_classes(
    actor: User = Depends(require_roles(*STAFF)), db: Session = Depends(get_db)
):
    del actor
    rows = db.query(ClassRecord).order_by(ClassRecord.created_at).all()
    return [dump(row) for row in rows]


@router.post("", response_model=ClassOut)
def create_class(
    payload: ClassIn,
    actor: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not any(actor.has_role(role) for role in STAFF):
        raise HTTPException(status_code=403, detail="Only CRs and teachers can add classes")
    record = ClassRecord(
        name=payload.name.strip(),
        code=payload.code.strip(),
        department=payload.department.strip(),
        year=payload.year.strip(),
        section=payload.section.strip(),
        cr_email=payload.crEmail.strip().lower(),
        room=payload.room.strip(),
        students=payload.students.strip(),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return dump(record)


@router.delete("/{record_id}")
def delete_class(
    record_id: str,
    actor: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not any(actor.has_role(role) for role in STAFF):
        raise HTTPException(status_code=403, detail="Only CRs and teachers can remove classes")
    record = db.query(ClassRecord).filter(ClassRecord.id == record_id).one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="That class could not be found")
    db.delete(record)
    db.commit()
    return {"ok": True, "id": record_id}
