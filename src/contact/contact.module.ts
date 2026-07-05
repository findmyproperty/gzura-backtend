import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactSubmission } from '../entities/contact-submission.entity';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';

@Module({
  imports: [TypeOrmModule.forFeature([ContactSubmission])],
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}