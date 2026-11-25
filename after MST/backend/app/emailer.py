from app.config import settings


def send_email(to: str, subject: str, body: str) -> None:
    if settings.email_backend == "disabled":
        return
    if settings.email_backend == "resend" and settings.resend_api_key:
        import httpx

        httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={
                "from": settings.email_from,
                "to": [to],
                "subject": subject,
                "text": body,
            },
            timeout=15,
        ).raise_for_status()
        return
    import sys

    text = f"\n[email -> {to}] {subject}\n{body}\n"
    # Windows consoles often use cp1252, which cannot print every character a
    # reset link or subject may contain. Replace what the console can't show
    # instead of crashing the auth endpoint.
    encoding = getattr(sys.stdout, "encoding", None) or "utf-8"
    try:
        text = text.encode(encoding, "replace").decode(encoding)
    except LookupError:
        text = text.encode("ascii", "replace").decode("ascii")
    print(text)
