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
import { createHash, randomBytes } from 'crypto';
import { google } from 'googleapis';
import { In, Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { UserStatus } from '../common/enums/user-status.enum';
import {
  normalizePhone,
  phoneLookupVariants,
} from '../common/utils/phone.util';
import { EventRegistration } from '../entities/event-registration.entity';
import { User } from '../entities/user.entity';
import { MailService } from '../integrations/mail.service';
import { SmsService } from '../integrations/sms.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { VerifyLinkPhoneDto } from './dto/verify-link-phone.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(EventRegistration)
    private registrationRepo: Repository<EventRegistration>,
    private jwtService: JwtService,
    private config: ConfigService,
    private smsService: SmsService,
    private mailService: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.userRepo.findOne({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const phone = dto.phone?.trim()
      ? this.requireNormalizedPhone(dto.phone)
      : null;

    if (phone) {
      const existingPhone = await this.findUserByPhone(phone);
      if (existingPhone) {
        throw new ConflictException(
          'This mobile number is already linked to another account',
        );
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = this.userRepo.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone,
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
        avatarUrl: true,
        passwordHash: true,
        onboardingGoal: true,
        onboardingInterests: true,
        onboardingCompletedAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.toPublicProfile(user);
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
      payload = await this.getGoogleUserInfo(credential);
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

  private async getGoogleUserInfo(accessToken: string) {
    const response = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!response.ok) {
      throw new UnauthorizedException('Invalid Google sign-in token');
    }

    const data = (await response.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      given_name?: string;
      family_name?: string;
      name?: string;
    };

    return data;
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
    const phone = this.requireNormalizedPhone(dto.phone);

    const fallbackOtp = this.smsService.getFallbackOtp();
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpCode = fallbackOtp || generatedOtp;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    let user = await this.findUserByPhone(phone);
    if (!user) {
      const sanitizedPhone = phone.replace(/\D/g, '');
      const tempEmail = `phone_${sanitizedPhone || Date.now()}@gzura.mobile`;
      user = this.userRepo.create({
        phone,
        email: tempEmail,
        firstName: 'Mobile',
        lastName: 'User',
        role: Role.MEMBER,
      });
    } else {
      user.phone = phone;
      await this.releaseStubPhones(user.id, phone);
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
    const phone = this.requireNormalizedPhone(dto.phone);
    const otpInput = dto.otp.trim();

    const user = await this.findUserByPhone(phone);
    if (!user) {
      throw new UnauthorizedException('Invalid phone number or OTP');
    }

    if (user.status === UserStatus.BLOCKED) {
      throw new UnauthorizedException('Account is blocked');
    }

    await this.assertValidOtp(user, phone, otpInput);

    user.otpCode = null;
    user.otpExpiresAt = null;
    user.pendingPhone = null;
    user.lastLoginAt = new Date();
    user.phone = phone;

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

  async sendLinkPhoneOtp(userId: string, dto: SendOtpDto) {
    const phone = this.requireNormalizedPhone(dto.phone);
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const existing = await this.findUserByPhone(phone);
    if (existing && existing.id !== user.id) {
      throw new ConflictException(
        'This mobile number is already linked to another account',
      );
    }

    if (existing?.id === user.id) {
      throw new BadRequestException(
        'This mobile number is already linked to your account',
      );
    }

    const fallbackOtp = this.smsService.getFallbackOtp();
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpCode = fallbackOtp || generatedOtp;

    user.pendingPhone = phone;
    user.otpCode = otpCode;
    user.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.userRepo.save(user);

    await this.smsService.sendOtp(phone, otpCode);

    return {
      message: 'OTP sent successfully',
      phone,
      ...(fallbackOtp ? { devOtp: fallbackOtp } : {}),
    };
  }

  async verifyLinkPhone(userId: string, dto: VerifyLinkPhoneDto) {
    const phone = this.requireNormalizedPhone(dto.phone);
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const pending = user.pendingPhone ? normalizePhone(user.pendingPhone) : '';
    if (!pending || pending !== phone) {
      throw new BadRequestException(
        'Request a verification code for this number first',
      );
    }

    await this.assertValidOtp(user, phone, dto.otp.trim());

    const existing = await this.findUserByPhone(phone);
    if (existing && existing.id !== user.id) {
      throw new ConflictException(
        'This mobile number is already linked to another account',
      );
    }

    user.phone = phone;
    user.pendingPhone = null;
    user.otpCode = null;
    user.otpExpiresAt = null;
    await this.userRepo.save(user);

    return this.buildAuthResponse(user);
  }

  async unlinkPhone(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.phone) {
      throw new BadRequestException('No mobile number is linked');
    }

    user.phone = null;
    user.pendingPhone = null;
    user.otpCode = null;
    user.otpExpiresAt = null;
    await this.userRepo.save(user);

    return this.buildAuthResponse(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const nextEmail = dto.email?.trim().toLowerCase();
    if (nextEmail && nextEmail !== user.email) {
      const existing = await this.userRepo.findOne({
        where: { email: nextEmail },
      });
      if (existing) {
        throw new ConflictException('Email already in use');
      }
      user.email = nextEmail;
    }

    if (dto.firstName !== undefined) {
      const firstName = dto.firstName.trim();
      if (!firstName) {
        throw new BadRequestException('First name is required');
      }
      user.firstName = firstName;
    }

    if (dto.lastName !== undefined) user.lastName = dto.lastName.trim();
    if (dto.phone !== undefined) {
      const nextPhone = dto.phone.trim()
        ? this.requireNormalizedPhone(dto.phone)
        : null;
      if (nextPhone) {
        const existingPhone = await this.findUserByPhone(nextPhone);
        if (existingPhone && existingPhone.id !== user.id) {
          throw new ConflictException(
            'This mobile number is already linked to another account',
          );
        }
      }
      user.phone = nextPhone;
    }
    if (dto.city !== undefined) user.city = dto.city.trim() || null;
    if (dto.profession !== undefined) {
      user.profession = dto.profession.trim() || null;
    }
    if (dto.avatarUrl !== undefined) {
      user.avatarUrl = dto.avatarUrl.trim() || null;
    }

    await this.userRepo.save(user);

    await this.registrationRepo.update(
      { userId: user.id },
      {
        email: user.email,
        fullName: `${user.firstName} ${user.lastName}`.trim(),
      },
    );

    const profile = await this.getProfile(user.id);
    return {
      accessToken: this.jwtService.sign({
        sub: profile.id,
        email: profile.email,
        role: profile.role,
      }),
      user: profile,
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isStaff = user.role === Role.ADMIN || user.role === Role.HOST;

    if (!user.passwordHash) {
      if (!isStaff) {
        throw new BadRequestException(
          'Password is managed by your sign-in provider',
        );
      }
      user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
      await this.userRepo.save(user);
      return { success: true };
    }

    if (!dto.currentPassword) {
      throw new BadRequestException('Current password is required');
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepo.save(user);

    return { success: true };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const genericResponse = {
      message:
        'If an account exists, we sent a reset link by email and SMS where those details are on file.',
    };

    const user = await this.findUserForPasswordReset(dto.identifier);
    if (!user || user.status === UserStatus.BLOCKED) {
      return genericResponse;
    }

    const rawToken = randomBytes(32).toString('hex');
    user.passwordResetToken = this.hashResetToken(rawToken);
    user.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await this.userRepo.save(user);

    const resetUrl = `${this.getFrontendUrl()}/reset-password?token=${rawToken}`;
    const channels: string[] = [];

    if (this.isDeliverableEmail(user.email)) {
      const emailSent = await this.mailService.sendPasswordResetEmail({
        email: user.email,
        firstName: user.firstName,
        resetUrl,
      });
      if (emailSent) channels.push('email');
    }

    if (user.phone) {
      const smsSent = await this.smsService.sendMessage(
        user.phone,
        `GZURA: Reset your password (expires in 1 hour): ${resetUrl}`,
      );
      if (smsSent) channels.push('sms');
    }

    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    if (!isProduction && channels.length === 0) {
      return { ...genericResponse, devResetUrl: resetUrl };
    }

    return genericResponse;
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = this.hashResetToken(dto.token);
    const user = await this.userRepo.findOne({
      where: { passwordResetToken: tokenHash },
    });

    if (
      !user ||
      !user.passwordResetExpiresAt ||
      new Date() > new Date(user.passwordResetExpiresAt)
    ) {
      throw new BadRequestException(
        'This reset link is invalid or has expired. Please request a new one.',
      );
    }

    if (user.status === UserStatus.BLOCKED) {
      throw new UnauthorizedException('Account is blocked');
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    user.passwordResetToken = null;
    user.passwordResetExpiresAt = null;
    await this.userRepo.save(user);

    return { success: true, message: 'Password updated. You can sign in now.' };
  }

  private hashResetToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private getFrontendUrl(): string {
    const configured = this.config.get<string>('FRONTEND_URL')?.trim();
    if (configured) return configured.replace(/\/$/, '');

    const corsOrigin = this.config.get<string>('CORS_ORIGIN') || '';
    const firstOrigin = corsOrigin.split(',').map((value) => value.trim())[0];
    return (firstOrigin || 'http://localhost:3000').replace(/\/$/, '');
  }

  private isDeliverableEmail(email?: string | null): boolean {
    return Boolean(email && !email.endsWith('@gzura.mobile'));
  }

  private async findUserForPasswordReset(identifier: string): Promise<User | null> {
    if (identifier.includes('@')) {
      return this.userRepo.findOne({
        where: { email: identifier.toLowerCase() },
      });
    }

    const normalized = normalizePhone(identifier);
    if (!normalized) return null;
    return this.findUserByPhone(normalized);
  }

  private requireNormalizedPhone(phone: string): string {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      throw new BadRequestException('Enter a valid mobile number');
    }
    return normalized;
  }

  private async findUserByPhone(phone: string): Promise<User | null> {
    const variants = phoneLookupVariants(phone);
    if (variants.length === 0) return null;

    const users = await this.userRepo.find({
      where: { phone: In(variants) },
    });

    return this.pickUserForPhone(users);
  }

  private pickUserForPhone(users: User[]): User | null {
    if (users.length === 0) return null;

    const roleRank = (role: Role) => {
      if (role === Role.ADMIN) return 0;
      if (role === Role.HOST) return 1;
      return 2;
    };

    return [...users].sort((a, b) => {
      const aStub = a.email.endsWith('@gzura.mobile') ? 1 : 0;
      const bStub = b.email.endsWith('@gzura.mobile') ? 1 : 0;
      if (aStub !== bStub) return aStub - bStub;
      return roleRank(a.role) - roleRank(b.role);
    })[0];
  }

  private async releaseStubPhones(keepUserId: string, phone: string) {
    const variants = phoneLookupVariants(phone);
    if (variants.length === 0) return;

    const users = await this.userRepo.find({
      where: { phone: In(variants) },
    });

    for (const other of users) {
      if (other.id === keepUserId) continue;
      if (!other.email.endsWith('@gzura.mobile')) continue;
      other.phone = null;
      other.otpCode = null;
      other.otpExpiresAt = null;
      await this.userRepo.save(other);
    }
  }

  private async assertValidOtp(user: User, phone: string, otpInput: string) {
    const fallbackOtp = this.smsService.getFallbackOtp();
    const isValidFallback = Boolean(fallbackOtp && otpInput === fallbackOtp);
    const isValidStoredOtp = Boolean(
      user.otpCode === otpInput &&
        user.otpExpiresAt &&
        new Date() < new Date(user.otpExpiresAt),
    );

    let isTwilioVerified = false;
    if (!isValidFallback && !isValidStoredOtp) {
      isTwilioVerified = await this.smsService.verifyOtp(phone, otpInput);
    }

    if (!isValidFallback && !isValidStoredOtp && !isTwilioVerified) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }
  }

  private toPublicProfile(user: {
    id: string;
    email: string;
    role: Role;
    firstName: string;
    lastName: string;
    phone?: string | null;
    city?: string | null;
    profession?: string | null;
    avatarUrl?: string | null;
    passwordHash?: string | null;
    onboardingGoal?: string | null;
    onboardingInterests?: string[] | null;
    onboardingCompletedAt?: Date | null;
    createdAt?: Date;
  }) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone ?? null,
      city: user.city ?? null,
      profession: user.profession ?? null,
      avatarUrl: user.avatarUrl ?? null,
      hasPassword: Boolean(user.passwordHash),
      onboardingGoal: user.onboardingGoal ?? null,
      onboardingInterests: user.onboardingInterests ?? null,
      onboardingCompletedAt: user.onboardingCompletedAt
        ? user.onboardingCompletedAt.toISOString()
        : null,
      createdAt: user.createdAt,
    };
  }

  private buildAuthResponse(user: {
    id: string;
    email: string;
    role: Role;
    firstName: string;
    lastName: string;
    phone?: string | null;
    city?: string | null;
    profession?: string | null;
    avatarUrl?: string | null;
    passwordHash?: string | null;
    onboardingGoal?: string | null;
    onboardingInterests?: string[] | null;
    onboardingCompletedAt?: Date | null;
  }) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: this.toPublicProfile(user),
    };
  }
}