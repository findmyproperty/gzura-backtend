import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventContentItem } from '../entities/event-content-item.entity';
import { EventRegistration } from '../entities/event-registration.entity';
import { Event } from '../entities/event.entity';
import { EventContentController } from './event-content.controller';
import { EventContentService } from './event-content.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([EventContentItem, Event, EventRegistration]),
  ],
  controllers: [EventContentController],
  providers: [EventContentService],
})
export class EventContentModule {}
