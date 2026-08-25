import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { EventActivityAction } from '../common/enums/event-activity-action.enum';
import { EventFormat } from '../common/enums/event-format.enum';
import { EventStatus } from '../common/enums/event-status.enum';
import { Role } from '../common/enums/role.enum';
import {
  getEventEndDate,
  isGoogleMeetLink,
  isOnlineEventType,
} from '../common/utils/meeting.util';
import { JwtPayload } from '../common/decorators/current-user.decorator';
import { EventActivityLog } from '../entities/event-activity-log.entity';
import { Event } from '../entities/event.entity';
import { User } from '../entities/user.entity';
import { GoogleCalendarService } from '../integrations/google-calendar.service';
import { MailService } from '../integrations/mail.service';
import { UsersService } from '../users/users.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventPendingChanges } from './pending-changes';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private eventRepo: Repository<Event>,
    @InjectRepository(EventActivityLog)
    private activityLogRepo: Repository<EventActivityLog>,
    private googleCalendar: GoogleCalendarService,
    private usersService: UsersService,
    private mailService: MailService,
  ) {}

  private hostDisplayName(host: Pick<User, 'firstName' | 'lastName'>) {
    return `${host.firstName} ${host.lastName}`.trim();
  }

  private hostBio(host: Pick<User, 'profession' | 'city'>) {
    return [host.profession, host.city].filter(Boolean).join(' • ') || null;
  }

  private serializeActivityLog(log: EventActivityLog) {
    return {
      id: log.id,
      action: log.action,
      message: log.message,
      actorId: log.actorId,
      actorName: log.actorName,
      actorRole: log.actorRole,
      createdAt: log.createdAt,
    };
  }

  private fallbackActivityLogs(event: Event) {
    const hostName = event.host
      ? this.hostDisplayName(event.host)
      : event.speakerName;
    const created = {
      id: `created-${event.id}`,
      action: EventActivityAction.CREATED,
      message: null as string | null,
      actorId: event.hostId,
      actorName: hostName || null,
      actorRole: event.host?.role || 'HOST',
      createdAt: event.createdAt,
    };

    if (event.status === EventStatus.REJECTED) {
      return [
        created,
        {
          id: `rejected-${event.id}`,
          action: EventActivityAction.REJECTED,
          message: event.rejectionReason?.trim() || null,
          actorId: null,
          actorName: 'Admin',
          actorRole: 'ADMIN',
          createdAt: event.updatedAt,
        },
      ];
    }

    if (event.status === EventStatus.PUBLISHED) {
      return [
        created,
        {
          id: `approved-${event.id}`,
          action: EventActivityAction.APPROVED,
          message: null,
          actorId: null,
          actorName: 'Admin',
          actorRole: 'ADMIN',
          createdAt: event.updatedAt,
        },
      ];
    }

    if (event.status === EventStatus.PENDING) {
      return [
        created,
        {
          id: `submitted-${event.id}`,
          action: EventActivityAction.SUBMITTED,
          message: null,
          actorId: event.hostId,
          actorName: hostName || null,
          actorRole: 'HOST',
          createdAt: event.updatedAt,
        },
      ];
    }

    return [created];
  }

  private withCreatedLog(
    event: Event,
    logs: ReturnType<EventsService['serializeActivityLog']>[],
  ) {
    if (logs.some((log) => log.action === EventActivityAction.CREATED)) {
      return logs;
    }

    const [created] = this.fallbackActivityLogs(event);
    return [created, ...logs];
  }

  private latestRejectionReason(
    event: Event,
    logs: ReturnType<EventsService['serializeActivityLog']>[],
  ) {
    const fromLogs = [...logs]
      .reverse()
      .find((log) => log.action === EventActivityAction.REJECTED)
      ?.message?.trim();
    return fromLogs || event.rejectionReason?.trim() || null;
  }

  private async addActivityLog(
    eventId: string,
    action: EventActivityAction,
    actor?: JwtPayload | null,
    message?: string | null,
  ) {
    let actorName: string | null = actor?.email || null;
    if (actor?.sub) {
      const user = await this.usersService.findActor(actor.sub);
      if (user) {
        actorName = `${user.firstName} ${user.lastName}`.trim() || user.email;
      }
    }

    const log = this.activityLogRepo.create({
      eventId,
      action,
      message: message?.trim() || null,
      actorId: actor?.sub || null,
      actorName,
      actorRole: actor?.role || null,
    });
    return this.activityLogRepo.save(log);
  }

  private async loadActivityLogs(eventIds: string[]) {
    if (!eventIds.length) return new Map<string, EventActivityLog[]>();

    const logs = await this.activityLogRepo.find({
      where: { eventId: In(eventIds) },
      order: { createdAt: 'ASC' },
    });

    const grouped = new Map<string, EventActivityLog[]>();
    for (const log of logs) {
      const current = grouped.get(log.eventId) ?? [];
      current.push(log);
      grouped.set(log.eventId, current);
    }
    return grouped;
  }

  private async recordStatusChange(
    event: Event,
    previousStatus: EventStatus,
    actor?: JwtPayload | null,
    resubmissionComment?: string | null,
  ) {
    if (event.status === previousStatus) return;

    if (
      event.status === EventStatus.PENDING &&
      previousStatus === EventStatus.REJECTED
    ) {
      await this.addActivityLog(
        event.id,
        EventActivityAction.RESUBMITTED,
        actor,
        resubmissionComment,
      );
      return;
    }

    if (
      event.status === EventStatus.PENDING &&
      previousStatus !== EventStatus.PENDING
    ) {
      await this.addActivityLog(event.id, EventActivityAction.SUBMITTED, actor);
      return;
    }

    if (event.status === EventStatus.REJECTED) {
      await this.addActivityLog(
        event.id,
        EventActivityAction.REJECTED,
        actor,
        event.rejectionReason,
      );
      return;
    }

    if (
      event.status === EventStatus.PUBLISHED &&
      previousStatus !== EventStatus.PUBLISHED
    ) {
      await this.addActivityLog(event.id, EventActivityAction.APPROVED, actor);
    }
  }

  private pendingPayloadFromDto(dto: UpdateEventDto) {
    const payload: Record<string, unknown> = {};
    const fields: (keyof UpdateEventDto)[] = [
      'title',
      'description',
      'type',
      'dateStart',
      'dateEnd',
      'timeLabel',
      'location',
      'latitude',
      'longitude',
      'venue',
      'speakerName',
      'speakerBio',
      'hostId',
      'courseOutline',
      'imageUrl',
      'galleryImages',
      'price',
      'memberPrice',
      'maxAttendees',
      'meetingLink',
    ];

    for (const field of fields) {
      if (dto[field] !== undefined) {
        payload[field] = dto[field];
      }
    }

    return payload;
  }

  private describePendingPayload(payload: Record<string, unknown>) {
    const labels: Record<string, string> = {
      title: 'title',
      description: 'summary',
      type: 'format',
      dateStart: 'start date',
      dateEnd: 'end date',
      timeLabel: 'time',
      location: 'location',
      venue: 'venue',
      speakerName: 'host name',
      speakerBio: 'host bio',
      courseOutline: 'course outline',
      imageUrl: 'image',
      galleryImages: 'images',
      price: 'price',
      maxAttendees: 'capacity',
      meetingLink: 'meeting link',
    };
    const changed = Object.keys(payload)
      .map((key) => labels[key] || key)
      .filter((value, index, list) => list.indexOf(value) === index);
    return changed.length
      ? `Updated ${changed.join(', ')}`
      : 'Submitted edits for review';
  }

  private async applyUpdateDto(event: Event, dto: UpdateEventDto) {
    const previousType = event.type;
    const nextType = dto.type ?? event.type;
    const becameOffline =
      isOnlineEventType(previousType) && !isOnlineEventType(nextType);
    const isOrWillBeOnline = isOnlineEventType(nextType);
    const {
      galleryImages,
      imageUrl,
      description,
      hostId,
      speakerName,
      speakerBio,
      rejectionReason,
      resubmissionComment: _comment,
      approvePendingChanges: _approve,
      rejectPendingChanges: _reject,
      ...rest
    } = dto;

    const previousReason = event.rejectionReason;

    Object.assign(event, {
      ...rest,
      description:
        description !== undefined
          ? description.trim() || null
          : event.description,
      dateStart: dto.dateStart ? new Date(dto.dateStart) : event.dateStart,
      dateEnd: dto.dateEnd ? new Date(dto.dateEnd) : event.dateEnd,
      venue: isOrWillBeOnline ? null : (dto.venue ?? event.venue),
      location: isOrWillBeOnline
        ? dto.location?.trim() || event.location || 'Google Meet'
        : (dto.location ?? event.location),
      latitude: isOrWillBeOnline
        ? null
        : dto.latitude !== undefined
          ? dto.latitude
          : event.latitude,
      longitude: isOrWillBeOnline
        ? null
        : dto.longitude !== undefined
          ? dto.longitude
          : event.longitude,
      courseOutline:
        dto.courseOutline !== undefined
          ? dto.courseOutline.trim() || null
          : event.courseOutline,
    });

    if (rejectionReason !== undefined) {
      const trimmed = rejectionReason.trim();
      if (trimmed) {
        event.rejectionReason = trimmed;
      } else if (dto.status === EventStatus.PUBLISHED) {
        event.rejectionReason = null;
      } else {
        event.rejectionReason = previousReason;
      }
    }

    if (hostId !== undefined) {
      await this.applyHostDetails(event, hostId, speakerName, speakerBio);
    } else {
      if (speakerName !== undefined) {
        event.speakerName = speakerName.trim() || null;
      }
      if (speakerBio !== undefined) {
        event.speakerBio = speakerBio.trim() || null;
      }
    }

    if (galleryImages !== undefined || imageUrl !== undefined) {
      const images = this.normalizeGalleryImages(
        imageUrl ?? event.imageUrl,
        galleryImages ?? event.galleryImages,
      );
      event.imageUrl = images.imageUrl;
      event.galleryImages = images.galleryImages;
    }

    if (becameOffline) {
      if (event.googleCalendarEventId) {
        await this.googleCalendar.deleteMeetEvent(event.googleCalendarEventId);
      }
      this.clearOnlineMeeting(event);
    } else if (isOrWillBeOnline) {
      await this.applyOnlineMeeting(event, dto.meetingLink);
    }

    return previousReason;
  }

  private async persistAndMap(event: Event) {
    const saved = await this.eventRepo.save(event);
    const count = await this.eventRepo
      .createQueryBuilder('event')
      .loadRelationCountAndMap('event.registrationCount', 'event.registrations')
      .where('event.id = :id', { id: saved.id })
      .getOne();
    const logs = (
      (await this.loadActivityLogs([saved.id])).get(saved.id) ?? []
    ).map((log) => this.serializeActivityLog(log));

    return this.mapEventWithCount(
      saved,
      (count as Event & { registrationCount: number })?.registrationCount ?? 0,
      { includeLogs: true, activityLogs: logs },
    );
  }

  private async applyHostDetails(
    event: Event,
    hostId?: string | null,
    speakerName?: string,
    speakerBio?: string,
  ) {
    if (hostId === null) {
      event.hostId = null;
      event.host = null;
      return;
    }

    if (!hostId) {
      return;
    }

    const host = await this.usersService.findHostById(hostId);
    event.hostId = host.id;
    event.host = host;
    event.speakerName = speakerName?.trim() || this.hostDisplayName(host);
    event.speakerBio = speakerBio?.trim() || this.hostBio(host);
  }

  private mapEventWithCount(
    event: Event,
    count: number,
    options?: {
      activityLogs?: ReturnType<EventsService['serializeActivityLog']>[];
      includeLogs?: boolean;
    },
  ) {
    const meetLink = isGoogleMeetLink(event.meetingRoomId)
      ? event.meetingRoomId
      : null;
    const includeLogs = options?.includeLogs ?? false;
    const storedLogs = options?.activityLogs ?? [];
    const logs = includeLogs
      ? storedLogs.length
        ? this.withCreatedLog(event, storedLogs)
        : this.fallbackActivityLogs(event)
      : undefined;
    const rejectionReason = logs
      ? this.latestRejectionReason(event, logs)
      : event.rejectionReason;

    const mapped = {
      ...event,
      price: Number(event.price),
      memberPrice: event.memberPrice != null ? Number(event.memberPrice) : null,
      meetingUrl: meetLink,
      meetingLive: isOnlineEventType(event.type) && !!meetLink,
      seatsRemaining:
        isOnlineEventType(event.type) && event.maxAttendees != null
          ? Math.max(event.maxAttendees - count, 0)
          : null,
      rejectionReason,
      ...(includeLogs ? { activityLogs: logs } : {}),
      _count: { registrations: count },
    };

    if (!includeLogs) {
      delete (mapped as { pendingChanges?: unknown }).pendingChanges;
      delete (mapped as { activityLogs?: unknown }).activityLogs;
    }

    return mapped;
  }

  private validateOnlineSeats(maxAttendees?: number | null) {
    if (!maxAttendees || maxAttendees < 1) {
      throw new BadRequestException(
        'Online events require total seats to be at least 1',
      );
    }
  }

  private normalizeGalleryImages(
    imageUrl?: string | null,
    galleryImages?: string[] | null,
  ) {
    const urls = (galleryImages?.length
      ? galleryImages
      : imageUrl
        ? [imageUrl]
        : []
    ).filter(Boolean);

    return {
      galleryImages: urls.length ? urls : null,
      imageUrl: urls[0] ?? null,
    };
  }

  private async provisionGoogleMeet(event: Event) {
    const meet = await this.googleCalendar.createMeetEvent({
      title: event.title,
      description: event.description ?? '',
      start: event.dateStart,
      end: getEventEndDate(event.dateStart, event.dateEnd),
    });

    event.meetingRoomId = meet.meetLink;
    event.googleCalendarEventId = meet.calendarEventId;
    event.location = event.location?.trim() || 'Google Meet';
  }

  private async syncGoogleMeet(event: Event) {
    if (!event.googleCalendarEventId) {
      await this.provisionGoogleMeet(event);
      return;
    }

    const meet = await this.googleCalendar.updateMeetEvent(
      event.googleCalendarEventId,
      {
        title: event.title,
        description: event.description ?? '',
        start: event.dateStart,
        end: getEventEndDate(event.dateStart, event.dateEnd),
      },
    );

    event.meetingRoomId = meet.meetLink;
  }

  private async applyOnlineMeeting(event: Event, manualMeetLink?: string) {
    this.validateOnlineSeats(event.maxAttendees);

    if (this.googleCalendar.isConfigured()) {
      await this.syncGoogleMeet(event);
      return;
    }

    if (manualMeetLink && isGoogleMeetLink(manualMeetLink)) {
      event.meetingRoomId = manualMeetLink.trim();
      event.googleCalendarEventId = null;
      return;
    }

    throw new BadRequestException(
      'Google Calendar is not configured. Add Google credentials or provide a Google Meet link.',
    );
  }

  private clearOnlineMeeting(event: Event) {
    event.meetingRoomId = null;
    event.googleCalendarEventId = null;
    event.meetingStartedAt = null;
    event.latitude = null;
    event.longitude = null;
  }

  async findAll(publishedOnly = true, hostId?: string) {
    const qb = this.eventRepo
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.host', 'host')
      .loadRelationCountAndMap('event.registrationCount', 'event.registrations')
      .orderBy('event.dateStart', 'ASC');

    if (publishedOnly) {
      qb.andWhere('event.status IN (:...statuses)', {
        statuses: [EventStatus.PUBLISHED, EventStatus.APPROVED],
      });
    }

    if (hostId) {
      qb.andWhere(
        `(event.hostId = :hostId OR (
          event.hostId IS NULL AND EXISTS (
            SELECT 1 FROM event_activity_logs log
            WHERE log.event_id = event.id
              AND log.actor_id = :hostId
              AND log.action = :createdAction
          )
        ))`,
        { hostId, createdAction: EventActivityAction.CREATED },
      );
    }

    const events = await qb.getMany();
    const logsByEvent = publishedOnly
      ? new Map<string, EventActivityLog[]>()
      : await this.loadActivityLogs(events.map((event) => event.id));

    return events.map((event) =>
      this.mapEventWithCount(
        event,
        (event as Event & { registrationCount: number }).registrationCount ?? 0,
        {
          includeLogs: !publishedOnly,
          activityLogs: (logsByEvent.get(event.id) ?? []).map((log) =>
            this.serializeActivityLog(log),
          ),
        },
      ),
    );
  }

  private async findOneQuery(idOrSlug: string, publishedOnly: boolean) {
    const qb = this.eventRepo
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.host', 'host')
      .loadRelationCountAndMap('event.registrationCount', 'event.registrations')
      .where('event.id = :idOrSlug OR event.slug = :idOrSlug', { idOrSlug });

    if (publishedOnly) {
      qb.andWhere('event.status IN (:...statuses)', {
        statuses: [EventStatus.PUBLISHED, EventStatus.APPROVED],
      });
    }

    return qb.getOne();
  }

  async findOne(idOrSlug: string, publishedOnly = true) {
    const event = await this.findOneQuery(idOrSlug, publishedOnly);

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const logs = publishedOnly
      ? undefined
      : (
          (await this.loadActivityLogs([event.id])).get(event.id) ?? []
        ).map((log) => this.serializeActivityLog(log));

    return this.mapEventWithCount(
      event,
      (event as Event & { registrationCount: number }).registrationCount ?? 0,
      { includeLogs: !publishedOnly, activityLogs: logs },
    );
  }

  async hostOwnsEvent(
    event: Pick<Event, 'id' | 'hostId'>,
    hostId: string,
  ) {
    if (event.hostId === hostId) return true;
    if (event.hostId) return false;
    const created = await this.activityLogRepo.count({
      where: {
        eventId: event.id,
        actorId: hostId,
        action: EventActivityAction.CREATED,
      },
    });
    return created > 0;
  }

  async assertHostOwnsEvent(
    event: Pick<Event, 'id' | 'hostId'>,
    hostId: string,
  ) {
    if (await this.hostOwnsEvent(event, hostId)) return;
    throw new ForbiddenException('Not authorized to manage this event');
  }

  async create(dto: CreateEventDto, actor?: JwtPayload | null) {
    const isHost = actor?.role === Role.HOST;
    if (isHost && actor?.sub) {
      dto.hostId = actor.sub;
    }
    const isOnline = dto.type === EventFormat.ONLINE;

    if (isOnline) {
      this.validateOnlineSeats(dto.maxAttendees);
    }

    const images = this.normalizeGalleryImages(
      dto.imageUrl,
      dto.galleryImages,
    );

    const initialStatus = isHost
      ? EventStatus.PENDING_APPROVAL
      : (dto.status ?? EventStatus.DRAFT);

    const event = this.eventRepo.create({
      title: dto.title,
      slug: dto.slug,
      description: dto.description?.trim() || null,
      type: dto.type,
      dateStart: new Date(dto.dateStart),
      dateEnd: dto.dateEnd ? new Date(dto.dateEnd) : null,
      timeLabel: dto.timeLabel ?? null,
      location: isOnline
        ? dto.location?.trim() || 'Google Meet'
        : dto.location,
      latitude: isOnline ? null : (dto.latitude ?? null),
      longitude: isOnline ? null : (dto.longitude ?? null),
      venue: isOnline ? null : (dto.venue ?? null),
      speakerName: dto.speakerName ?? null,
      speakerBio: dto.speakerBio ?? null,
      hostId: dto.hostId ?? null,
      courseOutline: dto.courseOutline?.trim() || null,
      imageUrl: images.imageUrl,
      galleryImages: images.galleryImages,
      price: dto.price,
      memberPrice: dto.memberPrice ?? null,
      maxAttendees: dto.maxAttendees ?? null,
      featured: dto.featured ?? false,
      status: initialStatus,
    });

    await this.applyHostDetails(
      event,
      dto.hostId,
      dto.speakerName,
      dto.speakerBio,
    );

    if (isOnline) {
      await this.applyOnlineMeeting(event, dto.meetingLink);
    }

    const saved = await this.eventRepo.save(event);
    await this.addActivityLog(
      saved.id,
      EventActivityAction.CREATED,
      actor,
    );
    if (
      saved.status === EventStatus.PENDING ||
      saved.status === EventStatus.PENDING_APPROVAL
    ) {
      await this.addActivityLog(
        saved.id,
        EventActivityAction.SUBMITTED,
        actor,
      );
      const hostName = saved.speakerName || 'Host';
      await this.mailService.sendEventSubmissionNoticeToAdmin(saved, hostName);
    } else if (saved.status === EventStatus.PUBLISHED) {
      await this.addActivityLog(
        saved.id,
        EventActivityAction.APPROVED,
        actor,
      );
    }

    const logs = (
      (await this.loadActivityLogs([saved.id])).get(saved.id) ?? []
    ).map((log) => this.serializeActivityLog(log));
    return this.mapEventWithCount(saved, 0, {
      includeLogs: true,
      activityLogs: logs,
    });
  }

  async update(id: string, dto: UpdateEventDto, actor?: JwtPayload | null) {
    const event = await this.eventRepo.findOne({ where: { id } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const isHost = actor?.role === Role.HOST;

    if (isHost && actor?.sub) {
      await this.assertHostOwnsEvent(event, actor.sub);
      dto.hostId = event.hostId || actor.sub;
    }

    if (isHost) {
      dto.approvePendingChanges = undefined;
      dto.rejectPendingChanges = undefined;
      delete dto.rejectionReason;

      if (
        event.status === EventStatus.PUBLISHED &&
        (dto.status === EventStatus.PUBLISHED ||
          dto.status === EventStatus.PENDING ||
          dto.status === EventStatus.REJECTED)
      ) {
        delete dto.status;
      } else if (
        dto.status === EventStatus.PUBLISHED ||
        dto.status === EventStatus.REJECTED
      ) {
        dto.status = EventStatus.PENDING;
      }
    }

    if (dto.approvePendingChanges) {
      if (!event.pendingChanges?.payload) {
        throw new BadRequestException('This event has no pending edits to approve');
      }
      const pendingDto = event.pendingChanges.payload as UpdateEventDto;
      await this.applyUpdateDto(event, { ...pendingDto, status: EventStatus.PUBLISHED });
      event.status = EventStatus.PUBLISHED;
      event.pendingChanges = null;
      await this.addActivityLog(
        event.id,
        EventActivityAction.CHANGES_APPROVED,
        actor,
        'Approved host edits and published the updates',
      );
      return this.persistAndMap(event);
    }

    if (dto.rejectPendingChanges) {
      if (!event.pendingChanges?.payload) {
        throw new BadRequestException('This event has no pending edits to reject');
      }
      const reason = dto.rejectionReason?.trim();
      if (!reason) {
        throw new BadRequestException('Rejection reason is required');
      }
      event.pendingChanges = {
        ...event.pendingChanges,
        status: 'REJECTED',
        rejectionReason: reason,
      };
      event.status = EventStatus.PUBLISHED;
      await this.addActivityLog(
        event.id,
        EventActivityAction.CHANGES_REJECTED,
        actor,
        reason,
      );
      return this.persistAndMap(event);
    }

    if (
      isHost &&
      event.status === EventStatus.PUBLISHED
    ) {
      const payload = this.pendingPayloadFromDto(dto);
      const comment = dto.resubmissionComment?.trim() || null;
      const pending: EventPendingChanges = {
        payload,
        status: 'PENDING',
        rejectionReason: null,
        submittedAt: new Date().toISOString(),
        comment,
      };
      event.pendingChanges = pending;
      const summary = this.describePendingPayload(payload);
      await this.addActivityLog(
        event.id,
        EventActivityAction.CHANGES_SUBMITTED,
        actor,
        comment ? `${summary}. ${comment}` : summary,
      );
      return this.persistAndMap(event);
    }

    if (
      dto.status === EventStatus.REJECTED &&
      !dto.rejectionReason?.trim() &&
      !event.rejectionReason
    ) {
      throw new BadRequestException('Rejection reason is required');
    }

    const previousStatus = event.status;
    const previousReason = event.rejectionReason;
    await this.applyUpdateDto(event, dto);
    await this.recordStatusChange(
      event,
      previousStatus,
      actor,
      dto.resubmissionComment,
    );
    if (
      event.status === EventStatus.REJECTED &&
      previousStatus === EventStatus.REJECTED &&
      event.rejectionReason &&
      event.rejectionReason !== previousReason
    ) {
      await this.addActivityLog(
        event.id,
        EventActivityAction.REJECTED,
        actor,
        event.rejectionReason,
      );
    }

    return this.persistAndMap(event);
  }

  async approveEvent(id: string, actor?: JwtPayload | null) {
    const event = await this.eventRepo.findOne({
      where: { id },
      relations: ['host'],
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (event.pendingChanges?.status === 'PENDING' && event.pendingChanges.payload) {
      const pendingDto = event.pendingChanges.payload as UpdateEventDto;
      await this.applyUpdateDto(event, {
        ...pendingDto,
        status: EventStatus.PUBLISHED,
      });
      event.status = EventStatus.PUBLISHED;
      event.pendingChanges = null;
      event.rejectionReason = null;
      const saved = await this.eventRepo.save(event);
      await this.addActivityLog(
        saved.id,
        EventActivityAction.CHANGES_APPROVED,
        actor,
        'Approved host edits and published the updates',
      );
      return this.findOne(saved.id, false);
    }

    event.status = EventStatus.PUBLISHED;
    event.rejectionReason = null;
    const saved = await this.eventRepo.save(event);
    await this.addActivityLog(saved.id, EventActivityAction.APPROVED, actor);

    const hostEmail = event.host?.email;
    if (hostEmail) {
      await this.mailService.sendEventApprovedNotice(saved, hostEmail);
    }

    return this.findOne(saved.id, false);
  }

  async rejectEvent(id: string, reason: string, actor?: JwtPayload | null) {
    const event = await this.eventRepo.findOne({
      where: { id },
      relations: ['host'],
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (!reason || !reason.trim()) {
      throw new BadRequestException('Rejection reason comment is required');
    }

    const trimmed = reason.trim();

    if (event.pendingChanges?.status === 'PENDING' && event.pendingChanges.payload) {
      event.pendingChanges = {
        ...event.pendingChanges,
        status: 'REJECTED',
        rejectionReason: trimmed,
      };
      event.status = EventStatus.PUBLISHED;
      const saved = await this.eventRepo.save(event);
      await this.addActivityLog(
        saved.id,
        EventActivityAction.CHANGES_REJECTED,
        actor,
        trimmed,
      );
      return this.findOne(saved.id, false);
    }

    event.status = EventStatus.REJECTED;
    event.rejectionReason = trimmed;
    const saved = await this.eventRepo.save(event);
    await this.addActivityLog(saved.id, EventActivityAction.REJECTED, actor, trimmed);

    const hostEmail = event.host?.email;
    if (hostEmail) {
      await this.mailService.sendEventRejectedNotice(saved, hostEmail, trimmed);
    }

    return this.findOne(saved.id, false);
  }

  async resubmitEvent(id: string, dto?: UpdateEventDto) {
    if (dto) {
      await this.update(id, dto);
    }

    const event = await this.eventRepo.findOne({
      where: { id },
      relations: ['host'],
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    event.status = EventStatus.RESUBMITTED;
    event.rejectionReason = null;
    const saved = await this.eventRepo.save(event);

    const hostName = saved.speakerName || 'Host';
    await this.mailService.sendEventSubmissionNoticeToAdmin(saved, hostName);

    return this.findOne(saved.id, false);
  }

  async remove(id: string, actor?: JwtPayload | null) {
    const event = await this.eventRepo.findOne({ where: { id } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (actor?.role === Role.HOST && actor.sub) {
      await this.assertHostOwnsEvent(event, actor.sub);
    }

    if (event.googleCalendarEventId) {
      await this.googleCalendar.deleteMeetEvent(event.googleCalendarEventId);
    }

    await this.eventRepo.remove(event);
    return event;
  }
}
