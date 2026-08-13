import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EventActivityAction } from '../common/enums/event-activity-action.enum';
import { Event } from './event.entity';

@Entity('event_activity_logs')
export class EventActivityLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'event_id' })
  eventId!: string;

  @Column({ type: 'varchar', length: 32 })
  action!: EventActivityAction;

  @Column({ type: 'text', nullable: true })
  message!: string | null;

  @Column({ name: 'actor_id', type: 'varchar', nullable: true })
  actorId!: string | null;

  @Column({ name: 'actor_name', type: 'varchar', nullable: true })
  actorName!: string | null;

  @Column({ name: 'actor_role', type: 'varchar', length: 32, nullable: true })
  actorRole!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => Event, (event) => event.activityLogs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event!: Event;
}
