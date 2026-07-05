import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from './auth.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

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

  @Post('admin/login')
  adminLogin(@Body() dto: LoginDto) {
    return this.authService.login(dto, true);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.getProfile(user.sub);
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