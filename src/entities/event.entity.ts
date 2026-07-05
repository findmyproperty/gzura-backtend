import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EventStatus } from '../common/enums/event-status.enum';
import { EventRegistration } from './event-registration.entity';
import { EventContentItem } from './event-content-item.entity';

@Entity('events')
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  title!: string;

  @Column({ unique: true })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column()
  type!: string;

  @Column({ name: 'date_start', type: 'datetime' })
  dateStart!: Date;

  @Column({ name: 'date_end', type: 'datetime', nullable: true })
  dateEnd!: Date | null;

  @Column({ name: 'time_label', type: 'varchar', nullable: true })
  timeLabel!: string | null;

  @Column()
  location!: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude!: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude!: number | null;

  @Column({ name: 'meeting_room_id', type: 'varchar', nullable: true, unique: true })
  meetingRoomId!: string | null;

  @Column({ name: 'google_calendar_event_id', type: 'varchar', nullable: true })
  googleCalendarEventId!: string | null;

  @Column({ name: 'meeting_started_at', type: 'datetime', nullable: true })
  meetingStartedAt!: Date | null;

  @Column({ type: 'varchar', nullable: true })
  venue!: string | null;

  @Column({ name: 'speaker_name', type: 'varchar', nullable: true })
  speakerName!: string | null;

  @Column({ name: 'speaker_bio', type: 'text', nullable: true })
  speakerBio!: string | null;

  @Column({ name: 'course_outline', type: 'text', nullable: true })
  courseOutline!: string | null;

  @Column({ name: 'image_url', type: 'varchar', nullable: true })
  imageUrl!: string | null;

  @Column({ name: 'gallery_images', type: 'json', nullable: true })
  galleryImages!: string[] | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price!: number;

  @Column({ name: 'member_price', type: 'decimal', precision: 10, scale: 2, nullable: true })
  memberPrice!: number | null;

  @Column({ name: 'max_attendees', type: 'int', nullable: true })
  maxAttendees!: number | null;

  @Column({ default: false })
  featured!: boolean;

  @Column({ type: 'enum', enum: EventStatus, default: EventStatus.DRAFT })
  status!: EventStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => EventRegistration, (registration) => registration.event)
  registrations!: EventRegistration[];

  @OneToMany(() => EventContentItem, (item) => item.event)
  contentItems!: EventContentItem[];
}
