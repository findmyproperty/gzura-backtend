import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { User } from '../src/entities/user.entity';
import { Event } from '../src/entities/event.entity';
import { EventRegistration } from '../src/entities/event-registration.entity';
import { EventContentItem } from '../src/entities/event-content-item.entity';
import { EventActivityLog } from '../src/entities/event-activity-log.entity';
import { CommunityRegistration } from '../src/entities/community-registration.entity';
import { ContactSubmission } from '../src/entities/contact-submission.entity';
import { RoleRequest } from '../src/entities/role-request.entity';
import { MeetSessionLog } from '../src/entities/meet-session-log.entity';

config();

const dataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [User, Event, EventRegistration, EventContentItem, EventActivityLog, CommunityRegistration, ContactSubmission, RoleRequest, MeetSessionLog],
  synchronize: true,
});

async function main() {
  console.log('Connecting to MySQL database:', process.env.DB_DATABASE, 'at', process.env.DB_HOST);
  await dataSource.initialize();
  console.log('Syncing database schema for all entities...');
  await dataSource.synchronize();
  console.log('Successfully synced database schema!');
  await dataSource.destroy();
}

main().catch((err) => {
  console.error('Error syncing database schema:', err);
  process.exit(1);
});
