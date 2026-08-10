import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly config: ConfigService) {}

  getFallbackOtp(): string | null {
    return this.config.get<string>('FALLBACK_OTP') || null;
  }

  private getTwilioClient(): { client: Twilio; serviceSid: string } | null {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const serviceSid = this.config.get<string>('TWILIO_VERIFY_SERVICE_SID');

    if (accountSid && authToken && serviceSid) {
      return {
        client: new Twilio(accountSid, authToken),
        serviceSid,
      };
    }
    return null;
  }

  private formatE164Phone(phone: string): string {
    const trimmed = phone.trim();
    if (trimmed.startsWith('+')) {
      return trimmed;
    }
    const digitsOnly = trimmed.replace(/\D/g, '');
    if (digitsOnly.length === 10) {
      return `+91${digitsOnly}`;
    }
    return `+${digitsOnly}`;
  }

  async sendOtp(phone: string, otpCode: string): Promise<boolean> {
    const formattedPhone = this.formatE164Phone(phone);
    const fallbackOtp = this.getFallbackOtp();

    if (fallbackOtp) {
      this.logger.log(
        `Using static env fallback OTP for ${formattedPhone}: ${fallbackOtp} (generated OTP: ${otpCode})`,
      );
      return true;
    }

    const twilioSetup = this.getTwilioClient();
    if (!twilioSetup) {
      this.logger.warn(
        `Twilio Verify credentials not fully configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID). Phone: ${formattedPhone}, Generated OTP Code: ${otpCode}`,
      );
      return true;
    }

    try {
      const verification = await twilioSetup.client.verify.v2
        .services(twilioSetup.serviceSid)
        .verifications.create({ to: formattedPhone, channel: 'sms' });

      this.logger.log(
        `Twilio Verify OTP sent successfully to ${formattedPhone}. Status: ${verification.status}`,
      );
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Twilio error';
      this.logger.error(`Failed to send Twilio Verify SMS to ${formattedPhone}: ${message}`);
      return false;
    }
  }

  async verifyOtp(phone: string, otpCode: string): Promise<boolean> {
    const formattedPhone = this.formatE164Phone(phone);
    const fallbackOtp = this.getFallbackOtp();
    if (fallbackOtp && otpCode === fallbackOtp) {
      return true;
    }

    const twilioSetup = this.getTwilioClient();
    if (!twilioSetup) {
      return false;
    }

    try {
      const check = await twilioSetup.client.verify.v2
        .services(twilioSetup.serviceSid)
        .verificationChecks.create({ to: formattedPhone, code: otpCode });

      this.logger.log(`Twilio Verify check status for ${formattedPhone}: ${check.status}`);
      return check.status === 'approved';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown verify error';
      this.logger.error(`Twilio Verify check failed for ${formattedPhone}: ${message}`);
      return false;
    }
  }
}
