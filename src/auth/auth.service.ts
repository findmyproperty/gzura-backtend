import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { google } from 'googleapis';
import { Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { UserStatus } from '../common/enums/user-status.enum';
import { User } from '../entities/user.entity';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
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
      role: Role.MEMBER,
    });

    await this.userRepo.save(user);
    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto, requireAdmin = false) {
    const user = await this.userRepo.findOne({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('Please sign in with Google');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (requireAdmin && user.role !== Role.ADMIN) {
      throw new UnauthorizedException('Admin access required');
    }

    if (user.status === UserStatus.BLOCKED) {
      throw new UnauthorizedException('Account is blocked');
    }

    user.lastLoginAt = new Date();
    await this.userRepo.save(user);

    return this.buildAuthResponse(user);
  }

  async getProfile(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        phone: true,
        city: true,
        profession: true,
        onboardingGoal: true,
        onboardingInterests: true,
        onboardingCompletedAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  async loginWithGoogle(credential: string) {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');

    if (!clientId) {
      throw new BadRequestException('Google sign-in is not configured');
    }

    const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    let payload: {
      sub?: string | null;
      email?: string | null;
      email_verified?: boolean | null;
      given_name?: string | null;
      family_name?: string | null;
      name?: string | null;
    };

    try {
      const ticket = await oauth2.verifyIdToken({
        idToken: credential,
        audience: clientId,
      });
      payload = ticket.getPayload() ?? {};
    } catch {
      throw new UnauthorizedException('Invalid Google sign-in token');
    }

    if (!payload.sub || !payload.email) {
      throw new UnauthorizedException('Google account email is required');
    }

    if (payload.email_verified === false) {
      throw new UnauthorizedException('Google account email is not verified');
    }

    const email = payload.email.toLowerCase();
    let user =
      (await this.userRepo.findOne({ where: { googleId: payload.sub } })) ??
      (await this.userRepo.findOne({ where: { email } }));

    if (!user) {
      const nameParts = payload.name?.trim().split(/\s+/) ?? [];
      user = this.userRepo.create({
        email,
        googleId: payload.sub,
        passwordHash: null,
        firstName: payload.given_name || nameParts[0] || 'User',
        lastName:
          payload.family_name || nameParts.slice(1).join(' ') || 'Member',
        role: Role.MEMBER,
      });
    } else {
      if (user.status === UserStatus.BLOCKED) {
        throw new UnauthorizedException('Account is blocked');
      }

      if (!user.googleId) {
        user.googleId = payload.sub;
      }
    }

    user.lastLoginAt = new Date();
    await this.userRepo.save(user);

    return this.buildAuthResponse(user);
  }

  async completeOnboarding(userId: string, dto: CompleteOnboardingDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    user.onboardingGoal = dto.goal;
    user.onboardingInterests = dto.interests;
    user.onboardingCompletedAt = new Date();
    await this.userRepo.save(user);

    return this.getProfile(userId);
  }

  private buildAuthResponse(user: {
    id: string;
    email: string;
    role: Role;
    firstName: string;
    lastName: string;
    onboardingGoal?: string | null;
    onboardingInterests?: string[] | null;
    onboardingCompletedAt?: Date | null;
  }) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        onboardingGoal: user.onboardingGoal ?? null,
        onboardingInterests: user.onboardingInterests ?? null,
        onboardingCompletedAt: user.onboardingCompletedAt
          ? user.onboardingCompletedAt.toISOString()
          : null,
      },
    };
  }
}