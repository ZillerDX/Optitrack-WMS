import nodemailer from 'nodemailer';

/** Escape text interpolated into HTML emails. */
function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Send the password-reset email. Returns false (never throws) when SMTP is not
 * configured or delivery fails, so callers can keep the response generic.
 */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) {
    console.error('[Mailer] SMTP_HOST / SMTP_USER / SMTP_PASSWORD are not configured');
    return false;
  }

  try {
    const port = Number(process.env.SMTP_PORT) || 587;
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    const safeUrl = esc(resetUrl);
    await transport.sendMail({
      from: `OptiTrack WMS <${process.env.SMTP_FROM || user}>`,
      to,
      subject: 'OptiTrack WMS - Password Reset Request',
      html: `<div style="font-family:sans-serif;padding:20px;color:#333">
        <h2>Password Reset Request</h2>
        <p>Click the link below to choose a new password. It is valid for 1 hour and can be used once.</p>
        <p><a href="${safeUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold">Reset Password</a></p>
        <p>If you did not request this, you can ignore this email.</p></div>`,
      text: `Reset your OptiTrack WMS password (valid 1 hour, single use): ${resetUrl}`,
    });
    return true;
  } catch (err) {
    console.error('[Mailer] Failed to send password reset email:', err);
    return false;
  }
}
