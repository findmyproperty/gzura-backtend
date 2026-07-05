import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContactSubmission } from '../entities/contact-submission.entity';
import { CreateContactDto } from './dto/create-contact.dto';

@Injectable()
export class ContactService {
  constructor(
    @InjectRepository(ContactSubmission)
    private contactRepo: Repository<ContactSubmission>,
  ) {}

  create(dto: CreateContactDto) {
    const submission = this.contactRepo.create({
      name: dto.name,
      email: dto.email,
      phone: dto.phone ?? null,
      subject: dto.subject,
      message: dto.message,
    });
    return this.contactRepo.save(submission);
  }
}