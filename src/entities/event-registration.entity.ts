import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PaymentStatus } from '../common/enums/payment-status.enum';
import { Event } from './event.entity';
import { User } from './user.entity';

@Entity('event_registrations')
export class EventRegistration {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'event_id' })
  eventId!: string;

  @Column({ name: 'user_id', nullable: true })
  userId!: string | null;

  @Column({ name: 'full_name' })
  fullName!: string;

  @Column()
  email!: string;

  @Column({ type: 'varchar', nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', nullable: true })
  city!: string | null;

  @Column({ type: 'varchar', nullable: true })
  profession!: string | null;

  @Column({ name: 'access_token', type: 'varchar', unique: true })
  accessToken!: string;

  @Column({
    name: 'payment_status',
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.FREE,
  })
  paymentStatus!: PaymentStatus;

  @Column({
    name: 'amount_paid',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  amountPaid!: string | null;

  @Column({ name: 'razorpay_order_id', type: 'varchar', nullable: true })
  razorpayOrderId!: string | null;

  @Column({ name: 'razorpay_payment_id', type: 'varchar', nullable: true })
  razorpayPaymentId!: string | null;

  @Column({ name: 'checked_in_at', type: 'datetime', nullable: true })
  checkedInAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => Event, (event) => event.registrations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event!: Event;

  @ManyToOne(() => User, (user) => user.registrations, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;
}