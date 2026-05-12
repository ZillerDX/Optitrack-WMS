"""Transactional email delivery helpers."""

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings

logger = logging.getLogger(__name__)


def send_email(
    email_to: str,
    subject: str,
    html_content: str,
) -> bool:
    """Send an HTML email through the configured SMTP server."""
    smtp_host = settings.SMTP_HOST
    smtp_port = settings.SMTP_PORT
    smtp_user = settings.SMTP_USER
    smtp_password = settings.SMTP_PASSWORD
    
    if not all([smtp_host, smtp_user, smtp_password]):
        logger.warning("SMTP is not configured; email was not sent to %s", email_to)
        return False

    try:
        message = MIMEMultipart("alternative")
        message["Subject"] = subject
        message["From"] = f"{settings.APP_NAME} <{smtp_user}>"
        message["To"] = email_to

        part = MIMEText(html_content, "html")
        message.attach(part)

        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_user, email_to, message.as_string())
        
        return True
    except Exception:
        logger.exception("Failed to send email to %s", email_to)
        return False


def send_reset_password_email(email_to: str, token: str):
    """Send a password reset email."""
    subject = f"{settings.APP_NAME} - Password Reset Request"
    reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={token}"
    
    html_content = f"""
    <div style="font-family: sans-serif; padding: 20px; color: #333;">
        <h2>Password Reset Request</h2>
        <p>You requested a password reset for your {settings.APP_NAME} account.</p>
        <p>Please click the link below to set a new password. This link is valid for 1 hour.</p>
        <div style="margin: 30px 0;">
            <a href="{reset_url}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; rounded: 8px; font-weight: bold;">
                Reset Password
            </a>
        </div>
        <p>If you did not request this, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="font-size: 12px; color: #999;">OptiTrack WMS - Professional Warehouse Management</p>
    </div>
    """
    
    return send_email(email_to, subject, html_content)
