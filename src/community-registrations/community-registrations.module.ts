import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommunityRegistration } from '../entities/community-registration.entity';
import { UsersModule } from '../users/users.module';
import { CommunityRegistrationsController } from './community-registrations.controller';
import { CommunityRegistrationsService } from './community-registrations.service';

@Module({
  imports: [TypeOrmModule.forFeature([CommunityRegistration]), UsersModule],
  controllers: [CommunityRegistrationsController],
  providers: [CommunityRegistrationsService],
})
export class CommunityRegistrationsModule {}