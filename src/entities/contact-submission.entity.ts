import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('contact_submissions')
export class ContactSubmission {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column()
  email!: string;

  @Column({ type: 'varchar', nullable: true })
  phone!: string | null;

  @Column()
  subject!: string;

  @Column({ type: 'text' })
  message!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}