import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactSubmission } from '../entities/contact-submission.entity';
import { User } from '../entities/user.entity';
import { MailService } from '../integrations/mail.service';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';

@Module({
  imports: [TypeOrmModule.forFeature([ContactSubmission, User])],
  controllers: [ContactController],
  providers: [ContactService, MailService],
})
export class ContactModule {}
