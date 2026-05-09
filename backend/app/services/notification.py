"""
Notification service — WhatsApp via Twilio + Email via SMTP.
WhatsApp is the primary channel because that's where Nigerian business happens.
"""
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

import structlog

from app.config import settings

log = structlog.get_logger()


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


class EmailNotificationService:
    def send_meeting_summary(
        self,
        to_email: str,
        recipient_name: str,
        meeting_title: str,
        summary: str,
        action_items: list[dict],
        meeting_url: str,
    ) -> bool:
        if not settings.enable_email_notifications:
            return False
        if not settings.smtp_user:
            return False

        html = _build_summary_email(recipient_name, meeting_title, summary, action_items, meeting_url)

        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Meeting Summary: {meeting_title}"
        msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
        msg["To"] = to_email
        msg.attach(MIMEText(html, "html"))

        try:
            context = ssl.create_default_context()
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
                server.ehlo()
                server.starttls(context=context)
                server.login(settings.smtp_user, settings.smtp_password)
                server.sendmail(settings.smtp_from_email, to_email, msg.as_string())
            return True
        except Exception as e:
            log.error("email.send_failed", error=str(e), to=to_email)
            return False


def _build_summary_email(
    name: str,
    title: str,
    summary: str,
    action_items: list[dict],
    meeting_url: str,
) -> str:
    items_html = "".join(
        f"""<tr>
          <td style="padding:8px;border-bottom:1px solid #eee;">{item['title']}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;">{item.get('assignee') or '—'}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;">{item.get('due_date') or 'TBD'}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;">
            <span style="background:{'#fee2e2' if item.get('priority')=='high' else '#fef9c3'};
                         padding:2px 8px;border-radius:9999px;font-size:12px;">
              {item.get('priority','medium')}
            </span>
          </td>
        </tr>"""
        for item in action_items
    )

    return f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1a1a1a;">
      <div style="background:#1a56db;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
        <h1 style="color:white;margin:0;font-size:22px;">🎙️ MeetingMind</h1>
      </div>
      <div style="background:#f9fafb;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;">
        <p>Hi {name},</p>
        <p>Your meeting <strong>{title}</strong> has been processed. Here's the summary:</p>

        <div style="background:white;padding:16px;border-radius:8px;border-left:4px solid #1a56db;margin:16px 0;">
          <p style="margin:0;">{summary}</p>
        </div>

        <h3>✅ Action Items</h3>
        <table width="100%" style="border-collapse:collapse;background:white;border-radius:8px;overflow:hidden;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="padding:8px;text-align:left;">Task</th>
              <th style="padding:8px;text-align:left;">Owner</th>
              <th style="padding:8px;text-align:left;">Due Date</th>
              <th style="padding:8px;text-align:left;">Priority</th>
            </tr>
          </thead>
          <tbody>{items_html or '<tr><td colspan="4" style="padding:12px;text-align:center;color:#6b7280;">No action items</td></tr>'}</tbody>
        </table>

        <div style="text-align:center;margin-top:24px;">
          <a href="{meeting_url}" style="background:#1a56db;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">
            View Full Summary →
          </a>
        </div>

        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#6b7280;font-size:12px;text-align:center;">
          MeetingMind — AI Meeting Intelligence for African SMBs<br>
          <a href="{settings.app_frontend_url}/unsubscribe" style="color:#6b7280;">Unsubscribe</a>
        </p>
      </div>
    </body>
    </html>
    """
