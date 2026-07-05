import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommunityRegistration } from '../entities/community-registration.entity';
import { CommunityRegistrationsController } from './community-registrations.controller';
import { CommunityRegistrationsService } from './community-registrations.service';

@Module({
  imports: [TypeOrmModule.forFeature([CommunityRegistration])],
  controllers: [CommunityRegistrationsController],
  providers: [CommunityRegistrationsService],
})
export class CommunityRegistrationsModule {}