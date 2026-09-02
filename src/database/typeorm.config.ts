import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { EventActivityLog } from '../entities/event-activity-log.entity';
import { EventContentItem } from '../entities/event-content-item.entity';
import { CommunityRegistration } from '../entities/community-registration.entity';
import { ContactSubmission } from '../entities/contact-submission.entity';
import { EventRegistration } from '../entities/event-registration.entity';
import { Event } from '../entities/event.entity';
import { MeetSessionLog } from '../entities/meet-session-log.entity';
import { RoleRequest } from '../entities/role-request.entity';
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
  entities: [User, Event, EventRegistration, EventContentItem, EventActivityLog, CommunityRegistration, ContactSubmission, RoleRequest, MeetSessionLog],
  synchronize: config.get<string>('DB_SYNC') === 'true',
  ssl: config.get<string>('DB_SSL') === 'true',
  retryAttempts: 5,
  retryDelay: 3000,
  extra: {
    connectionLimit: 10,
    waitForConnections: true,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    connectTimeout: 20_000,
    idleTimeout: 60_000,
  },
});
