import ssl

from celery import Celery

from app.config import settings

celery_app = Celery(
    "meetingmind",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.workers.tasks"],
)

_ssl_config = {"ssl_cert_reqs": ssl.CERT_NONE}
_uses_ssl = settings.celery_broker_url.startswith("rediss://")

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Africa/Lagos",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_routes={
        "app.workers.tasks.process_meeting_task": {"queue": "processing"},
        "app.workers.tasks.send_notifications_task": {"queue": "notifications"},
        "app.workers.tasks.send_test_mail_task": {"queue": "notifications"},
        "app.workers.tasks.send_test_whatsapp_task": {"queue": "notifications"},
    },
    beat_schedule={},
    **({"broker_use_ssl": _ssl_config, "redis_backend_use_ssl": _ssl_config} if _uses_ssl else {}),
)
