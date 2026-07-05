import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventRegistration } from '../entities/event-registration.entity';
import { Event } from '../entities/event.entity';
import { User } from '../entities/user.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [TypeOrmModule.forFeature([Event, User, EventRegistration])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}