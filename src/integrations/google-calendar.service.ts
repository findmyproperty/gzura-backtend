import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { randomUUID } from 'crypto';

export interface GoogleMeetEventInput {
  title: string;
  description: string;
  start: Date;
  end: Date;
  timeZone?: string;
}

export interface GoogleMeetEventResult {
  meetLink: string;
  calendarEventId: string;
}

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return this.getAuthClient() !== null;
  }

  private getCalendarId(): string {
    return this.config.get<string>('GOOGLE_CALENDAR_ID') || 'primary';
  }

  private getTimeZone(): string {
    return this.config.get<string>('GOOGLE_CALENDAR_TIMEZONE') || 'Asia/Kolkata';
  }

  private getAuthClient() {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    const refreshToken = this.config.get<string>('GOOGLE_REFRESH_TOKEN');

    if (clientId && clientSecret && refreshToken) {
      const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
      oauth2.setCredentials({ refresh_token: refreshToken });
      return oauth2;
    }

    const serviceAccountEmail = this.config.get<string>(
      'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    );
    const privateKey = this.config
      .get<string>('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')
      ?.replace(/\\n/g, '\n');
    const impersonateEmail = this.config.get<string>(
      'GOOGLE_CALENDAR_IMPERSONATE_EMAIL',
    );

    if (serviceAccountEmail && privateKey) {
      const auth = new google.auth.JWT({
        email: serviceAccountEmail,
        key: privateKey,
        scopes: ['https://www.googleapis.com/auth/calendar'],
        subject: impersonateEmail || undefined,
      });
      return auth;
    }

    return null;
  }

  private rethrowGoogleAuthError(error: unknown): never {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'object' &&
            error !== null &&
            'message' in error &&
            typeof error.message === 'string'
          ? error.message
          : String(error);

    if (message.includes('unauthorized_client')) {
      throw new Error(
        'Google OAuth credentials mismatch. Regenerate GOOGLE_REFRESH_TOKEN with the same Client ID/Secret (run: node scripts/get-google-refresh-token.js).',
      );
    }

    throw error instanceof Error ? error : new Error(message);
  }

  async createMeetEvent(
    input: GoogleMeetEventInput,
  ): Promise<GoogleMeetEventResult> {
    const auth = this.getAuthClient();
    if (!auth) {
      throw new Error(
        'Google Calendar is not configured. Set OAuth or service account credentials.',
      );
    }

    const calendar = google.calendar({ version: 'v3', auth });
    const timeZone = input.timeZone || this.getTimeZone();
    const requestId = randomUUID();

    let response;
    try {
      response = await calendar.events.insert({
      calendarId: this.getCalendarId(),
      conferenceDataVersion: 1,
      requestBody: {
        summary: input.title,
        description: input.description,
        start: {
          dateTime: input.start.toISOString(),
          timeZone,
        },
        end: {
          dateTime: input.end.toISOString(),
          timeZone,
        },
        conferenceData: {
          createRequest: {
            requestId,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      },
    });
    } catch (error) {
      this.rethrowGoogleAuthError(error);
    }

    const meetLink =
      response.data.hangoutLink ||
      response.data.conferenceData?.entryPoints?.find(
        (entry) => entry.entryPointType === 'video',
      )?.uri;

    if (!meetLink || !response.data.id) {
      this.logger.error(
        'Google Calendar event created without a Meet link',
        response.data,
      );
      throw new Error('Google Meet link could not be created');
    }

    return {
      meetLink,
      calendarEventId: response.data.id,
    };
  }

  async updateMeetEvent(
    calendarEventId: string,
    input: GoogleMeetEventInput,
  ): Promise<GoogleMeetEventResult> {
    const auth = this.getAuthClient();
    if (!auth) {
      throw new Error('Google Calendar is not configured');
    }

    const calendar = google.calendar({ version: 'v3', auth });
    const timeZone = input.timeZone || this.getTimeZone();

    const existing = await calendar.events.get({
      calendarId: this.getCalendarId(),
      eventId: calendarEventId,
    });

    const response = await calendar.events.patch({
      calendarId: this.getCalendarId(),
      eventId: calendarEventId,
      conferenceDataVersion: 1,
      requestBody: {
        summary: input.title,
        description: input.description,
        start: {
          dateTime: input.start.toISOString(),
          timeZone,
        },
        end: {
          dateTime: input.end.toISOString(),
          timeZone,
        },
        conferenceData: existing.data.conferenceData,
      },
    });

    const meetLink =
      response.data.hangoutLink ||
      response.data.conferenceData?.entryPoints?.find(
        (entry) => entry.entryPointType === 'video',
      )?.uri;

    if (!meetLink) {
      throw new Error('Google Meet link could not be updated');
    }

    return {
      meetLink,
      calendarEventId,
    };
  }

  async deleteMeetEvent(calendarEventId: string): Promise<void> {
    const auth = this.getAuthClient();
    if (!auth) return;

    const calendar = google.calendar({ version: 'v3', auth });
    await calendar.events
      .delete({
        calendarId: this.getCalendarId(),
        eventId: calendarEventId,
      })
      .catch((error) => {
        this.logger.warn(
          `Failed to delete Google Calendar event ${calendarEventId}: ${error.message}`,
        );
      });
  }
}