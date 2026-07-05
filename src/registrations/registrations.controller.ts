import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateRegistrationDto } from './dto/create-registration.dto';
import { RegistrationsService } from './registrations.service';

@Controller('registrations')
export class RegistrationsController {
  constructor(private registrationsService: RegistrationsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Post()
  create(
    @Body() dto: CreateRegistrationDto,
    @CurrentUser() user: JwtPayload | null,
  ) {
    return this.registrationsService.create(dto, user?.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my')
  findMine(@CurrentUser() user: JwtPayload) {
    return this.registrationsService.findMyRegistrations(user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get()
  findAll(@Query('eventId') eventId?: string) {
    return this.registrationsService.findAll(eventId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.registrationsService.findOne(id);
  }
}