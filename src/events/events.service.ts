import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventFormat } from '../common/enums/event-format.enum';
import { EventStatus } from '../common/enums/event-status.enum';
import {
  getEventEndDate,
  isGoogleMeetLink,
  isOnlineEventType,
} from '../common/utils/meeting.util';
import { Event } from '../entities/event.entity';
import { User } from '../entities/user.entity';
import { GoogleCalendarService } from '../integrations/google-calendar.service';
import { UsersService } from '../users/users.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private eventRepo: Repository<Event>,
    private googleCalendar: GoogleCalendarService,
    private usersService: UsersService,
  ) {}

  private hostDisplayName(host: Pick<User, 'firstName' | 'lastName'>) {
    return `${host.firstName} ${host.lastName}`.trim();
  }

  private hostBio(host: Pick<User, 'profession' | 'city'>) {
    return [host.profession, host.city].filter(Boolean).join(' • ') || null;
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

  private mapEventWithCount(event: Event, count: number) {
    const meetLink = isGoogleMeetLink(event.meetingRoomId)
      ? event.meetingRoomId
      : null;

    return {
      ...event,
      price: Number(event.price),
      memberPrice: event.memberPrice != null ? Number(event.memberPrice) : null,
      meetingUrl: meetLink,
      meetingLive: isOnlineEventType(event.type) && !!meetLink,
      seatsRemaining:
        isOnlineEventType(event.type) && event.maxAttendees != null
          ? Math.max(event.maxAttendees - count, 0)
          : null,
      _count: { registrations: count },
    };
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

  async findAll(publishedOnly = true) {
    const qb = this.eventRepo
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.host', 'host')
      .loadRelationCountAndMap('event.registrationCount', 'event.registrations')
      .orderBy('event.dateStart', 'ASC');

    if (publishedOnly) {
      qb.where('event.status = :status', { status: EventStatus.PUBLISHED });
    }

    const events = await qb.getMany();
    return events.map((event) =>
      this.mapEventWithCount(
        event,
        (event as Event & { registrationCount: number }).registrationCount ?? 0,
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
      qb.andWhere('event.status = :status', { status: EventStatus.PUBLISHED });
    }

    return qb.getOne();
  }

  async findOne(idOrSlug: string, publishedOnly = true) {
    const event = await this.findOneQuery(idOrSlug, publishedOnly);

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return this.mapEventWithCount(
      event,
      (event as Event & { registrationCount: number }).registrationCount ?? 0,
    );
  }

  async create(dto: CreateEventDto) {
    const isOnline = dto.type === EventFormat.ONLINE;

    if (isOnline) {
      this.validateOnlineSeats(dto.maxAttendees);
    }

    const images = this.normalizeGalleryImages(
      dto.imageUrl,
      dto.galleryImages,
    );

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
      status: dto.status ?? EventStatus.DRAFT,
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
    return this.mapEventWithCount(saved, 0);
  }

  async update(id: string, dto: UpdateEventDto) {
    const event = await this.eventRepo.findOne({ where: { id } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

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
      ...rest
    } = dto;

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

    const saved = await this.eventRepo.save(event);
    const count = await this.eventRepo
      .createQueryBuilder('event')
      .loadRelationCountAndMap('event.registrationCount', 'event.registrations')
      .where('event.id = :id', { id })
      .getOne();

    return this.mapEventWithCount(
      saved,
      (count as Event & { registrationCount: number })?.registrationCount ?? 0,
    );
  }

  async remove(id: string) {
    const event = await this.eventRepo.findOne({ where: { id } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (event.googleCalendarEventId) {
      await this.googleCalendar.deleteMeetEvent(event.googleCalendarEventId);
    }

    await this.eventRepo.remove(event);
    return event;
  }
}
