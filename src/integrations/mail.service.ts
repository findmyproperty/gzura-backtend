import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Resend } from 'resend';
import { Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { CommunityRegistration } from '../entities/community-registration.entity';
import { EventRegistration } from '../entities/event-registration.entity';
import { Event } from '../entities/event.entity';
import { User } from '../entities/user.entity';

function escapeHtml(value: string | null | undefined): string {
  if (!value) return '';
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
  private readonly resend: Resend | null;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.resend = apiKey ? new Resend(apiKey) : null;
  }

  private async sendEmail(params: {
    to: string | string[];
    subject: string;
    html: string;
  }): Promise<boolean> {
    const from = this.config.get<string>('MAIL_FROM')?.trim();
    if (!this.resend || !from) {
      this.logger.warn('Email skipped: RESEND_API_KEY or MAIL_FROM is not configured');
      return false;
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from,
        to: params.to,
        subject: params.subject,
        html: params.html,
      });
      if (error) {
        this.logger.error(`Failed to send email: ${error.message}`);
        return false;
      }

      this.logger.log(`Email sent: ${data?.id ?? 'unknown message ID'}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to send email due to a network error', error);
      return false;
    }
  }

  private async getAdminEmails(): Promise<string[]> {
    const admins = await this.userRepo.find({
      where: { role: Role.ADMIN },
      select: { email: true },
    });
    const devAdminEmail = this.config.get<string>('DEV_ADMIN_EMAIL')?.trim();
    const emails = [
      ...admins.map((admin) => admin.email),
      ...(devAdminEmail ? [devAdminEmail] : []),
    ];

    return Array.from(
      new Map(
        emails
          .map((email) => email.trim())
          .filter(Boolean)
          .map((email) => [email.toLowerCase(), email]),
      ).values(),
    );
  }

  private formatEventDate(dateStart: Date): string {
    return dateStart.toLocaleString('en-IN', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone:
        this.config.get<string>('MAIL_TIMEZONE') ||
        this.config.get<string>('GOOGLE_CALENDAR_TIMEZONE') ||
        'Asia/Kolkata',
    });
  }

  async sendEnrollmentConfirmation(
    registration: EventRegistration,
    event: Event,
    passUrl: string,
  ) {
    if (!this.resend) {
      this.logger.warn('Enrollment email skipped: Resend is not configured');
      return;
    }

    const date = this.formatEventDate(event.dateStart);
    const isOnline = event.type === 'Online';
    const venue = isOnline
      ? 'Online (Google Meet)'
      : [event.venue, event.location].filter(Boolean).join(', ');
    const meetingLink = isOnline ? (event.meetingRoomId || event.location) : null;
    const ticketPrice = Number(event.price) > 0 ? `₹${event.price}` : 'Free';

    const safeName = escapeHtml(registration.fullName || 'Learner');
    const safeTitle = escapeHtml(event.title);
    const safeDate = escapeHtml(date);
    const safeVenue = escapeHtml(venue);
    const safePassUrl = escapeHtml(passUrl);

    try {
      await this.sendEmail({
        to: registration.email,
        subject: `Enrollment Confirmed: ${event.title}`,
        html: `
          <div style="background:#f6f3f8;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#222">
            <div style="max-width:600px;margin:auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.05)">
              <div style="background:#2b0548;padding:24px 30px;color:#fff">
                <div style="color:#d4a82c;font-weight:700;letter-spacing:1px;font-size:14px">GZURA</div>
                <h1 style="margin:8px 0 0;font-size:22px">Enrollment Confirmed!</h1>
              </div>
              <div style="padding:30px">
                <p>Hi <strong>${safeName}</strong>,</p>
                <p>You have successfully registered for <strong>${safeTitle}</strong>.</p>
                
                <div style="margin:24px 0;padding:20px;background:#f8f6fa;border-left:4px solid #2b0548;border-radius:6px;line-height:1.8">
                  <div><strong>Event:</strong> ${safeTitle}</div>
                  <div><strong>Date & Time:</strong> ${safeDate}</div>
                  <div><strong>Type:</strong> ${event.type}</div>
                  <div><strong>Location / Venue:</strong> ${safeVenue}</div>
                  ${meetingLink ? `<div><strong>Meeting Link:</strong> <a href="${escapeHtml(meetingLink)}" style="color:#2b0548;font-weight:600">${escapeHtml(meetingLink)}</a></div>` : ''}
                  <div><strong>Ticket:</strong> ${ticketPrice}</div>
                </div>

                <div style="margin:28px 0;text-align:center">
                  <a href="${safePassUrl}" style="background:#2b0548;color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
                    View & Download Digital Pass
                  </a>
                </div>
                <p style="color:#666;font-size:13px;text-align:center">Keep this pass ready on your phone or print it for entry validation.</p>
              </div>
            </div>
          </div>
        `,
      });
      this.logger.log(`Enrollment confirmation email sent to ${registration.email}`);
    } catch (error) {
      this.logger.error(`Failed to send enrollment email to ${registration.email}`, error);
    }
  }

  async sendPaymentInvoice(
    registration: EventRegistration,
    event: Event,
    paymentDetails: { razorpayPaymentId: string; amount: number },
  ) {
    if (!this.resend) return;

    const safeName = escapeHtml(registration.fullName || 'Learner');
    const safeTitle = escapeHtml(event.title);
    const date = this.formatEventDate(event.dateStart);
    const invoiceNo = `INV-${registration.id.slice(0, 8).toUpperCase()}`;

    try {
      await this.sendEmail({
        to: registration.email,
        subject: `Payment Invoice - ${event.title} (${invoiceNo})`,
        html: `
          <div style="background:#f6f3f8;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#222">
            <div style="max-width:600px;margin:auto;background:#fff;border-radius:14px;overflow:hidden">
              <div style="background:#2b0548;padding:24px 30px;color:#fff">
                <div style="color:#d4a82c;font-weight:700;letter-spacing:1px">GZURA INVOICE</div>
                <h1 style="margin:8px 0 0;font-size:22px">Payment Receipt</h1>
              </div>
              <div style="padding:30px">
                <p>Hi <strong>${safeName}</strong>,</p>
                <p>Thank you for your payment. Here is your official receipt for <strong>${safeTitle}</strong>.</p>
                
                <table style="width:100%;border-collapse:collapse;margin:24px 0;font-size:14px">
                  <tr style="border-bottom:1px solid #eee">
                    <td style="padding:10px 0;color:#666">Invoice Number:</td>
                    <td style="padding:10px 0;font-weight:600;text-align:right">${invoiceNo}</td>
                  </tr>
                  <tr style="border-bottom:1px solid #eee">
                    <td style="padding:10px 0;color:#666">Payment ID:</td>
                    <td style="padding:10px 0;font-weight:600;text-align:right">${escapeHtml(paymentDetails.razorpayPaymentId)}</td>
                  </tr>
                  <tr style="border-bottom:1px solid #eee">
                    <td style="padding:10px 0;color:#666">Event:</td>
                    <td style="padding:10px 0;font-weight:600;text-align:right">${safeTitle}</td>
                  </tr>
                  <tr style="border-bottom:1px solid #eee">
                    <td style="padding:10px 0;color:#666">Date:</td>
                    <td style="padding:10px 0;font-weight:600;text-align:right">${escapeHtml(date)}</td>
                  </tr>
                  <tr style="font-size:16px">
                    <td style="padding:14px 0;font-weight:700;color:#2b0548">Total Paid:</td>
                    <td style="padding:14px 0;font-weight:700;color:#2b0548;text-align:right">₹${paymentDetails.amount}</td>
                  </tr>
                </table>

                <p style="color:#666;font-size:13px">You can also view and download all your invoices anytime in your GZURA member portal under Profile > Invoices.</p>
              </div>
            </div>
          </div>
        `,
      });
      this.logger.log(`Payment invoice sent to ${registration.email}`);
    } catch (error) {
      this.logger.error(`Failed to send payment invoice to ${registration.email}`, error);
    }
  }

  async sendEventApprovedNotice(event: Event, hostEmail: string) {
    if (!this.resend || !hostEmail) return;

    try {
      await this.sendEmail({
        to: hostEmail,
        subject: `Your Event Has Been Approved: ${event.title}`,
        html: `
          <div style="background:#f6f3f8;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#222">
            <div style="max-width:600px;margin:auto;background:#fff;border-radius:14px;overflow:hidden">
              <div style="background:#0f5132;padding:24px 30px;color:#fff">
                <h1 style="margin:0;font-size:22px">Event Approved! 🎉</h1>
              </div>
              <div style="padding:30px">
                <p>Great news! Your event <strong>${escapeHtml(event.title)}</strong> has been approved by the GZURA admin team and is now live/published.</p>
                <p>Learners can now discover and register for your session.</p>
              </div>
            </div>
          </div>
        `,
      });
    } catch (error) {
      this.logger.error(`Failed to send event approved email to ${hostEmail}`, error);
    }
  }

  async sendEventRejectedNotice(event: Event, hostEmail: string, reason: string) {
    if (!this.resend || !hostEmail) return;

    try {
      await this.sendEmail({
        to: hostEmail,
        subject: `Update on Your Event Submission: ${event.title}`,
        html: `
          <div style="background:#f6f3f8;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#222">
            <div style="max-width:600px;margin:auto;background:#fff;border-radius:14px;overflow:hidden">
              <div style="background:#842029;padding:24px 30px;color:#fff">
                <h1 style="margin:0;font-size:22px">Event Review Update</h1>
              </div>
              <div style="padding:30px">
                <p>Your event submission for <strong>${escapeHtml(event.title)}</strong> requires changes before it can be published.</p>
                
                <div style="margin:20px 0;padding:16px;background:#f8d7da;color:#842029;border-radius:8px">
                  <strong>Admin Feedback:</strong><br/>
                  ${escapeHtml(reason)}
                </div>

                <p>Please log in to your dashboard to edit your event details and resubmit it for approval.</p>
              </div>
            </div>
          </div>
        `,
      });
    } catch (error) {
      this.logger.error(`Failed to send event rejected email to ${hostEmail}`, error);
    }
  }

  async sendEventSubmissionNoticeToAdmin(event: Event, hostName: string) {
    if (!this.resend) return;

    const adminEmails = await this.getAdminEmails();
    if (!adminEmails.length) {
      this.logger.warn('Event submission alert skipped: no admin recipients configured');
      return;
    }

    try {
      await this.sendEmail({
        to: adminEmails,
        subject: `New Event Approval Pending: ${event.title}`,
        html: `
          <div style="background:#f6f3f8;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#222">
            <div style="max-width:600px;margin:auto;background:#fff;border-radius:14px;overflow:hidden">
              <div style="background:#2b0548;padding:24px 30px;color:#fff">
                <h1 style="margin:0;font-size:20px">Pending Event Approval</h1>
              </div>
              <div style="padding:30px">
                <p>An event has been submitted or resubmitted for approval by <strong>${escapeHtml(hostName)}</strong>.</p>
                <div style="margin:20px 0;padding:16px;background:#f8f6fa;border-radius:8px">
                  <div><strong>Title:</strong> ${escapeHtml(event.title)}</div>
                  <div><strong>Type:</strong> ${event.type}</div>
                  <div><strong>Status:</strong> ${event.status}</div>
                </div>
                <p>Log into Admin Console > Event Approvals to review, approve, or reject this event.</p>
              </div>
            </div>
          </div>
        `,
      });
    } catch (error) {
      this.logger.error(`Failed to send event submission alert to admin`, error);
    }
  }

  async sendHostApplicationReceived(registration: CommunityRegistration) {
    if (!this.resend) return;

    try {
      await this.sendEmail({
        to: registration.email,
        subject: `Host Application Received - GZURA`,
        html: `
          <div style="background:#f6f3f8;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#222">
            <div style="max-width:600px;margin:auto;background:#fff;border-radius:14px;overflow:hidden">
              <div style="background:#2b0548;padding:24px 30px;color:#fff">
                <h1 style="margin:0;font-size:22px">Application Received!</h1>
              </div>
              <div style="padding:30px">
                <p>Hi <strong>${escapeHtml(registration.fullName)}</strong>,</p>
                <p>Thank you for submitting your application to host a course with GZURA.</p>
                <div style="margin:20px 0;padding:16px;background:#f8f6fa;border-radius:8px;line-height:1.7">
                  <div><strong>Course Topic / Interest:</strong> ${escapeHtml(registration.interest)}</div>
                  ${registration.preferredDate ? `<div><strong>Preferred Date:</strong> ${escapeHtml(registration.preferredDate)}</div>` : ''}
                  ${registration.preferredTime ? `<div><strong>Preferred Time:</strong> ${escapeHtml(registration.preferredTime)}</div>` : ''}
                </div>
                <p>Our team will review your application and contact you within 48 hours.</p>
              </div>
            </div>
          </div>
        `,
      });
    } catch (error) {
      this.logger.error(`Failed to send host application confirmation to ${registration.email}`, error);
    }
  }

  async sendHostApplicationAdminAlert(registration: CommunityRegistration) {
    if (!this.resend) return;

    const adminEmails = await this.getAdminEmails();
    if (!adminEmails.length) {
      this.logger.warn('Host application alert skipped: no admin recipients configured');
      return;
    }

    try {
      await this.sendEmail({
        to: adminEmails,
        subject: `New Host Application: ${registration.fullName}`,
        html: `
          <div style="background:#f6f3f8;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#222">
            <div style="max-width:600px;margin:auto;background:#fff;border-radius:14px;overflow:hidden">
              <div style="background:#2b0548;padding:24px 30px;color:#fff">
                <h1 style="margin:0;font-size:20px">New Host Application</h1>
              </div>
              <div style="padding:30px">
                <p>A new request to join as a host has been received:</p>
                <div style="margin:20px 0;padding:16px;background:#f8f6fa;border-radius:8px;line-height:1.7">
                  <div><strong>Name:</strong> ${escapeHtml(registration.fullName)}</div>
                  <div><strong>Email:</strong> ${escapeHtml(registration.email)}</div>
                  <div><strong>Phone:</strong> ${escapeHtml(registration.phone)}</div>
                  <div><strong>Profession:</strong> ${escapeHtml(registration.profession)}</div>
                  <div><strong>Course Topic:</strong> ${escapeHtml(registration.interest)}</div>
                  <div><strong>Preferred Date:</strong> ${escapeHtml(registration.preferredDate || 'N/A')}</div>
                  <div><strong>Preferred Time:</strong> ${escapeHtml(registration.preferredTime || 'N/A')}</div>
                  <div><strong>Message:</strong> ${escapeHtml(registration.message || 'N/A')}</div>
                </div>
                <p>Log in to Admin Console > Registrations to review.</p>
              </div>
            </div>
          </div>
        `,
      });
    } catch (error) {
      this.logger.error(`Failed to send host application alert to admin`, error);
    }
  }

  async sendPasswordResetEmail(params: {
    email: string;
    firstName?: string;
    resetUrl: string;
  }): Promise<boolean> {
    if (!this.resend) {
      this.logger.warn(
        `Password reset email skipped: Resend is not configured. To: ${params.email} Link: ${params.resetUrl}`,
      );
      return false;
    }

    if (!params.email || params.email.endsWith('@gzura.mobile')) {
      return false;
    }

    const safeName = escapeHtml(params.firstName || 'there');
    const safeUrl = escapeHtml(params.resetUrl);

    try {
      const sent = await this.sendEmail({
        to: params.email,
        subject: 'Reset your GZURA password',
        html: `
          <div style="background:#f6f3f8;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#222">
            <div style="max-width:600px;margin:auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.05)">
              <div style="background:#2b0548;padding:24px 30px;color:#fff">
                <div style="color:#d4a82c;font-weight:700;letter-spacing:1px;font-size:14px">GZURA</div>
                <h1 style="margin:8px 0 0;font-size:22px">Reset your password</h1>
              </div>
              <div style="padding:30px">
                <p>Hi <strong>${safeName}</strong>,</p>
                <p>We received a request to reset the password for your GZURA account. Click the button below to choose a new password. This link expires in 1 hour.</p>
                <div style="margin:28px 0;text-align:center">
                  <a href="${safeUrl}" style="background:#2b0548;color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
                    Reset password
                  </a>
                </div>
                <p style="color:#666;font-size:13px;word-break:break-all">If the button does not work, copy and paste this link into your browser:<br/>${safeUrl}</p>
                <p style="color:#666;font-size:13px;margin-top:24px">If you did not request this, you can ignore this email. Your password will stay the same.</p>
                <p style="color:#666;font-size:14px;margin-top:30px">Best regards,<br>The GZURA Team</p>
              </div>
            </div>
          </div>
        `,
      });
      if (sent) this.logger.log(`Password reset email sent to ${params.email}`);
      return sent;
    } catch (error) {
      this.logger.error(
        `Failed to send password reset email to ${params.email}`,
        error,
      );
      return false;
    }
  }

  async sendWelcomeEmail(user: { email: string; firstName?: string }) {
    if (!this.resend || !user.email || user.email.endsWith('@gzura.mobile')) return;

    try {
      await this.sendEmail({
        to: user.email,
        subject: `Welcome to GZURA, ${user.firstName || 'Member'}!`,
        html: `
          <div style="background:#f6f3f8;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#222">
            <div style="max-width:600px;margin:auto;background:#fff;border-radius:14px;overflow:hidden">
              <div style="background:#2b0548;padding:28px 30px;color:#fff">
                <p style="color:#d4a82c;font-weight:bold;margin:0 0 6px 0;letter-spacing:1px;font-size:12px">GZURA COMMUNITY</p>
                <h1 style="margin:0;font-size:24px">Welcome to GZURA!</h1>
              </div>
              <div style="padding:30px">
                <p style="font-size:16px">Hi <strong>${escapeHtml(user.firstName || 'Learner')}</strong>,</p>
                <p>Welcome aboard! Your GZURA account is active and verified.</p>
                <p>You now have full access to explore offline workshops, masterclasses, and virtual learning events.</p>
                <div style="margin:24px 0">
                  <a href="${this.config.get<string>('CORS_ORIGIN') || 'http://localhost:3001'}/events" style="background:#2b0548;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Explore Upcoming Events</a>
                </div>
                <p style="color:#666;font-size:14px;margin-top:30px">Best regards,<br>The GZURA Team</p>
              </div>
            </div>
          </div>
        `,
      });
      this.logger.log(`Welcome email sent to ${user.email}`);
    } catch (error) {
      this.logger.error(`Failed to send welcome email to ${user.email}`, error);
    }
  }
}
