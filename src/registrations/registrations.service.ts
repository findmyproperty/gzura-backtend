import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { PaymentStatus } from '../common/enums/payment-status.enum';
import { Role } from '../common/enums/role.enum';
import { JwtPayload } from '../common/decorators/current-user.decorator';
import {
  formatInvoiceNumber,
  formatTicketId,
  isPaidRegistration,
} from '../common/utils/invoice.util';
import {
  formatCertificateNumber,
  hasAttended,
  isEventEnded,
} from '../common/utils/learning.util';
import { EventRegistration } from '../entities/event-registration.entity';
import { Event } from '../entities/event.entity';
import { User } from '../entities/user.entity';
import { MailService } from '../integrations/mail.service';
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
    private mailService: MailService,
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

  private isEventExpired(event: Event) {
    const end = event.dateEnd || event.dateStart;
    const timestamp = new Date(end).getTime();
    return !Number.isNaN(timestamp) && Date.now() > timestamp;
  }

  async assertCanEnroll(event: Event) {
    if (this.isEventExpired(event)) {
      throw new BadRequestException('This event has ended.');
    }
    await this.ensureEventCapacity(event);
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
      attendedAt: registration.attendedAt
        ? registration.attendedAt.toISOString()
        : null,
      certificateIssuedAt: registration.certificateIssuedAt
        ? registration.certificateIssuedAt.toISOString()
        : null,
      certificateNumber: registration.certificateNumber ?? null,
    };
  }

  private async maybeIssueCertificate(
    registration: EventRegistration,
    event: Event,
  ) {
    if (registration.certificateIssuedAt) {
      return registration;
    }

    if (!isEventEnded(event) || !hasAttended(registration, event)) {
      return registration;
    }

    registration.certificateIssuedAt = new Date();
    registration.certificateNumber = formatCertificateNumber(registration.id);
    return this.registrationRepo.save(registration);
  }

  async markAttended(eventId: string, userId: string) {
    const registration = await this.registrationRepo.findOne({
      where: { eventId, userId },
      relations: ['event'],
    });

    if (!registration || !registration.event) {
      throw new NotFoundException('Registration not found');
    }

    if (registration.event.type !== 'Online') {
      throw new BadRequestException(
        'Online attendance is only tracked for online events',
      );
    }

    if (!registration.attendedAt) {
      registration.attendedAt = new Date();
      await this.registrationRepo.save(registration);
    }

    const updated = await this.maybeIssueCertificate(
      registration,
      registration.event,
    );
    return this.formatRegistration(updated);
  }

  private async sendEnrollmentEmail(
    registration: EventRegistration,
    event: Event,
  ) {
    const passUrl = `${this.getFrontendUrl()}/pass/${registration.accessToken}`;
    await this.mailService.sendEnrollmentConfirmation(
      registration,
      event,
      passUrl,
    );
  }

  private async sendInvoiceEmail(
    registration: EventRegistration,
    event: Event,
  ) {
    if (!isPaidRegistration(registration)) {
      return;
    }

    await this.mailService.sendPaymentInvoice(registration, event, {
      razorpayPaymentId: registration.razorpayPaymentId || registration.id,
      amount:
        registration.amountPaid != null ? Number(registration.amountPaid) : 0,
    });
  }

  formatInvoice(registration: EventRegistration) {
    const event = registration.event;
    const amount =
      registration.amountPaid != null ? Number(registration.amountPaid) : 0;

    return {
      id: registration.id,
      invoiceNumber: formatInvoiceNumber(registration.id),
      ticketId: formatTicketId(registration.id),
      issuedAt: registration.createdAt,
      attendeeName: registration.fullName,
      attendeeEmail: registration.email,
      attendeePhone: registration.phone,
      eventId: registration.eventId,
      eventTitle: event?.title ?? 'Event',
      eventType: event?.type ?? null,
      eventDate: event?.dateStart ?? null,
      eventTime: event?.timeLabel ?? null,
      venue: [event?.venue, event?.location].filter(Boolean).join(' — ') || null,
      amount: Number.isFinite(amount) ? amount : 0,
      currency: 'INR',
      paymentStatus: registration.paymentStatus,
      paymentRef: registration.razorpayPaymentId,
      orderId: registration.razorpayOrderId,
      passUrl: `${this.getFrontendUrl()}/pass/${registration.accessToken}`,
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

    await this.assertCanEnroll(event);

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
    await this.sendEnrollmentEmail(saved, event);
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

    await this.assertCanEnroll(event);

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
    await this.sendEnrollmentEmail(saved, event);
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

    await this.assertCanEnroll(event);

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
    await this.sendEnrollmentEmail(saved, event);
    await this.mailService.sendPaymentInvoice(saved, event, {
      razorpayPaymentId: payment.razorpayPaymentId,
      amount: payment.amount,
    });
    return this.loadRegistration(saved.id);
  }

  async findMyInvoices(userId: string) {
    const rows = await this.registrationRepo.find({
      where: { userId },
      relations: ['event'],
      order: { createdAt: 'DESC' },
    });

    return rows
      .filter((row) => isPaidRegistration(row))
      .map((row) => this.formatInvoice(row));
  }

  async findMyInvoice(userId: string, invoiceId: string) {
    const registration = await this.registrationRepo.findOne({
      where: { id: invoiceId, userId },
      relations: ['event'],
    });

    if (!registration || !isPaidRegistration(registration)) {
      throw new NotFoundException('Invoice not found');
    }

    return this.formatInvoice(registration);
  }

  async findMyRegistrations(userId: string) {
    const rows = await this.registrationRepo.find({
      where: { userId },
      relations: ['event'],
      order: { createdAt: 'DESC' },
    });

    const updated: EventRegistration[] = [];
    for (const row of rows) {
      if (row.event) {
        const saved = await this.maybeIssueCertificate(row, row.event);
        updated.push(saved);
      } else {
        updated.push(row);
      }
    }

    return updated.map((row) => this.formatRegistration(row));
  }

  async findAll(eventId?: string, actor?: JwtPayload) {
    if (actor?.role === Role.HOST) {
      if (eventId) {
        const event = await this.eventRepo.findOne({ where: { id: eventId } });
        if (!event || event.hostId !== actor.sub) {
          throw new ForbiddenException(
            'Not authorized to view these registrations',
          );
        }
      }

      return this.registrationRepo
        .find({
          where: eventId ? { eventId } : { event: { hostId: actor.sub } },
          relations: ['event', 'user'],
          order: { createdAt: 'DESC' },
        })
        .then((rows) => rows.map((row) => this.formatRegistration(row)));
    }

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
        id: registration.id,
        eventId: registration.eventId,
        fullName: registration.fullName,
        email: registration.email,
        eventTitle: registration.event.title,
        venue: registration.event.venue ?? registration.event.location,
        eventDate: registration.event.dateStart,
        passUrl: `${this.getFrontendUrl()}/pass/${registration.accessToken}`,
      },
      checkedInAt: registration.checkedInAt
        ? registration.checkedInAt.toISOString()
        : null,
    };
  }

  async checkInPass(
    accessToken: string,
    actor?: JwtPayload | null,
    expectedEventId?: string,
  ) {
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
        message: 'QR check-in is only for offline events',
      };
    }

    if (
      actor?.role === Role.HOST &&
      registration.event.hostId !== actor.sub
    ) {
      return {
        valid: false,
        status: 'invalid' as const,
        message: 'This pass does not belong to your event',
      };
    }

    if (expectedEventId && registration.eventId !== expectedEventId) {
      return {
        valid: false,
        status: 'invalid' as const,
        message: `This pass is for ${registration.event.title}, not the selected event`,
      };
    }

    const alreadyPresent = Boolean(registration.checkedInAt);
    if (!alreadyPresent) {
      registration.checkedInAt = new Date();
      await this.registrationRepo.save(registration);
      await this.maybeIssueCertificate(registration, registration.event);
    }

    return {
      valid: true,
      status: alreadyPresent
        ? ('already_checked_in' as const)
        : ('checked_in' as const),
      message: alreadyPresent
        ? 'Already marked present'
        : 'Attendance marked',
      attendee: {
        id: registration.id,
        eventId: registration.eventId,
        fullName: registration.fullName,
        email: registration.email,
        eventTitle: registration.event.title,
        venue: registration.event.venue ?? registration.event.location,
        eventDate: registration.event.dateStart,
      },
      checkedInAt: registration.checkedInAt!.toISOString(),
    };
  }

  getEventById(eventId: string) {
    return this.eventRepo.findOne({ where: { id: eventId } });
  }
}
