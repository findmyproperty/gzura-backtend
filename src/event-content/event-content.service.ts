import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventContentType } from '../common/enums/event-content-type.enum';
import { Role } from '../common/enums/role.enum';
import { EventContentItem } from '../entities/event-content-item.entity';
import { EventRegistration } from '../entities/event-registration.entity';
import { Event } from '../entities/event.entity';
import { CreateEventContentDto } from './dto/create-event-content.dto';
import { UpdateEventContentDto } from './dto/update-event-content.dto';

@Injectable()
export class EventContentService {
  constructor(
    @InjectRepository(EventContentItem)
    private contentRepo: Repository<EventContentItem>,
    @InjectRepository(Event)
    private eventRepo: Repository<Event>,
    @InjectRepository(EventRegistration)
    private registrationRepo: Repository<EventRegistration>,
  ) {}

  private async ensureEventExists(eventId: string) {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    return event;
  }

  private async ensureCanView(eventId: string, userId?: string, role?: Role) {
    await this.ensureEventExists(eventId);

    if (role === Role.ADMIN) {
      return;
    }

    if (!userId) {
      throw new ForbiddenException('Sign in and enroll to access course content');
    }

    const enrolled = await this.registrationRepo.count({
      where: { eventId, userId },
    });

    if (!enrolled) {
      throw new ForbiddenException('Enroll in this course to access content');
    }
  }

  async findByEvent(eventId: string, userId?: string, role?: Role) {
    await this.ensureCanView(eventId, userId, role);

    return this.contentRepo.find({
      where: { eventId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async create(eventId: string, dto: CreateEventContentDto) {
    await this.ensureEventExists(eventId);

    if (dto.contentType === EventContentType.TEXT) {
      if (!dto.textContent?.trim()) {
        throw new BadRequestException('Text content is required');
      }
    } else if (!dto.fileUrl || !dto.fileName) {
      throw new BadRequestException('File URL and file name are required');
    }

    const item = this.contentRepo.create({
      eventId,
      title: dto.title.trim(),
      contentType: dto.contentType,
      textContent:
        dto.contentType === EventContentType.TEXT
          ? dto.textContent?.trim() ?? null
          : null,
      fileUrl: dto.contentType === EventContentType.TEXT ? null : dto.fileUrl ?? null,
      fileName: dto.contentType === EventContentType.TEXT ? null : dto.fileName ?? null,
      sortOrder: dto.sortOrder ?? 0,
    });

    return this.contentRepo.save(item);
  }

  async update(eventId: string, id: string, dto: UpdateEventContentDto) {
    const item = await this.contentRepo.findOne({ where: { id, eventId } });
    if (!item) {
      throw new NotFoundException('Content item not found');
    }

    if (dto.title !== undefined) item.title = dto.title.trim();
    if (dto.sortOrder !== undefined) item.sortOrder = dto.sortOrder;
    if (dto.textContent !== undefined) {
      if (item.contentType !== EventContentType.TEXT) {
        throw new BadRequestException('Only text content items can be edited');
      }
      item.textContent = dto.textContent.trim();
    }

    return this.contentRepo.save(item);
  }

  async remove(eventId: string, id: string) {
    const item = await this.contentRepo.findOne({ where: { id, eventId } });
    if (!item) {
      throw new NotFoundException('Content item not found');
    }

    await this.contentRepo.remove(item);
    return { deleted: true };
  }
}
