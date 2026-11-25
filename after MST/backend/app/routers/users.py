from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.deps import require_roles
from app.models import ROLES, User, UserRole
from app.schemas import RoleAssignIn, RoleToggleIn, UserOut
from app.security import college_email, is_college_email

router = APIRouter(prefix="/users", tags=["users"])

STAFF = {"cr", "society_rep", "teacher", "admin"}


def dump(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        name=user.name,
        email=user.email,
        active=user.active,
        created_at=user.created_at,
        roles=user.roles,
    )


def load_user(db: Session, user_id: str) -> User:
    return (
        db.query(User)
        .options(joinedload(User.role_rows))
        .filter(User.id == user_id)
        .one()
    )


@router.get("", response_model=list[UserOut])
def list_users(actor: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    del actor
    rows = db.query(User).options(joinedload(User.role_rows)).order_by(User.created_at).all()
    return [dump(user) for user in rows]


@router.get("/staff", response_model=list[UserOut])
def list_staff(actor: User = Depends(require_roles("admin", "teacher")), db: Session = Depends(get_db)):
    del actor
    rows = db.query(User).options(joinedload(User.role_rows)).order_by(User.name).all()
    return [dump(user) for user in rows if STAFF.intersection(user.roles)]


@router.post("/assign-role", response_model=UserOut)
def assign_role(
    body: RoleAssignIn,
    actor: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    """Give an email a role, creating an unclaimed account if it has never signed in.

    A placeholder account has no password, so the owner still has to register or
    use an OTP/magic link. Registering with the same email keeps the assigned role.
    """
    del actor
    if body.role not in ROLES:
        raise HTTPException(status_code=400, detail="Unknown role")

    email = college_email(body.email)
    if not is_college_email(email):
        raise HTTPException(
            status_code=400,
            detail="Only @thapar.edu college email addresses can be assigned a role",
        )

    user = (
        db.query(User)
        .options(joinedload(User.role_rows))
        .filter(User.email == email)
        .one_or_none()
    )
    if user is None:
        user = User(
            email=email,
            name=body.name.strip() or email.split("@")[0],
            password_hash=None,
            active=True,
        )
        db.add(user)
        db.flush()
    elif not user.active:
        raise HTTPException(status_code=400, detail="That account is deactivated")

    wanted = {"student", body.role} if body.role != "student" else {"student"}
    existing = {row.role for row in user.role_rows}
    for role in sorted(wanted - existing):
        db.add(UserRole(user_id=user.id, role=role))
    if body.name.strip():
        user.name = body.name.strip()
    db.commit()
    return dump(load_user(db, user.id))


@router.post("/{user_id}/roles", response_model=UserOut)
def toggle_role(
    user_id: str,
    body: RoleToggleIn,
    actor: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    if body.role not in ROLES:
        raise HTTPException(status_code=400, detail="Unknown role")
    user = db.query(User).options(joinedload(User.role_rows)).filter(User.id == user_id).one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if not body.on and user_id == actor.id and body.role == "admin":
        raise HTTPException(status_code=400, detail="You can't remove your own admin role")
    row = db.query(UserRole).filter(UserRole.user_id == user_id, UserRole.role == body.role).one_or_none()
    if body.on and row is None:
        db.add(UserRole(user_id=user_id, role=body.role))
    if not body.on and row is not None:
        db.delete(row)
    db.commit()
    return dump(load_user(db, user.id))
