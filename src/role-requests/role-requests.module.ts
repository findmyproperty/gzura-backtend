import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoleRequest } from '../entities/role-request.entity';
import { User } from '../entities/user.entity';
import { MailService } from '../integrations/mail.service';
import { RoleRequestsController } from './role-requests.controller';
import { RoleRequestsService } from './role-requests.service';

@Module({
  imports: [TypeOrmModule.forFeature([RoleRequest, User])],
  controllers: [RoleRequestsController],
  providers: [RoleRequestsService, MailService],
  exports: [RoleRequestsService],
})
export class RoleRequestsModule {}
