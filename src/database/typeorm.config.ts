import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { EventContentItem } from '../entities/event-content-item.entity';
import { CommunityRegistration } from '../entities/community-registration.entity';
import { ContactSubmission } from '../entities/contact-submission.entity';
import { EventRegistration } from '../entities/event-registration.entity';
import { Event } from '../entities/event.entity';
import { User } from '../entities/user.entity';

export const getTypeOrmConfig = (
  config: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'mysql',
  host: config.get<string>('DB_HOST'),
  port: parseInt(config.get<string>('DB_PORT') || '3306', 10),
  username: config.get<string>('DB_USERNAME'),
  password: config.get<string>('DB_PASSWORD'),
  database: config.get<string>('DB_DATABASE'),
  entities: [User, Event, EventRegistration, EventContentItem, CommunityRegistration, ContactSubmission],
  synchronize: config.get<string>('DB_SYNC') === 'true',
  ssl: config.get<string>('DB_SSL') === 'true',
});