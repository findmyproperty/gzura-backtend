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
  hostEmail?: string;
}

export interface GoogleMeetEventResult {
  meetLink: string;
  calendarEventId: string;
}

export interface GoogleParticipantAttendance {
  email?: string;
  displayName?: string;
  googleUserId?: string;
  firstJoinedAt?: string;
  lastLeftAt?: string;
  totalDurationSeconds: number;
  sessionCount: number;
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
        scopes: [
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/meetings.space.created',
          'https://www.googleapis.com/auth/meetings.space.readonly',
        ],
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

    if (message.includes('unauthorized_client') || message.includes('invalid_grant')) {
      throw new Error(
        'Google Calendar login expired or was revoked. Generate a new GOOGLE_REFRESH_TOKEN with the same Client ID/Secret (run: node scripts/get-google-refresh-token.js).',
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
        attendees: input.hostEmail
          ? [{ email: input.hostEmail, responseStatus: 'accepted' }]
          : undefined,
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
        attendees: input.hostEmail
          ? [{ email: input.hostEmail, responseStatus: 'accepted' }]
          : existing.data.attendees,
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

  async addAttendee(
    calendarEventId: string,
    email: string,
    displayName?: string,
  ): Promise<boolean> {
    const auth = this.getAuthClient();
    if (!auth || !calendarEventId) return false;

    try {
      const calendar = google.calendar({ version: 'v3', auth });
      const existing = await calendar.events.get({
        calendarId: this.getCalendarId(),
        eventId: calendarEventId,
      });

      const attendees = existing.data.attendees ? [...existing.data.attendees] : [];
      const normalizedEmail = email.trim().toLowerCase();

      const alreadyExists = attendees.some(
        (a) => a.email?.trim().toLowerCase() === normalizedEmail,
      );

      if (!alreadyExists) {
        attendees.push({
          email: normalizedEmail,
          displayName: displayName || undefined,
        });

        await calendar.events.patch({
          calendarId: this.getCalendarId(),
          eventId: calendarEventId,
          requestBody: { attendees },
        });

        this.logger.log(
          `Added attendee ${normalizedEmail} to Google Calendar event ${calendarEventId}`,
        );
      }

      return true;
    } catch (error) {
      this.logger.warn(
        `Failed to add attendee ${email} to Google Calendar event ${calendarEventId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  async fetchConferenceAttendance(
    meetLinkOrCode: string,
  ): Promise<GoogleParticipantAttendance[]> {
    const auth = this.getAuthClient();
    if (!auth || !meetLinkOrCode) return [];

    try {
      const meet = google.meet({ version: 'v2', auth });
      const cleanCode = meetLinkOrCode
        .replace(/^https?:\/\/meet\.google\.com\//i, '')
        .replace(/\?.*$/, '')
        .trim();

      // List conference records. Can filter by space if possible, or retrieve recent records
      let spaceName = '';
      try {
        const spaceRes = await meet.spaces.get({
          name: cleanCode.startsWith('spaces/') ? cleanCode : `spaces/${cleanCode}`,
        });
        if (spaceRes.data.name) {
          spaceName = spaceRes.data.name;
        }
      } catch {
        // Some Google accounts may not resolve space by code directly
      }

      const listParams: { filter?: string; pageSize?: number } = { pageSize: 20 };
      if (spaceName) {
        listParams.filter = `space.name="${spaceName}"`;
      }

      const confRecordsRes = await meet.conferenceRecords.list(listParams);
      const records = confRecordsRes.data.conferenceRecords || [];

      if (records.length === 0) {
        this.logger.log(
          `No Google Meet conference records found for ${meetLinkOrCode}`,
        );
        return [];
      }

      const results: GoogleParticipantAttendance[] = [];

      // Iterate through conference records
      for (const record of records) {
        if (!record.name) continue;

        const participantsRes = await meet.conferenceRecords.participants.list({
          parent: record.name,
          pageSize: 100,
        });

        const participants = participantsRes.data.participants || [];

        for (const participant of participants) {
          if (!participant.name) continue;

          let sessions: any[] = [];
          try {
            const sessionsRes =
              await meet.conferenceRecords.participants.participantSessions.list({
                parent: participant.name,
                pageSize: 100,
              });
            sessions = sessionsRes.data.participantSessions || [];
          } catch (e) {
            this.logger.debug?.(`Could not fetch sessions for ${participant.name}`);
          }

          let totalSeconds = 0;
          let firstJoined: Date | null = null;
          let lastLeft: Date | null = null;

          for (const s of sessions) {
            if (s.startTime) {
              const st = new Date(s.startTime);
              if (!firstJoined || st < firstJoined) firstJoined = st;
            }
            if (s.endTime) {
              const et = new Date(s.endTime);
              if (!lastLeft || et > lastLeft) lastLeft = et;
            }
            if (s.startTime && s.endTime) {
              const diff =
                (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) /
                1000;
              if (diff > 0) totalSeconds += diff;
            }
          }

          // Fallback to participant's own earliestStartTime / latestEndTime if no individual sessions
          if (!firstJoined && participant.earliestStartTime) {
            firstJoined = new Date(participant.earliestStartTime);
          }
          if (!lastLeft && participant.latestEndTime) {
            lastLeft = new Date(participant.latestEndTime);
          }
          if (totalSeconds === 0 && firstJoined && lastLeft) {
            totalSeconds = Math.max(
              0,
              (lastLeft.getTime() - firstJoined.getTime()) / 1000,
            );
          }

          const displayName =
            participant.signedinUser?.user ||
            participant.anonymousUser?.displayName ||
            participant.phoneUser?.displayName ||
            undefined;

          const email =
            participant.signedinUser?.user &&
            participant.signedinUser.user.includes('@')
              ? participant.signedinUser.user.toLowerCase()
              : undefined;

          results.push({
            email,
            displayName,
            googleUserId: participant.signedinUser?.user || undefined,
            firstJoinedAt: firstJoined ? firstJoined.toISOString() : undefined,
            lastLeftAt: lastLeft ? lastLeft.toISOString() : undefined,
            totalDurationSeconds: Math.round(totalSeconds),
            sessionCount: Math.max(sessions.length, 1),
          });
        }
      }

      return results;
    } catch (error) {
      this.logger.warn(
        `Failed to fetch Google Meet attendance records for ${meetLinkOrCode}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  async createWorkspaceEventsSubscription(
    spaceName: string,
    pubsubTopic: string,
  ): Promise<string | null> {
    const auth = this.getAuthClient();
    if (!auth || !spaceName || !pubsubTopic) return null;

    try {
      const we = google.workspaceevents({ version: 'v1', auth });
      const response = await we.subscriptions.create({
        requestBody: {
          targetResource: spaceName.startsWith('//')
            ? spaceName
            : `//meet.googleapis.com/${spaceName.replace(/^\/+/, '')}`,
          eventTypes: [
            'google.workspace.meet.participant.v2.joined',
            'google.workspace.meet.participant.v2.left',
            'google.workspace.meet.conference.v2.ended',
          ],
          notificationEndpoint: {
            pubsubTopic,
          },
          payloadOptions: {
            includeResource: true,
          },
        },
      });

      this.logger.log(
        `Created Google Workspace Events subscription: ${response.data.name}`,
      );
      return response.data.name || null;
    } catch (error) {
      this.logger.warn(
        `Failed to create Google Workspace Events subscription: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}