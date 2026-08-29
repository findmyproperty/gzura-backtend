import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';
import { EventRegistration } from '../entities/event-registration.entity';
import { Event } from '../entities/event.entity';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASSWORD');

    this.transporter =
      host && user && pass
        ? nodemailer.createTransport({
            host,
            port: Number(this.config.get<string>('SMTP_PORT') || 587),
            secure:
              this.config.get<string>('SMTP_SECURE')?.toLowerCase() === 'true',
            auth: { user, pass },
          })
        : null;
  }

  async sendEnrollmentConfirmation(
    registration: EventRegistration,
    event: Event,
    passUrl: string,
  ) {
    if (!this.transporter) {
      this.logger.warn(
        'Enrollment email skipped because SMTP is not configured',
      );
      return;
    }

    const from =
      this.config.get<string>('MAIL_FROM') ||
      this.config.get<string>('SMTP_USER') ||
      'GZURA';
    const date = event.dateStart.toLocaleString('en-IN', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone:
        this.config.get<string>('MAIL_TIMEZONE') ||
        this.config.get<string>('GOOGLE_CALENDAR_TIMEZONE') ||
        'Asia/Kolkata',
    });
    const venue = [event.venue, event.location].filter(Boolean).join(', ');
    const isOffline = event.type === 'Offline';
    const safeName = escapeHtml(registration.fullName || 'Learner');
    const safeTitle = escapeHtml(event.title);
    const safeDate = escapeHtml(date);
    const safeVenue = escapeHtml(venue);
    const safePassUrl = escapeHtml(passUrl);
    const action = isOffline
      ? `
        <p style="margin:28px 0">
          <a href="${safePassUrl}" style="background:#2b0548;color:#fff;padding:13px 22px;border-radius:8px;text-decoration:none;font-weight:600">
            View entry pass
          </a>
        </p>
        <p style="color:#666;font-size:13px">Keep this pass ready on your phone or print it before arriving at the venue.</p>
      `
      : '';

    try {
      await this.transporter.sendMail({
        from,
        to: registration.email,
        subject: `You're enrolled: ${event.title}`,
        text: [
          `Hi ${registration.fullName || 'Learner'},`,
          '',
          `Your enrollment in ${event.title} is confirmed.`,
          `Date: ${date}`,
          `Location: ${venue}`,
          isOffline ? `Entry pass: ${passUrl}` : '',
          '',
          'GZURA',
        ]
          .filter(Boolean)
          .join('\n'),
        html: `
          <div style="background:#f6f3f8;padding:32px 16px;font-family:Arial,sans-serif;color:#222">
            <div style="max-width:600px;margin:auto;background:#fff;border-radius:14px;overflow:hidden">
              <div style="background:#2b0548;padding:24px 30px;color:#fff">
                <div style="color:#d4a82c;font-weight:700;letter-spacing:1px">GZURA</div>
                <h1 style="margin:10px 0 0;font-size:24px">Enrollment confirmed</h1>
              </div>
              <div style="padding:30px">
                <p>Hi ${safeName},</p>
                <p>You have successfully enrolled in <strong>${safeTitle}</strong>.</p>
                <div style="margin:24px 0;padding:18px;background:#f8f6fa;border-radius:10px;line-height:1.7">
                  <div><strong>Date:</strong> ${safeDate}</div>
                  <div><strong>Location:</strong> ${safeVenue}</div>
                </div>
                ${action}
              </div>
            </div>
          </div>
        `,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown mail delivery error';
      this.logger.error(
        `Could not send enrollment email to ${registration.email}: ${message}`,
      );
    }
  }

  private getFromHeader(): string {
    return (
      this.config.get<string>('MAIL_FROM') ||
      this.config.get<string>('SMTP_USER') ||
      'GZURA <noreply@gzura.com>'
    );
  }

  private getAdminEmail(): string {
    return (
      this.config.get<string>('ADMIN_EMAIL') ||
      this.config.get<string>('MAIL_FROM') ||
      this.config.get<string>('SMTP_USER') ||
      'admin@gzura.com'
    );
  }

  async sendRoleRequestReceived(
    user: { email: string; firstName?: string; lastName?: string },
    request: { message?: string | null },
  ) {
    if (!this.transporter || !user.email || user.email.endsWith('@gzura.mobile')) return;

    try {
      await this.transporter.sendMail({
        from: this.getFromHeader(),
        to: user.email,
        subject: 'Host role request received - GZURA',
        html: `
          <div style="background:#f6f3f8;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#222">
            <div style="max-width:600px;margin:auto;background:#fff;border-radius:14px;overflow:hidden">
              <div style="background:#2b0548;padding:24px 30px;color:#fff">
                <h1 style="margin:0;font-size:22px">Request received</h1>
              </div>
              <div style="padding:30px">
                <p>Hi <strong>${escapeHtml(user.firstName || 'there')}</strong>,</p>
                <p>We received your request to become a GZURA host. Our team will review it and email you when there is a decision.</p>
                ${
                  request.message
                    ? `<div style="margin:20px 0;padding:16px;background:#f8f6fa;border-radius:8px"><strong>Your message:</strong><br/>${escapeHtml(request.message)}</div>`
                    : ''
                }
              </div>
            </div>
          </div>
        `,
      });
    } catch (error) {
      this.logger.error(`Failed to send role request confirmation to ${user.email}`, error);
    }
  }

  async sendRoleRequestAdminAlert(
    user: { email: string; firstName?: string; lastName?: string },
    request: { message?: string | null },
  ) {
    if (!this.transporter) return;

    const adminEmail = this.getAdminEmail();
    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;

    try {
      await this.transporter.sendMail({
        from: this.getFromHeader(),
        to: adminEmail,
        subject: `Member host request: ${fullName}`,
        html: `
          <div style="background:#f6f3f8;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#222">
            <div style="max-width:600px;margin:auto;background:#fff;border-radius:14px;overflow:hidden">
              <div style="background:#2b0548;padding:24px 30px;color:#fff">
                <h1 style="margin:0;font-size:20px">Member host request</h1>
              </div>
              <div style="padding:30px">
                <p>A logged-in member asked to become a host:</p>
                <div style="margin:20px 0;padding:16px;background:#f8f6fa;border-radius:8px;line-height:1.7">
                  <div><strong>Name:</strong> ${escapeHtml(fullName)}</div>
                  <div><strong>Email:</strong> ${escapeHtml(user.email)}</div>
                  <div><strong>Message:</strong> ${escapeHtml(request.message || 'N/A')}</div>
                </div>
                <p>Log in to Admin Console &gt; Role Requests to approve or reject.</p>
              </div>
            </div>
          </div>
        `,
      });
    } catch (error) {
      this.logger.error('Failed to send role request alert to admin', error);
    }
  }

  async sendRoleRequestApproved(user: { email: string; firstName?: string }) {
    if (!this.transporter || !user.email || user.email.endsWith('@gzura.mobile')) return;

    const origin = this.config.get<string>('CORS_ORIGIN') || 'http://localhost:3001';

    try {
      await this.transporter.sendMail({
        from: this.getFromHeader(),
        to: user.email,
        subject: 'You are now a GZURA host',
        html: `
          <div style="background:#f6f3f8;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#222">
            <div style="max-width:600px;margin:auto;background:#fff;border-radius:14px;overflow:hidden">
              <div style="background:#2b0548;padding:24px 30px;color:#fff">
                <h1 style="margin:0;font-size:22px">Request approved</h1>
              </div>
              <div style="padding:30px">
                <p>Hi <strong>${escapeHtml(user.firstName || 'there')}</strong>,</p>
                <p>Your request to become a host was approved. Sign in again or refresh your session to open the host workspace.</p>
                <div style="margin:24px 0">
                  <a href="${origin}/admin" style="background:#2b0548;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Open host workspace</a>
                </div>
              </div>
            </div>
          </div>
        `,
      });
    } catch (error) {
      this.logger.error(`Failed to send role request approval to ${user.email}`, error);
    }
  }

  async sendRoleRequestRejected(
    user: { email: string; firstName?: string },
    request: { adminNote?: string | null },
  ) {
    if (!this.transporter || !user.email || user.email.endsWith('@gzura.mobile')) return;

    try {
      await this.transporter.sendMail({
        from: this.getFromHeader(),
        to: user.email,
        subject: 'Update on your GZURA host request',
        html: `
          <div style="background:#f6f3f8;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#222">
            <div style="max-width:600px;margin:auto;background:#fff;border-radius:14px;overflow:hidden">
              <div style="background:#2b0548;padding:24px 30px;color:#fff">
                <h1 style="margin:0;font-size:22px">Request not approved</h1>
              </div>
              <div style="padding:30px">
                <p>Hi <strong>${escapeHtml(user.firstName || 'there')}</strong>,</p>
                <p>Your request to become a host was not approved at this time. You can submit another request from your profile.</p>
                ${
                  request.adminNote
                    ? `<div style="margin:20px 0;padding:16px;background:#f8f6fa;border-radius:8px"><strong>Note from the team:</strong><br/>${escapeHtml(request.adminNote)}</div>`
                    : ''
                }
              </div>
            </div>
          </div>
        `,
      });
    } catch (error) {
      this.logger.error(`Failed to send role request rejection to ${user.email}`, error);
    }
  }
}
