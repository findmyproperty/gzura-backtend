import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
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

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => Event, (event) => event.registrations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event!: Event;

  @ManyToOne(() => User, (user) => user.registrations, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;
}