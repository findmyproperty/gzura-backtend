import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CommunityRegistrationStatus } from '../common/enums/community-registration-status.enum';

@Entity('community_registrations')
export class CommunityRegistration {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'full_name' })
  fullName!: string;

  @Column()
  email!: string;

  @Column({ type: 'varchar', nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', nullable: true })
  gender!: string | null;

  @Column({ type: 'varchar', nullable: true })
  profession!: string | null;

  @Column({ type: 'varchar', nullable: true })
  interest!: string | null;

  @Column({ type: 'text', nullable: true })
  message!: string | null;

  @Column({
    type: 'enum',
    enum: CommunityRegistrationStatus,
    default: CommunityRegistrationStatus.PENDING,
  })
  status!: CommunityRegistrationStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}