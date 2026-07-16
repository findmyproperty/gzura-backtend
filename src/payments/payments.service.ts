import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac } from 'crypto';
import Razorpay from 'razorpay';
import { Repository } from 'typeorm';
import { Event } from '../entities/event.entity';
import { User } from '../entities/user.entity';
import { RegistrationsService } from '../registrations/registrations.service';

@Injectable()
export class PaymentsService {
  private razorpay: Razorpay | null = null;

  constructor(
    private config: ConfigService,
    private registrationsService: RegistrationsService,
    @InjectRepository(Event)
    private eventRepo: Repository<Event>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {
    const keyId = this.config.get<string>('RAZORPAY_KEY_ID');
    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET');

    if (keyId && keySecret) {
      this.razorpay = new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
      });
    }
  }

  private ensureConfigured() {
    if (!this.razorpay) {
      throw new BadRequestException(
        'Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
      );
    }

    return this.razorpay;
  }

  async createOrder(eventId: string, userId: string) {
    const razorpay = this.ensureConfigured();
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const price = this.registrationsService.resolveEventPrice(event, user);
    if (this.registrationsService.isFreePrice(price)) {
      throw new BadRequestException('This event is free. Join directly without payment.');
    }

    const amountPaise = Math.round(price * 100);
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `event_${event.id.slice(0, 8)}_${Date.now()}`,
      notes: {
        eventId: event.id,
        userId: user.id,
      },
    });

    return {
      orderId: order.id,
      amount: amountPaise,
      currency: order.currency,
      keyId: this.config.get<string>('RAZORPAY_KEY_ID'),
      eventTitle: event.title,
      price,
    };
  }

  async verifyPayment(
    userId: string,
    dto: {
      eventId: string;
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
    },
  ) {
    this.ensureConfigured();

    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET');
    if (!keySecret) {
      throw new BadRequestException('Razorpay is not configured');
    }

    const expectedSignature = createHmac('sha256', keySecret)
      .update(`${dto.razorpayOrderId}|${dto.razorpayPaymentId}`)
      .digest('hex');

    if (expectedSignature !== dto.razorpaySignature) {
      throw new BadRequestException('Payment verification failed');
    }

    const event = await this.eventRepo.findOne({ where: { id: dto.eventId } });
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!event || !user) {
      throw new NotFoundException('Event or user not found');
    }

    const price = this.registrationsService.resolveEventPrice(event, user);

    return this.registrationsService.createPaidRegistration(event, user, {
      amount: price,
      razorpayOrderId: dto.razorpayOrderId,
      razorpayPaymentId: dto.razorpayPaymentId,
    });
  }
}