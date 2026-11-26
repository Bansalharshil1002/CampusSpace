from pydantic_settings import BaseSettings, SettingsConfigDict


def _normalise_database_url(url: str) -> str:
    """Render/Neon often provide ``postgres://``; SQLAlchemy needs a driver."""
    if url.startswith("postgres://"):
        return "postgresql+psycopg2://" + url[len("postgres://") :]
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    database_url: str = "sqlite:///./room_status.db"
    jwt_secret: str = "dev-only-change-me"
    jwt_expire_minutes: int = 60 * 24 * 7
    allowed_email_domain: str = "thapar.edu"
    frontend_url: str = "http://localhost:8080"
    cors_origins: str = (
        "http://localhost:8080,http://127.0.0.1:8080,"
        "http://localhost:8081,http://127.0.0.1:8081,"
        "http://localhost:5173,http://127.0.0.1:5173"
    )

    # Local development defaults. The controlled demo sets all of these to
    # false/true explicitly through environment variables.
    allow_public_registration: bool = True
    allow_email_auth: bool = True
    allow_dev_auth: bool = True
    allow_password_reset: bool = True
    email_backend: str = "console"
    resend_api_key: str = ""
    email_from: str = "Room Status Tracker <noreply@thapar.edu>"
    seed_demo_users: bool = True
    auth_rate_limit_per_minute: int = 20

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() in {"production", "prod", "live"}

    @property
    def sqlalchemy_url(self) -> str:
        return _normalise_database_url(self.database_url)

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    def validate_runtime_config(self) -> None:
        """Fail fast if a public deployment still uses development auth defaults."""
        if not self.is_production:
            return

        problems: list[str] = []
        if self.jwt_secret == "dev-only-change-me" or len(self.jwt_secret) < 32:
            problems.append("JWT_SECRET must be a random string of at least 32 characters")
        if self.seed_demo_users:
            problems.append("SEED_DEMO_USERS must be false in production")
        if self.allow_public_registration:
            problems.append("ALLOW_PUBLIC_REGISTRATION must be false in the controlled demo")
        if self.email_backend == "console" and self.allow_dev_auth:
            problems.append("EMAIL_BACKEND=console must not be used with ALLOW_DEV_AUTH=true")
        if self.email_backend == "disabled" and self.allow_email_auth:
            problems.append("ALLOW_EMAIL_AUTH must be false when EMAIL_BACKEND=disabled")
        origins = [origin.lower() for origin in self.cors_origin_list]
        if not origins or "*" in origins:
            problems.append("CORS_ORIGINS must list the exact production frontend origin")
        if any("localhost" in origin or "127.0.0.1" in origin for origin in origins):
            problems.append("CORS_ORIGINS must not contain localhost addresses")
        if "localhost" in self.frontend_url.lower() or "127.0.0.1" in self.frontend_url:
            problems.append("FRONTEND_URL must be the production frontend URL")

        if problems:
            raise RuntimeError(
                "Unsafe production configuration:\n- " + "\n- ".join(problems)
            )


settings = Settings()
