import structlog
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.config import settings
from app.database import engine
from app.models import *  # noqa: F401,F403 — ensure all models are registered

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("meetingmind.startup", env=settings.app_env)
    yield
    await engine.dispose()
    log.info("meetingmind.shutdown")


app = FastAPI(
    title="MeetingMind API",
    description="AI Meeting Intelligence for African SMBs",
    version="1.0.0",
    docs_url="/docs" if settings.app_env != "production" else None,
    redoc_url="/redoc" if settings.app_env != "production" else None,
    lifespan=lifespan,
)

_cors_origins: list[str] = [
    settings.app_frontend_url,
    "http://localhost:5173",
    "http://localhost:3000",
    *settings.cors_extra_origins,
]
# "credentials" (cookies) cannot be sent to a wildcard origin — use Bearer tokens instead
_allow_credentials = "*" not in _cors_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health", tags=["health"])
async def health_check():
    return {"status": "ok", "version": "1.0.0"}


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    log.error("unhandled_exception", path=str(request.url), error=str(exc), exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
