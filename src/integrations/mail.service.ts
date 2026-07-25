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
}
