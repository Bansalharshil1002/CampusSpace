from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import ChatMessage, User
from app.permissions import (
    can_clear_chat_channel,
    can_use_chat_channel,
    deny,
    primary_role,
)
from app.schemas import ChatChannelOut, ChatMessageIn, ChatMessageOut

router = APIRouter(prefix="/chat", tags=["chat"])

MAX_MESSAGES = 250


def dump(message: ChatMessage) -> ChatMessageOut:
    sent = message.at
    if sent.tzinfo is None:
        sent = sent.replace(tzinfo=timezone.utc)
    return ChatMessageOut(
        id=message.id,
        channel=message.channel,
        senderId=message.sender_id or "",
        senderName=message.sender_name,
        senderRole=message.sender_role,
        body=message.body,
        at=sent,
        kind=message.kind,
    )


@router.get("/messages", response_model=list[ChatMessageOut])
def list_messages(
    channel: str = Query(min_length=1, max_length=255),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not can_use_chat_channel(user, channel, db):
        deny("You are not allowed to read this conversation")
    rows = (
        db.query(ChatMessage)
        .filter(ChatMessage.channel == channel)
        .order_by(ChatMessage.at.desc())
        .limit(MAX_MESSAGES)
        .all()
    )
    return [dump(row) for row in reversed(rows)]


@router.post("/messages", response_model=ChatMessageOut)
def post_message(
    payload: ChatMessageIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not can_use_chat_channel(user, payload.channel, db):
        deny("You are not allowed to post in this conversation")
    if payload.kind != "user":
        raise HTTPException(status_code=400, detail="Only normal messages can be posted")

    message = ChatMessage(
        channel=payload.channel,
        sender_id=user.id,
        sender_name=user.name.strip() or user.email,
        sender_role=primary_role(user),
        body=payload.body.strip(),
        kind="user",
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return dump(message)


@router.delete("/messages", response_model=ChatChannelOut)
def clear_messages(
    channel: str = Query(min_length=1, max_length=255),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not can_clear_chat_channel(user, channel, db):
        deny("You are not allowed to clear this conversation")
    removed = db.query(ChatMessage).filter(ChatMessage.channel == channel).delete(
        synchronize_session=False
    )
    db.commit()
    return ChatChannelOut(channel=channel, cleared=removed)
