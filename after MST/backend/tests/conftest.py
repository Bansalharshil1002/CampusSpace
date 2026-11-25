import os
import tempfile
from pathlib import Path

_fd, _path = tempfile.mkstemp(suffix=".db")
os.close(_fd)
os.environ["DATABASE_URL"] = "sqlite:///" + Path(_path).as_posix()
os.environ["SEED_DEMO_USERS"] = "true"
os.environ["JWT_SECRET"] = "test-secret"
os.environ["EMAIL_BACKEND"] = "console"

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.seed import seed_if_empty  # noqa: E402

Base.metadata.create_all(bind=engine)
_db = SessionLocal()
try:
    seed_if_empty(_db)
finally:
    _db.close()
