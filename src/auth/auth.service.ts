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

import { SmsService } from '../integrations/sms.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private jwtService: JwtService,
    private config: ConfigService,
    private smsService: SmsService,
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

  async sendOtp(dto: SendOtpDto) {
    const phone = dto.phone.trim();
    if (!phone) {
      throw new BadRequestException('Phone number is required');
    }

    const fallbackOtp = this.smsService.getFallbackOtp();
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpCode = fallbackOtp || generatedOtp;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    let user = await this.userRepo.findOne({ where: { phone } });
    if (!user) {
      const sanitizedPhone = phone.replace(/[^0-9]/g, '');
      const tempEmail = `phone_${sanitizedPhone || Date.now()}@gzura.mobile`;
      user = this.userRepo.create({
        phone,
        email: tempEmail,
        firstName: 'Mobile',
        lastName: 'User',
        role: Role.MEMBER,
      });
    }

    user.otpCode = otpCode;
    user.otpExpiresAt = expiresAt;
    await this.userRepo.save(user);

    await this.smsService.sendOtp(phone, otpCode);

    return {
      message: 'OTP sent successfully',
      phone,
      ...(fallbackOtp ? { devOtp: fallbackOtp } : {}),
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const phone = dto.phone.trim();
    const otpInput = dto.otp.trim();
    const fallbackOtp = this.smsService.getFallbackOtp();

    const user = await this.userRepo.findOne({ where: { phone } });
    if (!user) {
      throw new UnauthorizedException('Invalid phone number or OTP');
    }

    if (user.status === UserStatus.BLOCKED) {
      throw new UnauthorizedException('Account is blocked');
    }

    const isValidFallback = fallbackOtp && otpInput === fallbackOtp;
    const isValidStoredOtp =
      user.otpCode === otpInput &&
      user.otpExpiresAt &&
      new Date() < new Date(user.otpExpiresAt);

    let isTwilioVerified = false;
    if (!isValidFallback && !isValidStoredOtp) {
      isTwilioVerified = await this.smsService.verifyOtp(phone, otpInput);
    }

    if (!isValidFallback && !isValidStoredOtp && !isTwilioVerified) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    user.otpCode = null;
    user.otpExpiresAt = null;
    user.lastLoginAt = new Date();

    if (dto.firstName) user.firstName = dto.firstName;
    if (dto.lastName) user.lastName = dto.lastName;
    if (dto.email && (user.email.endsWith('@gzura.mobile') || dto.email !== user.email)) {
      const existingEmail = await this.userRepo.findOne({ where: { email: dto.email } });
      if (!existingEmail || existingEmail.id === user.id) {
        user.email = dto.email;
      }
    }

    await this.userRepo.save(user);

    return this.buildAuthResponse(user);
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