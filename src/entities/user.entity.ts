import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { UserStatus } from '../common/enums/user-status.enum';
import { EventRegistration } from './event-registration.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ name: 'password_hash' })
  passwordHash!: string;

  @Column({ type: 'enum', enum: Role, default: Role.MEMBER })
  role!: Role;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status!: UserStatus;

  @Column({ name: 'last_login_at', type: 'datetime', nullable: true })
  lastLoginAt!: Date | null;

  @Column({ name: 'first_name' })
  firstName!: string;

  @Column({ name: 'last_name' })
  lastName!: string;

  @Column({ type: 'varchar', nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', nullable: true })
  city!: string | null;

  @Column({ type: 'varchar', nullable: true })
  profession!: string | null;

  @Column({ name: 'onboarding_goal', type: 'varchar', length: 50, nullable: true })
  onboardingGoal!: string | null;

  @Column({ name: 'onboarding_interests', type: 'json', nullable: true })
  onboardingInterests!: string[] | null;

  @Column({ name: 'onboarding_completed_at', type: 'datetime', nullable: true })
  onboardingCompletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => EventRegistration, (registration) => registration.user)
  registrations!: EventRegistration[];
}