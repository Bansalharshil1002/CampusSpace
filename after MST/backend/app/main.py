from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import Base, SessionLocal, engine
from app.routers import (
    announcements,
    assignments,
    auth,
    chat,
    classes,
    history,
    rooms,
    timetable,
    users,
)
from app.seed import seed_if_empty

settings.validate_runtime_config()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_if_empty(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="Room Status Tracker API",
    version="1.0.0",
    description="Authoritative backend for rooms, assignments, status updates and college-email auth.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(rooms.router)
app.include_router(assignments.router)
app.include_router(history.router)
app.include_router(users.router)
app.include_router(timetable.router)
app.include_router(announcements.router)
app.include_router(classes.router)
app.include_router(chat.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
