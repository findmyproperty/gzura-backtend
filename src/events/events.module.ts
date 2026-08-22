import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from '../entities/event.entity';
import { EventActivityLog } from '../entities/event-activity-log.entity';
import { User } from '../entities/user.entity';
import { GoogleCalendarService } from '../integrations/google-calendar.service';
import { UsersModule } from '../users/users.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

import { MailService } from '../integrations/mail.service';

@Module({
  imports: [TypeOrmModule.forFeature([Event, EventActivityLog, User]), UsersModule],
  controllers: [EventsController],
  providers: [EventsService, GoogleCalendarService, MailService],
  exports: [EventsService],
})
export class EventsModule {}
