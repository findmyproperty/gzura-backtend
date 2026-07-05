import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommunityRegistrationStatus } from '../common/enums/community-registration-status.enum';
import { CommunityRegistration } from '../entities/community-registration.entity';
import { UsersService } from '../users/users.service';
import { CreateCommunityRegistrationDto } from './dto/create-community-registration.dto';
import { UpdateCommunityRegistrationDto } from './dto/update-community-registration.dto';

@Injectable()
export class CommunityRegistrationsService implements OnModuleInit {
  constructor(
    @InjectRepository(CommunityRegistration)
    private communityRegistrationRepo: Repository<CommunityRegistration>,
    private usersService: UsersService,
  ) {}

  async onModuleInit() {
    await this.syncApprovedHostUsers();
  }

  private async syncApprovedHostUsers() {
    const approved = await this.communityRegistrationRepo.find({
      where: { status: CommunityRegistrationStatus.APPROVED },
      order: { createdAt: 'ASC' },
    });

    for (const registration of approved) {
      await this.usersService.ensureHostFromRegistration(registration);
    }
  }

  create(dto: CreateCommunityRegistrationDto) {
    const registration = this.communityRegistrationRepo.create({
      fullName: dto.fullName.trim(),
      email: dto.email.trim().toLowerCase(),
      phone: dto.phone?.trim() ?? null,
      gender: dto.gender ?? null,
      profession: dto.profession?.trim() ?? null,
      interest: dto.interest ?? null,
      message: dto.message?.trim() ?? null,
      status: CommunityRegistrationStatus.PENDING,
    });

    return this.communityRegistrationRepo.save(registration);
  }

  findAll() {
    return this.communityRegistrationRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const registration = await this.communityRegistrationRepo.findOne({
      where: { id },
    });

    if (!registration) {
      throw new NotFoundException('Community registration not found');
    }

    return registration;
  }

  async update(id: string, dto: UpdateCommunityRegistrationDto) {
    const registration = await this.findOne(id);

    if (dto.fullName !== undefined) {
      registration.fullName = dto.fullName.trim();
    }
    if (dto.email !== undefined) {
      registration.email = dto.email.trim().toLowerCase();
    }
    if (dto.phone !== undefined) {
      registration.phone = dto.phone?.trim() ?? null;
    }
    if (dto.gender !== undefined) {
      registration.gender = dto.gender ?? null;
    }
    if (dto.profession !== undefined) {
      registration.profession = dto.profession?.trim() ?? null;
    }
    if (dto.interest !== undefined) {
      registration.interest = dto.interest ?? null;
    }
    if (dto.message !== undefined) {
      registration.message = dto.message?.trim() ?? null;
    }
    if (dto.status !== undefined) {
      registration.status = dto.status;
    }

    const saved = await this.communityRegistrationRepo.save(registration);

    if (saved.status === CommunityRegistrationStatus.APPROVED) {
      await this.usersService.ensureHostFromRegistration(saved);
    }

    return saved;
  }

  async remove(id: string) {
    const registration = await this.findOne(id);
    await this.communityRegistrationRepo.remove(registration);
    return { deleted: true };
  }
}