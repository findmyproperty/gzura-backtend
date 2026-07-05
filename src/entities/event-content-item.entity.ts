import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EventContentType } from '../common/enums/event-content-type.enum';
import { Event } from './event.entity';

@Entity('event_content_items')
export class EventContentItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'event_id' })
  eventId!: string;

  @Column()
  title!: string;

  @Column({ name: 'content_type', type: 'enum', enum: EventContentType })
  contentType!: EventContentType;

  @Column({ name: 'text_content', type: 'text', nullable: true })
  textContent!: string | null;

  @Column({ name: 'file_url', type: 'varchar', nullable: true })
  fileUrl!: string | null;

  @Column({ name: 'file_name', type: 'varchar', nullable: true })
  fileName!: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => Event, (event) => event.contentItems, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event!: Event;
}
