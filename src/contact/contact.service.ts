import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { normalizePhone } from '../common/utils/phone.util';
import { ContactSubmission } from '../entities/contact-submission.entity';
import { MailService } from '../integrations/mail.service';
import { CreateContactDto } from './dto/create-contact.dto';

@Injectable()
export class ContactService {
  constructor(
    @InjectRepository(ContactSubmission)
    private contactRepo: Repository<ContactSubmission>,
    private mailService: MailService,
  ) {}

  async create(dto: CreateContactDto) {
    const name = dto.name.trim();
    const email = dto.email.trim().toLowerCase();
    const subject = dto.subject.trim();
    const message = dto.message.trim();

    if (!subject) {
      throw new BadRequestException('Subject is required');
    }
    if (message.length < 10) {
      throw new BadRequestException('Message must be at least 10 characters');
    }

    let phone: string | null = null;
    if (dto.phone?.trim()) {
      phone = normalizePhone(dto.phone);
      if (!phone || !/^\+91[6-9]\d{9}$/.test(phone)) {
        throw new BadRequestException(
          'Phone must be a valid Indian mobile number',
        );
      }
    }

    const submission = this.contactRepo.create({
      name,
      email,
      phone,
      subject,
      message,
    });
    const saved = await this.contactRepo.save(submission);
    await this.mailService.sendContactSubmissionAdminAlert(saved);
    return saved;
  }
}
