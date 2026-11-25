from datetime import timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import (
    ANNOUNCEMENT_AUDIENCES,
    ANNOUNCEMENT_CATEGORIES,
    ANNOUNCEMENT_SOURCES,
    Announcement,
    User,
)
from app.permissions import (
    announcement_audiences,
    can_publish_announcements,
    deny,
    primary_role,
)
from app.schemas import AnnouncementIn, AnnouncementOut

router = APIRouter(prefix="/announcements", tags=["announcements"])


def dump(item: Announcement) -> AnnouncementOut:
    created = item.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return AnnouncementOut(
        id=item.id,
        title=item.title,
        body=item.body,
        category=item.category,
        audience=item.audience,
        authorName=item.author_name,
        authorRole=item.author_role,
        authorEmail=item.author_email,
        createdAt=created,
        room=item.room,
        className=item.class_name,
        pinned=item.pinned,
        source=item.source,
    )


@router.get("", response_model=list[AnnouncementOut])
def list_announcements(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    allowed = announcement_audiences(user)
    rows = (
        db.query(Announcement)
        .filter(Announcement.audience.in_(allowed))
        .order_by(Announcement.pinned.desc(), Announcement.created_at.desc())
        .all()
    )
    return [dump(row) for row in rows]


@router.post("", response_model=AnnouncementOut)
def create_announcement(
    payload: AnnouncementIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not can_publish_announcements(user):
        deny("Only CRs, teachers and the DoAA/DoSAA office can post announcements")
    if payload.category not in ANNOUNCEMENT_CATEGORIES:
        deny("Unknown announcement type", 400)
    if payload.audience not in ANNOUNCEMENT_AUDIENCES:
        deny("Unknown audience", 400)
    source = payload.source if payload.source in ANNOUNCEMENT_SOURCES else "manual"

    item = Announcement(
        title=payload.title.strip(),
        body=payload.body.strip(),
        category=payload.category,
        audience=payload.audience,
        author_name=user.name.strip() or user.email,
        author_role=primary_role(user),
        author_email=user.email,
        room=(payload.room or "").strip() or None,
        class_name=(payload.className or "").strip() or None,
        pinned=payload.pinned,
        source=source,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return dump(item)
