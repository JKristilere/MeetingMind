from celery import Celery

from app.config import settings

celery_app = Celery(
    "meetingmind",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.workers.tasks"],
)

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
    },
    beat_schedule={},
)
