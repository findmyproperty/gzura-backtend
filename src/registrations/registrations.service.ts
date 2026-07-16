import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { PaymentStatus } from '../common/enums/payment-status.enum';
import { isOnlineEventType } from '../common/utils/meeting.util';
import { EventRegistration } from '../entities/event-registration.entity';
import { Event } from '../entities/event.entity';
import { User } from '../entities/user.entity';
import { CreateRegistrationDto } from './dto/create-registration.dto';

type JoinUser = Pick<
  User,
  'id' | 'email' | 'firstName' | 'lastName' | 'phone' | 'city' | 'profession' | 'role'
>;

@Injectable()
export class RegistrationsService {
  constructor(
    @InjectRepository(EventRegistration)
    private registrationRepo: Repository<EventRegistration>,
    @InjectRepository(Event)
    private eventRepo: Repository<Event>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private config: ConfigService,
  ) {}

  private generateAccessToken() {
    return randomBytes(24).toString('hex');
  }

  private getFrontendUrl() {
    return (
      this.config.get<string>('FRONTEND_URL')?.replace(/\/$/, '') ||
      'http://localhost:3001'
    );
  }

  resolveEventPrice(event: Event, user?: JoinUser | null) {
    const base = Number(event.price);
    const member =
      event.memberPrice != null ? Number(event.memberPrice) : null;

    if (user && member !== null && Number.isFinite(member) && member < base) {
      return member;
    }

    return Number.isFinite(base) ? base : 0;
  }

  isFreePrice(price: number) {
    return !Number.isFinite(price) || price <= 0;
  }

  private async ensureEventCapacity(event: Event) {
    if (event.maxAttendees == null || event.maxAttendees <= 0) {
      return;
    }

    const currentCount = await this.registrationRepo.count({
      where: { eventId: event.id },
    });

    if (currentCount >= event.maxAttendees) {
      throw new BadRequestException('This event is full. No seats remaining.');
    }
  }

  private async findExistingRegistration(eventId: string, user: JoinUser) {
    return this.registrationRepo.findOne({
      where: [
        { eventId, userId: user.id },
        { eventId, email: user.email.toLowerCase() },
      ],
      relations: ['event'],
    });
  }

  private formatRegistration(registration: EventRegistration) {
    const passUrl = `${this.getFrontendUrl()}/pass/${registration.accessToken}`;

    return {
      ...registration,
      passUrl,
      amountPaid:
        registration.amountPaid != null
          ? Number(registration.amountPaid)
          : null,
      checkedInAt: registration.checkedInAt
        ? registration.checkedInAt.toISOString()
        : null,
    };
  }

  private async loadRegistration(id: string) {
    const registration = await this.registrationRepo.findOne({
      where: { id },
      relations: ['event'],
    });

    if (!registration) {
      throw new NotFoundException('Registration not found');
    }

    return this.formatRegistration(registration);
  }

  async create(dto: CreateRegistrationDto, userId?: string) {
    const event = await this.eventRepo.findOne({ where: { id: dto.eventId } });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const price = this.resolveEventPrice(event);
    if (!this.isFreePrice(price)) {
      throw new BadRequestException(
        'This is a paid event. Please complete payment to join.',
      );
    }

    await this.ensureEventCapacity(event);

    const email = dto.email.trim().toLowerCase();
    const existing = await this.registrationRepo.findOne({
      where: userId
        ? [
            { eventId: event.id, userId },
            { eventId: event.id, email },
          ]
        : [{ eventId: event.id, email }],
    });

    if (existing) {
      throw new ConflictException('You are already enrolled in this event');
    }

    const registration = this.registrationRepo.create({
      eventId: dto.eventId,
      userId: userId ?? null,
      fullName: dto.fullName,
      email,
      phone: dto.phone ?? null,
      city: dto.city ?? null,
      profession: dto.profession ?? null,
      accessToken: this.generateAccessToken(),
      paymentStatus: PaymentStatus.FREE,
      amountPaid: '0',
    });

    const saved = await this.registrationRepo.save(registration);
    return this.loadRegistration(saved.id);
  }

  async joinEventByUserId(eventId: string, userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.joinEvent(eventId, user);
  }

  async joinEvent(eventId: string, user: JoinUser) {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const existing = await this.findExistingRegistration(eventId, user);
    if (existing) {
      return this.formatRegistration(existing);
    }

    const price = this.resolveEventPrice(event, user);
    if (!this.isFreePrice(price)) {
      throw new BadRequestException(
        'This is a paid event. Please complete payment to join.',
      );
    }

    await this.ensureEventCapacity(event);

    const registration = this.registrationRepo.create({
      eventId,
      userId: user.id,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      email: user.email.toLowerCase(),
      phone: user.phone ?? null,
      city: user.city ?? null,
      profession: user.profession ?? null,
      accessToken: this.generateAccessToken(),
      paymentStatus: PaymentStatus.FREE,
      amountPaid: '0',
    });

    const saved = await this.registrationRepo.save(registration);
    return this.loadRegistration(saved.id);
  }

  async createPaidRegistration(
    event: Event,
    user: JoinUser,
    payment: {
      amount: number;
      razorpayOrderId: string;
      razorpayPaymentId: string;
    },
  ) {
    const existing = await this.findExistingRegistration(event.id, user);
    if (existing) {
      return this.formatRegistration(existing);
    }

    await this.ensureEventCapacity(event);

    const registration = this.registrationRepo.create({
      eventId: event.id,
      userId: user.id,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      email: user.email.toLowerCase(),
      phone: user.phone ?? null,
      city: user.city ?? null,
      profession: user.profession ?? null,
      accessToken: this.generateAccessToken(),
      paymentStatus: PaymentStatus.PAID,
      amountPaid: payment.amount.toFixed(2),
      razorpayOrderId: payment.razorpayOrderId,
      razorpayPaymentId: payment.razorpayPaymentId,
    });

    const saved = await this.registrationRepo.save(registration);
    return this.loadRegistration(saved.id);
  }

  findMyRegistrations(userId: string) {
    return this.registrationRepo
      .find({
        where: { userId },
        relations: ['event'],
        order: { createdAt: 'DESC' },
      })
      .then((rows) => rows.map((row) => this.formatRegistration(row)));
  }

  findAll(eventId?: string) {
    return this.registrationRepo
      .find({
        where: eventId ? { eventId } : {},
        relations: ['event', 'user'],
        order: { createdAt: 'DESC' },
      })
      .then((rows) => rows.map((row) => this.formatRegistration(row)));
  }

  async findOne(id: string) {
    return this.loadRegistration(id);
  }

  async validatePass(accessToken: string) {
    const registration = await this.registrationRepo.findOne({
      where: { accessToken },
      relations: ['event'],
    });

    if (!registration || !registration.event) {
      return {
        valid: false,
        status: 'invalid' as const,
        message: 'Not a valid pass',
      };
    }

    if (registration.event.type !== 'Offline') {
      return {
        valid: false,
        status: 'invalid' as const,
        message: 'Not a valid pass',
      };
    }

    return {
      valid: true,
      status: registration.checkedInAt ? ('checked_in' as const) : ('enrolled' as const),
      message: registration.checkedInAt ? 'Checked in' : 'Enrolled',
      attendee: {
        fullName: registration.fullName,
        email: registration.email,
        eventTitle: registration.event.title,
        venue: registration.event.venue ?? registration.event.location,
        eventDate: registration.event.dateStart,
      },
      checkedInAt: registration.checkedInAt
        ? registration.checkedInAt.toISOString()
        : null,
    };
  }

  async checkInPass(accessToken: string) {
    const registration = await this.registrationRepo.findOne({
      where: { accessToken },
      relations: ['event'],
    });

    if (!registration || !registration.event) {
      return {
        valid: false,
        status: 'invalid' as const,
        message: 'Not a valid pass',
      };
    }

    if (registration.event.type !== 'Offline') {
      return {
        valid: false,
        status: 'invalid' as const,
        message: 'Not a valid pass',
      };
    }

    if (!registration.checkedInAt) {
      registration.checkedInAt = new Date();
      await this.registrationRepo.save(registration);
    }

    return {
      valid: true,
      status: 'checked_in' as const,
      message: 'Enrolled — checked in successfully',
      attendee: {
        fullName: registration.fullName,
        email: registration.email,
        eventTitle: registration.event.title,
        venue: registration.event.venue ?? registration.event.location,
        eventDate: registration.event.dateStart,
      },
      checkedInAt: registration.checkedInAt.toISOString(),
    };
  }

  getEventById(eventId: string) {
    return this.eventRepo.findOne({ where: { id: eventId } });
  }
}