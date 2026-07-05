import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isOnlineEventType } from '../common/utils/meeting.util';
import { EventRegistration } from '../entities/event-registration.entity';
import { Event } from '../entities/event.entity';
import { CreateRegistrationDto } from './dto/create-registration.dto';

@Injectable()
export class RegistrationsService {
  constructor(
    @InjectRepository(EventRegistration)
    private registrationRepo: Repository<EventRegistration>,
    @InjectRepository(Event)
    private eventRepo: Repository<Event>,
  ) {}

  async create(dto: CreateRegistrationDto, userId?: string) {
    const event = await this.eventRepo.findOne({ where: { id: dto.eventId } });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (
      isOnlineEventType(event.type) &&
      event.maxAttendees != null &&
      event.maxAttendees > 0
    ) {
      const currentCount = await this.registrationRepo.count({
        where: { eventId: event.id },
      });

      if (currentCount >= event.maxAttendees) {
        throw new BadRequestException(
          'This online event is full. No seats remaining.',
        );
      }
    }

    const registration = this.registrationRepo.create({
      eventId: dto.eventId,
      userId: userId ?? null,
      fullName: dto.fullName,
      email: dto.email,
      phone: dto.phone ?? null,
      city: dto.city ?? null,
      profession: dto.profession ?? null,
    });

    const saved = await this.registrationRepo.save(registration);
    return this.registrationRepo.findOne({
      where: { id: saved.id },
      relations: ['event'],
    });
  }

  findMyRegistrations(userId: string) {
    return this.registrationRepo.find({
      where: { userId },
      relations: ['event'],
      order: { createdAt: 'DESC' },
    });
  }

  findAll(eventId?: string) {
    return this.registrationRepo.find({
      where: eventId ? { eventId } : {},
      relations: ['event', 'user'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const registration = await this.registrationRepo.findOne({
      where: { id },
      relations: ['event', 'user'],
    });

    if (!registration) {
      throw new NotFoundException('Registration not found');
    }

    return registration;
  }
}