import os
from logging.config import fileConfig
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool
from alembic import context

# Load .env when running alembic locally (outside Docker).
# In Docker / Render, env vars are injected directly, so this is a no-op.
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ── Resolve the database URL ──────────────────────────────────────────────────
# Priority order:
#  1. DATABASE_URL_OVERRIDE  — full DSN, used for Neon / Supabase / any cloud
#     Postgres. Must be a sync psycopg2 URL OR the asyncpg variant (we convert).
#     Examples accepted:
#       postgresql+asyncpg://user:pass@host/db?ssl=require   <- what render.yaml sets
#       postgresql://user:pass@host/db?sslmode=require       <- pure sync form
#  2. Individual POSTGRES_* vars  — used by Docker Compose local dev.

_override = os.environ.get("DATABASE_URL_OVERRIDE", "").strip()

if _override:
    # Convert the asyncpg async URL to a plain psycopg2 sync URL for Alembic.
    db_url = (
        _override
        .replace("postgresql+asyncpg://", "postgresql://")
        .replace("?ssl=require", "?sslmode=require")
    )
else:
    db_url = (
        f"postgresql://{os.environ.get('POSTGRES_USER', 'meetingmind')}:"
        f"{os.environ.get('POSTGRES_PASSWORD', 'admin123')}@"
        f"{os.environ.get('POSTGRES_HOST', 'postgres')}:"
        f"{os.environ.get('POSTGRES_PORT', '5432')}/"
        f"{os.environ.get('POSTGRES_DB', 'meetingmind')}"
    )

config.set_main_option("sqlalchemy.url", db_url)

# Import all models so Alembic can detect schema changes
from app.database import Base
from app.models import *  # noqa: F401, F403

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
