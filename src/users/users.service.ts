import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { UserStatus } from '../common/enums/user-status.enum';
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