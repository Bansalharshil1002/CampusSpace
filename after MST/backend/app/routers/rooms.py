from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, get_stream_user, require_roles
from app.events import subscribe
from app.models import ROOM_STATUSES, ROOM_TYPES, Room, User
from app.permissions import can_update_room, set_room_status
from app.schemas import RoomCreateIn, RoomOut, RoomPatchIn, StatusUpdateIn
from app.seed import SEED_ROOMS

router = APIRouter(prefix="/rooms", tags=["rooms"])


def dump_room(room: Room) -> RoomOut:
    return RoomOut.model_validate(room)


@router.get("", response_model=list[RoomOut])
def list_rooms(
    active: bool | None = Query(default=None),
    building: str | None = Query(default=None),
    room_type: str | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    del user
    query = db.query(Room).order_by(Room.building, Room.code)
    if active is not None:
        query = query.filter(Room.active.is_(active))
    if building:
        query = query.filter(Room.building == building)
    if room_type:
        if room_type not in ROOM_TYPES:
            raise HTTPException(status_code=400, detail="Unknown room type")
        query = query.filter(Room.room_type == room_type)
    return [dump_room(room) for room in query.all()]


@router.get("/meta")
def room_meta(user: User = Depends(get_current_user)) -> dict:
    del user
    return {
        "room_types": list(ROOM_TYPES),
        "statuses": list(ROOM_STATUSES),
        "classroom_statuses": ["ONGOING", "NOT_ARRIVED", "CANCELLED", "CHANGED", "FREE"],
        "activity_statuses": ["FREE", "OCCUPIED"],
    }


@router.get("/stream")
async def stream_rooms(user: User = Depends(get_stream_user)):
    del user

    async def events():
        yield "event: ready\ndata: {}\n\n"
        async for payload in subscribe():
            yield f"event: room.status\ndata: {payload}\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@router.get("/updatable", response_model=list[str])
def updatable_ids(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rooms = db.query(Room).filter(Room.active.is_(True)).all()
    return [room.id for room in rooms if can_update_room(user, room)]


@router.get("/{room_id}", response_model=RoomOut)
def get_room(room_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    del user
    room = db.query(Room).filter(Room.id == room_id).one_or_none()
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    return dump_room(room)


@router.get("/{room_id}/can-update")
def check_can_update(room_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    room = db.query(Room).filter(Room.id == room_id).one_or_none()
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    return {"allowed": can_update_room(user, room)}


@router.post("/{room_id}/status", response_model=RoomOut)
def update_status(
    room_id: str,
    body: StatusUpdateIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.status not in ROOM_STATUSES:
        raise HTTPException(status_code=400, detail="Unknown status")
    room = db.query(Room).filter(Room.id == room_id).one_or_none()
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    return dump_room(set_room_status(db, user, room, body.status, body.note))


@router.post("", response_model=RoomOut)
def create_room(
    body: RoomCreateIn,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    del user
    if body.room_type not in ROOM_TYPES:
        raise HTTPException(status_code=400, detail="Unknown room type")
    if db.query(Room).filter(Room.code == body.code.strip()).one_or_none():
        raise HTTPException(status_code=400, detail="A room with that code already exists")
    room = Room(
        code=body.code.strip(),
        building=body.building.strip(),
        floor=body.floor,
        capacity=body.capacity,
        room_type=body.room_type,
        current_status="FREE",
    )
    db.add(room)
    db.commit()
    db.refresh(room)
    return dump_room(room)


@router.post("/seed")
def seed_missing(
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    del user
    existing = {room.code.upper().replace("-", "").replace(" ", "") for room in db.query(Room).all()}
    added = 0
    for code, building, floor, capacity, room_type in SEED_ROOMS:
        key = code.upper().replace("-", "").replace(" ", "")
        if key in existing:
            continue
        db.add(Room(code=code, building=building, floor=floor, capacity=capacity, room_type=room_type))
        added += 1
    db.commit()
    return {"added": added}


@router.patch("/{room_id}", response_model=RoomOut)
def patch_room(
    room_id: str,
    body: RoomPatchIn,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    del user
    room = db.query(Room).filter(Room.id == room_id).one_or_none()
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    if body.code is not None:
        room.code = body.code.strip()
    if body.building is not None:
        room.building = body.building.strip()
    if body.floor is not None:
        room.floor = body.floor
    if body.capacity is not None:
        room.capacity = body.capacity
    if body.room_type is not None:
        if body.room_type not in ROOM_TYPES:
            raise HTTPException(status_code=400, detail="Unknown room type")
        room.room_type = body.room_type
    if body.active is not None:
        room.active = body.active
    db.commit()
    db.refresh(room)
    return dump_room(room)
