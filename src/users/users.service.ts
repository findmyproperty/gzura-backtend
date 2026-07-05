import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { UserStatus } from '../common/enums/user-status.enum';
import { CommunityRegistration } from '../entities/community-registration.entity';
import { User } from '../entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  private sanitize(user: User) {
    const { passwordHash: _, ...safe } = user;
    return safe;
  }

  private splitFullName(fullName: string) {
    const trimmed = fullName.trim();
    const spaceIndex = trimmed.indexOf(' ');

    if (spaceIndex === -1) {
      return { firstName: trimmed, lastName: '' };
    }

    return {
      firstName: trimmed.slice(0, spaceIndex),
      lastName: trimmed.slice(spaceIndex + 1).trim(),
    };
  }

  async ensureHostFromRegistration(registration: CommunityRegistration) {
    const email = registration.email.trim().toLowerCase();
    const { firstName, lastName } = this.splitFullName(registration.fullName);
    const existing = await this.userRepo.findOne({ where: { email } });

    if (existing) {
      if (existing.role !== Role.ADMIN) {
        existing.role = Role.HOST;
      }
      existing.status = UserStatus.ACTIVE;
      existing.firstName = firstName || existing.firstName;
      existing.lastName = lastName || existing.lastName;
      if (registration.phone) existing.phone = registration.phone;
      if (registration.profession) existing.profession = registration.profession;

      const saved = await this.userRepo.save(existing);
      return this.sanitize(saved);
    }

    const passwordHash = await bcrypt.hash(randomBytes(24).toString('hex'), 10);
    const user = this.userRepo.create({
      email,
      passwordHash,
      firstName: firstName || 'Instructor',
      lastName,
      phone: registration.phone,
      profession: registration.profession,
      role: Role.HOST,
      status: UserStatus.ACTIVE,
    });

    const saved = await this.userRepo.save(user);
    return this.sanitize(saved);
  }

  findHosts() {
    return this.userRepo.find({
      where: {
        role: Role.HOST,
        status: UserStatus.ACTIVE,
      },
      order: { firstName: 'ASC', lastName: 'ASC' },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        firstName: true,
        lastName: true,
        phone: true,
        city: true,
        profession: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findHostById(id: string) {
    const user = await this.userRepo.findOne({
      where: {
        id,
        role: Role.HOST,
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        firstName: true,
        lastName: true,
        phone: true,
        city: true,
        profession: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Instructor not found');
    }

    return user;
  }

  findAll() {
    return this.userRepo
      .find({
        order: { createdAt: 'DESC' },
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          lastLoginAt: true,
          firstName: true,
          lastName: true,
          phone: true,
          city: true,
          profession: true,
          createdAt: true,
          updatedAt: true,
        },
      });
  }

  async findOne(id: string) {
    const user = await this.userRepo.findOne({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        phone: true,
        city: true,
        profession: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async create(dto: CreateUserDto) {
    const existing = await this.userRepo.findOne({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = this.userRepo.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone ?? null,
      city: dto.city ?? null,
      profession: dto.profession ?? null,
      role: dto.role ?? Role.MEMBER,
      status: dto.status ?? UserStatus.ACTIVE,
    });

    const saved = await this.userRepo.save(user);
    return this.sanitize(saved);
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.userRepo.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (dto.email && dto.email !== user.email) {
      const existing = await this.userRepo.findOne({
        where: { email: dto.email },
      });
      if (existing) {
        throw new ConflictException('Email already in use');
      }
      user.email = dto.email;
    }

    if (dto.password) {
      user.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;
    if (dto.phone !== undefined) user.phone = dto.phone || null;
    if (dto.city !== undefined) user.city = dto.city || null;
    if (dto.profession !== undefined) user.profession = dto.profession || null;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.status !== undefined) user.status = dto.status;

    const saved = await this.userRepo.save(user);
    return this.sanitize(saved);
  }

  async remove(id: string, currentUserId: string) {
    if (id === currentUserId) {
      throw new BadRequestException('You cannot delete your own account');
    }

    const user = await this.userRepo.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === Role.ADMIN) {
      const adminCount = await this.userRepo.count({
        where: { role: Role.ADMIN },
      });
      if (adminCount <= 1) {
        throw new BadRequestException('Cannot delete the last admin account');
      }
    }

    await this.userRepo.remove(user);
    return { deleted: true };
  }
}
