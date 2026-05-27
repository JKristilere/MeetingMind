from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(
    settings.database_url,
    # Smaller pool for free-tier hosts (Neon, Render 512 MB) — avoids hitting
    # the max_connections limit on shared cloud PostgreSQL instances.
    pool_size=5 if settings.app_env == "production" else 20,
    max_overflow=5 if settings.app_env == "production" else 10,
    pool_pre_ping=True,
    echo=settings.app_env == "development",
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


from typing import AsyncGenerator, Any
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
