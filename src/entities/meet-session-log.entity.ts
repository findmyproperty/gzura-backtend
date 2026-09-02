import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Event } from './event.entity';
import { EventRegistration } from './event-registration.entity';
import { User } from './user.entity';

export type MeetSessionAction = 'JOIN' | 'LEAVE';

@Entity('meet_session_logs')
export class MeetSessionLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'event_id' })
  eventId!: string;

  /**
   * Null for host / admin sessions (they have no event registration).
   */
  @Column({ name: 'registration_id', type: 'varchar', nullable: true })
  registrationId!: string | null;

  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null;

  @Column({ type: 'enum', enum: ['JOIN', 'LEAVE'] })
  action!: MeetSessionAction;

  /**
   * Role of the actor who triggered this log: 'MEMBER' | 'HOST' | 'ADMIN'
   */
  @Column({ name: 'actor_role', type: 'varchar', length: 20, nullable: true })
  actorRole!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => Event, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event!: Event;

  @ManyToOne(() => EventRegistration, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'registration_id' })
  registration!: EventRegistration | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;
}
