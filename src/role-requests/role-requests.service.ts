import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { RoleRequestStatus } from '../common/enums/role-request-status.enum';
import { UserStatus } from '../common/enums/user-status.enum';
import { RoleRequest } from '../entities/role-request.entity';
import { User } from '../entities/user.entity';
import { MailService } from '../integrations/mail.service';
import { CreateRoleRequestDto } from './dto/create-role-request.dto';
import { RejectRoleRequestDto } from './dto/reject-role-request.dto';

@Injectable()
export class RoleRequestsService {
  constructor(
    @InjectRepository(RoleRequest)
    private roleRequestRepo: Repository<RoleRequest>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private mailService: MailService,
  ) {}

  private sanitize(request: RoleRequest) {
    if (request.user) {
      const { passwordHash: _, ...safeUser } = request.user as User & {
        passwordHash?: string;
      };
      request.user = safeUser as User;
    }
    if (request.reviewer) {
      const { passwordHash: _, ...safeReviewer } = request.reviewer as User & {
        passwordHash?: string;
      };
      request.reviewer = safeReviewer as User;
    }
    return request;
  }

  async create(userId: string, dto: CreateRoleRequestDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.status === UserStatus.BLOCKED) {
      throw new ForbiddenException('Your account is blocked');
    }
    if (user.role !== Role.MEMBER) {
      throw new ForbiddenException('Only members can request to become a host');
    }

    const pending = await this.roleRequestRepo.findOne({
      where: { userId, status: RoleRequestStatus.PENDING },
    });
    if (pending) {
      throw new ConflictException('You already have a pending host request');
    }

    const request = this.roleRequestRepo.create({
      userId: user.id,
      fromRole: Role.MEMBER,
      toRole: Role.HOST,
      message: dto.message?.trim() || null,
      status: RoleRequestStatus.PENDING,
    });

    const saved = await this.roleRequestRepo.save(request);
    saved.user = user;
    await this.mailService.sendRoleRequestReceived(user, saved);
    await this.mailService.sendRoleRequestAdminAlert(user, saved);
    return this.sanitize(saved);
  }

  async findMine(userId: string) {
    const request = await this.roleRequestRepo.find({
      where: { userId },
      relations: ['user'],
      order: { createdAt: 'DESC' },
      take: 1,
    });
    return request[0] ? this.sanitize(request[0]) : null;
  }

  async findAll(status?: RoleRequestStatus) {
    const where =
      status && Object.values(RoleRequestStatus).includes(status)
        ? { status }
        : {};
    const requests = await this.roleRequestRepo.find({
      where,
      relations: ['user', 'reviewer'],
      order: { createdAt: 'DESC' },
    });
    return requests.map((request) => this.sanitize(request));
  }

  async approve(id: string, adminId: string) {
    const request = await this.roleRequestRepo.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!request) {
      throw new NotFoundException('Role request not found');
    }
    if (request.status !== RoleRequestStatus.PENDING) {
      throw new BadRequestException('This request has already been reviewed');
    }

    const user = request.user;
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.status === UserStatus.BLOCKED) {
      throw new BadRequestException('Cannot approve a blocked account');
    }
    if (user.role !== Role.ADMIN) {
      user.role = Role.HOST;
      user.canHost = true;
      await this.userRepo.save(user);
    } else {
      user.canHost = true;
      await this.userRepo.save(user);
    }

    request.status = RoleRequestStatus.APPROVED;
    request.reviewedBy = adminId;
    request.reviewedAt = new Date();
    const saved = await this.roleRequestRepo.save(request);
    saved.user = user;
    await this.mailService.sendRoleRequestApproved(user);
    return this.sanitize(saved);
  }

  async reject(id: string, adminId: string, dto: RejectRoleRequestDto) {
    const request = await this.roleRequestRepo.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!request) {
      throw new NotFoundException('Role request not found');
    }
    if (request.status !== RoleRequestStatus.PENDING) {
      throw new BadRequestException('This request has already been reviewed');
    }

    request.status = RoleRequestStatus.REJECTED;
    request.adminNote = dto.adminNote?.trim() || null;
    request.reviewedBy = adminId;
    request.reviewedAt = new Date();
    const saved = await this.roleRequestRepo.save(request);
    if (request.user) {
      await this.mailService.sendRoleRequestRejected(request.user, saved);
    }
    return this.sanitize(saved);
  }
}
