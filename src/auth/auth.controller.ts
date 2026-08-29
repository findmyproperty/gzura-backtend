import { Body, Controller, Delete, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from './auth.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { VerifyLinkPhoneDto } from './dto/verify-link-phone.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('send-otp')
  sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto);
  }

  @Post('verify-otp')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Post('google')
  googleLogin(@Body() dto: GoogleAuthDto) {
    return this.authService.loginWithGoogle(dto.credential);
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('admin/login')
  adminLogin(@Body() dto: LoginDto) {
    return this.authService.login(dto, true);
  }

  @UseGuards(JwtAuthGuard)
  @Post('refresh')
  refresh(@CurrentUser() user: JwtPayload) {
    return this.authService.refreshSession(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.getProfile(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/password')
  changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/phone/send-otp')
  sendLinkPhoneOtp(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SendOtpDto,
  ) {
    return this.authService.sendLinkPhoneOtp(user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/phone/verify')
  verifyLinkPhone(
    @CurrentUser() user: JwtPayload,
    @Body() dto: VerifyLinkPhoneDto,
  ) {
    return this.authService.verifyLinkPhone(user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me/phone')
  unlinkPhone(@CurrentUser() user: JwtPayload) {
    return this.authService.unlinkPhone(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('onboarding')
  completeOnboarding(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CompleteOnboardingDto,
  ) {
    return this.authService.completeOnboarding(user.sub, dto);
  }
}