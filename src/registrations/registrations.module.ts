import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventRegistration } from '../entities/event-registration.entity';
import { Event } from '../entities/event.entity';
import { User } from '../entities/user.entity';
import { MeetSessionLog } from '../entities/meet-session-log.entity';
import { MailService } from '../integrations/mail.service';
import { GoogleCalendarService } from '../integrations/google-calendar.service';
import { RegistrationsController } from './registrations.controller';
import { RegistrationsService } from './registrations.service';

@Module({
  imports: [TypeOrmModule.forFeature([EventRegistration, Event, User, MeetSessionLog])],
  controllers: [RegistrationsController],
  providers: [RegistrationsService, MailService, GoogleCalendarService],
  exports: [RegistrationsService],
})
export class RegistrationsModule {}
