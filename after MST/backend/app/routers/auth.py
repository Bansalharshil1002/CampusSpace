from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.emailer import send_email
from app.models import EmailChallenge, User, UserRole, utcnow
from app.rate_limit import enforce_auth_rate_limit
from app.schemas import (
    ChallengeOut,
    LoginIn,
    MagicVerifyIn,
    OtpRequestIn,
    OtpVerifyIn,
    PasswordChangeIn,
    ProfileUpdateIn,
    RegisterIn,
    ResetPasswordIn,
    ResetRequestIn,
    TokenOut,
    UserOut,
)
from app.security import (
    college_email,
    create_access_token,
    hash_secret,
    is_college_email,
    random_otp,
    random_token,
    verify_secret,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def challenge_alive(value: datetime) -> bool:
    """SQLite returns naive datetimes, so normalise before comparing to UTC."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value >= utcnow()


def user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        name=user.name,
        email=user.email,
        active=user.active,
        created_at=user.created_at,
        roles=user.roles,
    )


def load_with_roles(db: Session, user_id: str) -> User:
    return db.query(User).options(joinedload(User.role_rows), joinedload(User.assignments)).filter(User.id == user_id).one()


def token_for(db: Session, user: User) -> TokenOut:
    fresh = load_with_roles(db, user.id)
    return TokenOut(access_token=create_access_token(fresh.id), user=user_out(fresh))


def require_college(email: str) -> str:
    clean = college_email(email)
    if not is_college_email(clean):
        raise HTTPException(
            status_code=400,
            detail=f"Only @{settings.allowed_email_domain} college email addresses can sign in",
        )
    return clean


def require_email_auth() -> None:
    if not settings.allow_email_auth or settings.email_backend == "disabled":
        raise HTTPException(
            status_code=503,
            detail="Email sign-in is not available in this controlled demo. Use your password.",
        )


def dev_details_enabled() -> bool:
    return settings.email_backend == "console" and settings.allow_dev_auth


def create_user(db: Session, email: str, name: str, password: str | None) -> User:
    existing = db.query(User).filter(User.email == email).one_or_none()
    if existing:
        # A DoAA/DoSAA can pre-assign a role to an email. That placeholder has
        # no password yet, so the first registration claims it and keeps the role.
        if password and existing.password_hash is None:
            existing.name = name.strip() or existing.name
            existing.password_hash = hash_secret(password)
            existing.active = True
            db.commit()
            db.refresh(existing)
            return existing
        raise HTTPException(status_code=400, detail="That email already has an account. Use the Sign in tab instead.")
    user = User(
        email=email,
        name=name.strip() or email.split("@")[0],
        password_hash=hash_secret(password) if password else None,
        active=True,
    )
    db.add(user)
    db.flush()
    # Admin is never granted by registration. Controlled deployments create the
    # first admin explicitly with `python -m app.bootstrap`.
    db.add(UserRole(user_id=user.id, role="student"))
    db.commit()
    db.refresh(user)
    return user


def issue_challenge(db: Session, email: str, purpose: str, secret: str, hours: float) -> EmailChallenge:
    row = EmailChallenge(
        email=email,
        purpose=purpose,
        secret_hash=hash_secret(secret),
        expires_at=utcnow() + timedelta(hours=hours),
        consumed=False,
    )
    db.add(row)
    db.commit()
    return row


@router.post("/register", response_model=TokenOut)
def register(
    body: RegisterIn,
    db: Session = Depends(get_db),
    _rate_limit: None = Depends(enforce_auth_rate_limit),
):
    if not settings.allow_public_registration:
        raise HTTPException(
            status_code=403,
            detail="Public registration is disabled in this controlled demo. Ask the administrator for an account.",
        )
    email = require_college(body.email)
    user = create_user(db, email, body.name, body.password)
    return token_for(db, user)


@router.post("/login", response_model=TokenOut)
def login(
    body: LoginIn,
    db: Session = Depends(get_db),
    _rate_limit: None = Depends(enforce_auth_rate_limit),
):
    email = require_college(body.email)
    user = db.query(User).filter(User.email == email).one_or_none()
    if user is None or not user.active or not verify_secret(body.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Wrong email or password.")
    return token_for(db, user)


@router.post("/otp/request", response_model=ChallengeOut)
def request_otp(
    body: OtpRequestIn,
    db: Session = Depends(get_db),
    _rate_limit: None = Depends(enforce_auth_rate_limit),
):
    require_email_auth()
    email = require_college(body.email)
    user = db.query(User).filter(User.email == email, User.active.is_(True)).one_or_none()
    if user is None:
        user = create_user(db, email, email.split("@")[0], None)
    code = random_otp()
    issue_challenge(db, email, "otp_login", code, hours=0.25)
    send_email(
        email,
        "Your Room Status Tracker sign-in code",
        f"Your one-time code is {code}. It expires in 15 minutes.",
    )
    dev = code if dev_details_enabled() else None
    return ChallengeOut(message="If that email can sign in, a code has been sent.", dev_code=dev)


@router.post("/otp/verify", response_model=TokenOut)
def verify_otp(
    body: OtpVerifyIn,
    db: Session = Depends(get_db),
    _rate_limit: None = Depends(enforce_auth_rate_limit),
):
    require_email_auth()
    email = require_college(body.email)
    row = (
        db.query(EmailChallenge)
        .filter(
            EmailChallenge.email == email,
            EmailChallenge.purpose == "otp_login",
            EmailChallenge.consumed.is_(False),
        )
        .order_by(EmailChallenge.created_at.desc())
        .first()
    )
    if row is None or not challenge_alive(row.expires_at) or not verify_secret(body.code, row.secret_hash):
        raise HTTPException(status_code=400, detail="That code is invalid or has expired.")
    row.consumed = True
    user = db.query(User).filter(User.email == email).one_or_none()
    if user is None or not user.active:
        raise HTTPException(status_code=400, detail="No active user with that email.")
    db.commit()
    return token_for(db, user)


@router.post("/magic/request", response_model=ChallengeOut)
def request_magic(
    body: OtpRequestIn,
    db: Session = Depends(get_db),
    _rate_limit: None = Depends(enforce_auth_rate_limit),
):
    require_email_auth()
    email = require_college(body.email)
    user = db.query(User).filter(User.email == email, User.active.is_(True)).one_or_none()
    if user is None:
        user = create_user(db, email, email.split("@")[0], None)
    token = random_token()
    issue_challenge(db, email, "magic", token, hours=1)
    url = f"{settings.frontend_url}/auth?magic={token}&email={email}"
    send_email(email, "Sign in to Room Status Tracker", f"Open this link to sign in:\n{url}")
    dev = token if dev_details_enabled() else None
    return ChallengeOut(message="If that email can sign in, a magic link has been sent.", dev_token=dev, magic_url=url if dev else None)


@router.post("/magic/verify", response_model=TokenOut)
def verify_magic(
    body: MagicVerifyIn,
    db: Session = Depends(get_db),
    _rate_limit: None = Depends(enforce_auth_rate_limit),
):
    require_email_auth()
    row = (
        db.query(EmailChallenge)
        .filter(EmailChallenge.purpose == "magic", EmailChallenge.consumed.is_(False))
        .order_by(EmailChallenge.created_at.desc())
        .all()
    )
    match = next((item for item in row if verify_secret(body.token, item.secret_hash) and challenge_alive(item.expires_at)), None)
    if match is None:
        raise HTTPException(status_code=400, detail="That sign-in link is invalid or has expired.")
    match.consumed = True
    user = db.query(User).filter(User.email == match.email).one_or_none()
    if user is None or not user.active:
        raise HTTPException(status_code=400, detail="No active user with that email.")
    db.commit()
    return token_for(db, user)


@router.post("/forgot-password", response_model=ChallengeOut)
def forgot_password(
    body: ResetRequestIn,
    db: Session = Depends(get_db),
    _rate_limit: None = Depends(enforce_auth_rate_limit),
):
    require_email_auth()
    email = require_college(body.email)
    user = db.query(User).filter(User.email == email, User.active.is_(True)).one_or_none()
    token = random_token()
    if user:
        issue_challenge(db, email, "password_reset", token, hours=2)
        url = f"{settings.frontend_url}/auth?reset={token}&email={email}"
        send_email(email, "Reset your Room Status Tracker password", f"Reset token: {token}\nOpen: {url}")
    dev = token if user and dev_details_enabled() else None
    return ChallengeOut(message="If that account exists, a reset email has been sent.", dev_token=dev)


@router.post("/reset-password")
def reset_password(
    body: ResetPasswordIn,
    db: Session = Depends(get_db),
    _rate_limit: None = Depends(enforce_auth_rate_limit),
):
    require_email_auth()
    email = require_college(body.email)
    rows = (
        db.query(EmailChallenge)
        .filter(
            EmailChallenge.email == email,
            EmailChallenge.purpose == "password_reset",
            EmailChallenge.consumed.is_(False),
        )
        .all()
    )
    match = next((item for item in rows if verify_secret(body.token, item.secret_hash) and challenge_alive(item.expires_at)), None)
    if match is None:
        raise HTTPException(status_code=400, detail="That reset link is invalid or has expired.")
    user = db.query(User).filter(User.email == email).one_or_none()
    if user is None:
        raise HTTPException(status_code=400, detail="No active user with that email.")
    match.consumed = True
    user.password_hash = hash_secret(body.password)
    db.commit()
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user_out(user)


@router.patch("/me", response_model=UserOut)
def update_me(body: ProfileUpdateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.name = body.name.strip()
    db.commit()
    db.refresh(user)
    return user_out(user)


@router.post("/change-password")
def change_password(body: PasswordChangeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.password_hash = hash_secret(body.password)
    db.commit()
    return {"ok": True}
