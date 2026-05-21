"""
Notification service — WhatsApp via Twilio + Email via Resend (prod) or SMTP (dev).

Email provider is selected by EMAIL_PROVIDER env var:
  - "resend"  → Resend REST API (no SMTP, delivery tracking, production-ready)
  - "smtp"    → Direct SMTP, works with Mailpit locally or any SMTP relay

WhatsApp remains the primary channel for Nigerian business users.
"""
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import structlog

from app.config import settings

log = structlog.get_logger()


# ── WhatsApp ──────────────────────────────────────────────────────────────────

class WhatsAppNotificationService:
    def send_action_items(
        self,
        to_number: str,
        meeting_title: str,
        summary: str,
        action_items: list[dict],
        recipient_name: str = "",
    ) -> bool:
        if not settings.enable_whatsapp_notifications:
            return False
        if not all([settings.twilio_account_sid, settings.twilio_auth_token]):
            log.warning("whatsapp.skipped", reason="Twilio credentials not configured")
            return False

        from twilio.rest import Client
        client = Client(settings.twilio_account_sid, settings.twilio_auth_token)

        greeting = f"Hi {recipient_name}! 👋" if recipient_name else "Hello!"
        items_text = "\n".join(
            f"  {i+1}. *{item['title']}*"
            + (f" — Due: {item.get('due_date', 'TBD')}" if item.get("due_date") else "")
            for i, item in enumerate(action_items[:10])
        )

        message = (
            f"{greeting}\n\n"
            f"📋 *Meeting Summary: {meeting_title}*\n\n"
            f"{summary}\n\n"
            f"✅ *Action Items:*\n{items_text or 'No action items recorded.'}\n\n"
            f"_Powered by MeetingMind_ 🚀"
        )

        try:
            client.messages.create(
                body=message,
                from_=settings.twilio_whatsapp_from,
                to=f"whatsapp:{to_number}",
            )
            return True
        except Exception as e:
            log.error("whatsapp.send_failed", error=str(e), to=to_number)
            return False

    def send_meeting_complete(self, to_number: str, meeting_title: str, meeting_url: str) -> bool:
        if not settings.enable_whatsapp_notifications:
            return False

        from twilio.rest import Client
        client = Client(settings.twilio_account_sid, settings.twilio_auth_token)

        try:
            client.messages.create(
                body=(
                    f"✅ Your meeting *{meeting_title}* has been processed!\n\n"
                    f"View full summary and action items:\n{meeting_url}"
                ),
                from_=settings.twilio_whatsapp_from,
                to=f"whatsapp:{to_number}",
            )
            return True
        except Exception as e:
            log.error("whatsapp.send_failed", error=str(e))
            return False


# ── Email ─────────────────────────────────────────────────────────────────────

class EmailNotificationService:
    """
    Sends transactional emails via Resend (production) or SMTP (development).

    Resend uses a REST API — no blocking SMTP connections, built-in retries,
    delivery webhooks, and a generous free tier (3 000 emails/month).
    SMTP targets Mailpit in development (same ports as the old MailHog).

    Select the backend with EMAIL_PROVIDER=resend|smtp.
    """

    def send_meeting_summary(
        self,
        to_email: str,
        recipient_name: str,
        meeting_title: str,
        summary: str,
        action_items: list[dict],
        meeting_url: str,
    ) -> bool:
        """Send a meeting summary email. Returns False on failure — never raises."""
        if not settings.enable_email_notifications:
            return False

        subject = f"Meeting Summary: {meeting_title}"
        html = _build_summary_email(
            name=recipient_name,
            title=meeting_title,
            summary=summary,
            action_items=action_items,
            meeting_url=meeting_url,
        )

        try:
            self._deliver(to_email, subject, html)
            return True
        except Exception as e:
            log.error("email.send_failed", error=str(e), to=to_email,
                      provider=settings.email_provider)
            return False

    def send_test_mail(self, to_email: str) -> None:
        """Send a test email. RAISES on failure so the caller sees the real error."""
        subject = "MeetingMind — Email Notification Test"
        html = _build_summary_email(
            name="John Doe",
            title="Test Meeting",
            summary="This is a test email confirming your MeetingMind email notifications are working correctly.",
            action_items=[
                {"title": "Review meeting notes", "assignee": "John", "due_date": "30 May 2026", "priority": "high"},
                {"title": "Send follow-up to team", "assignee": None, "due_date": None, "priority": "medium"},
            ],
            meeting_url=f"{settings.app_frontend_url}/meetings/test",
        )
        self._deliver(to_email, subject, html)

    def _deliver(self, to_email: str, subject: str, html: str) -> None:
        """Route to the configured backend. Raises on any failure."""
        if not settings.enable_email_notifications:
            raise RuntimeError("Email notifications are disabled (ENABLE_EMAIL_NOTIFICATIONS=false)")
        if settings.email_provider == "resend":
            self._send_via_resend(to_email, subject, html)
        else:
            self._send_via_smtp(to_email, subject, html)

    # ── Resend backend ────────────────────────────────────────────────────────

    def _send_via_resend(self, to_email: str, subject: str, html: str) -> None:
        """Raises on failure."""
        if not settings.resend_api_key:
            log.warning("email.resend.no_key", reason="RESEND_API_KEY not set — falling back to SMTP")
            self._send_via_smtp(to_email, subject, html)
            return

        import resend  # noqa: PLC0415
        resend.api_key = settings.resend_api_key
        resend.Emails.send({
            "from": f"{settings.smtp_from_name} <{settings.smtp_from_email}>",
            "to": [to_email],
            "subject": subject,
            "html": html,
        })
        log.info("email.resend.sent", to=to_email)

    # ── SMTP backend ──────────────────────────────────────────────────────────

    def _send_via_smtp(self, to_email: str, subject: str, html: str) -> None:
        """Raises on failure — the real exception propagates so callers can log/retry it."""
        if not settings.smtp_host:
            raise RuntimeError("SMTP_HOST is not configured")

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
        msg["To"] = to_email
        msg.attach(MIMEText(html, "html"))

        use_auth = bool(settings.smtp_user and settings.smtp_password)
        ctx = ssl.create_default_context()

        if settings.smtp_port == 465:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=ctx, timeout=15) as srv:
                if use_auth:
                    srv.login(settings.smtp_user, settings.smtp_password)
                srv.sendmail(settings.smtp_from_email, to_email, msg.as_string())
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as srv:
                srv.ehlo()
                if srv.has_extn("STARTTLS"):
                    srv.starttls(context=ctx)
                    srv.ehlo()
                if use_auth:
                    srv.login(settings.smtp_user, settings.smtp_password)
                srv.sendmail(settings.smtp_from_email, to_email, msg.as_string())

        log.info("email.smtp.sent", to=to_email, host=settings.smtp_host, port=settings.smtp_port)


# ── HTML template ─────────────────────────────────────────────────────────────

def _build_summary_email(
    name: str,
    title: str,
    summary: str,
    action_items: list[dict],
    meeting_url: str,
) -> str:
    items_html = "".join(
        f"""<tr>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;">{item.get('title', '')}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;">{item.get('assignee') or '—'}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;">{item.get('due_date') or 'TBD'}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;">
            <span style="background:{'#fee2e2' if item.get('priority') == 'high' else '#fef9c3' if item.get('priority') == 'medium' else '#dcfce7'};
                         color:{'#991b1b' if item.get('priority') == 'high' else '#854d0e' if item.get('priority') == 'medium' else '#166534'};
                         padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;">
              {(item.get('priority') or 'medium').upper()}
            </span>
          </td>
        </tr>"""
        for item in action_items
    )

    no_items_row = (
        '<tr><td colspan="4" style="padding:16px;text-align:center;color:#6b7280;font-style:italic;">No action items recorded</td></tr>'
        if not action_items else ""
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Inter,Arial,sans-serif;color:#1a1a1a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#1a56db;padding:28px 32px;border-radius:12px 12px 0 0;text-align:center;">
            <h1 style="color:white;margin:0;font-size:24px;font-weight:700;letter-spacing:-0.5px;">
              🎙️ MeetingMind
            </h1>
            <p style="color:#bfdbfe;margin:6px 0 0;font-size:13px;">AI Meeting Intelligence</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">

            <p style="margin:0 0 8px;font-size:16px;">Hi {name},</p>
            <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
              Your meeting <strong style="color:#1a1a1a;">{title}</strong> has been processed. Here's the summary:
            </p>

            <!-- Summary box -->
            <div style="background:#f0f7ff;padding:20px;border-radius:8px;border-left:4px solid #1a56db;margin-bottom:28px;">
              <p style="margin:0;font-size:15px;line-height:1.6;color:#1e3a5f;">{summary}</p>
            </div>

            <!-- Action items -->
            <h3 style="margin:0 0 12px;font-size:16px;font-weight:600;">✅ Action Items</h3>
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="border-collapse:collapse;background:white;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:28px;">
              <thead>
                <tr style="background:#f9fafb;">
                  <th style="padding:10px 8px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Task</th>
                  <th style="padding:10px 8px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Owner</th>
                  <th style="padding:10px 8px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Due</th>
                  <th style="padding:10px 8px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Priority</th>
                </tr>
              </thead>
              <tbody>{items_html}{no_items_row}</tbody>
            </table>

            <!-- CTA button -->
            <div style="text-align:center;margin-bottom:28px;">
              <a href="{meeting_url}"
                 style="display:inline-block;background:#1a56db;color:white;padding:14px 32px;
                        border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
                View Full Summary →
              </a>
            </div>

            <!-- Footer -->
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px;">
            <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;line-height:1.6;">
              MeetingMind — AI Meeting Intelligence for African SMBs<br>
              <a href="{settings.app_frontend_url}/unsubscribe" style="color:#9ca3af;">Unsubscribe</a>
            </p>

          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""
