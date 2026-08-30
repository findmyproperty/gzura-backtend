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
import { MarkAttendedDto } from './dto/mark-attended.dto';
import { JoinEventDto } from './dto/join-event.dto';
import { ValidatePassDto } from './dto/validate-pass.dto';
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
  @Post('join')
  join(@Body() dto: JoinEventDto, @CurrentUser() user: JwtPayload) {
    return this.registrationsService.joinEventByUserId(dto.eventId, user.sub);
  }

  @Post('validate-pass')
  validatePass(@Body() dto: ValidatePassDto) {
    return this.registrationsService.validatePass(dto.accessToken);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.HOST)
  @Post('check-in')
  checkIn(@Body() dto: ValidatePassDto, @CurrentUser() user: JwtPayload) {
    return this.registrationsService.checkInPass(
      dto.accessToken,
      user,
      dto.eventId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('mark-attended')
  markAttended(@Body() dto: MarkAttendedDto, @CurrentUser() user: JwtPayload) {
    return this.registrationsService.markAttended(dto.eventId, user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my')
  findMine(@CurrentUser() user: JwtPayload) {
    return this.registrationsService.findMyRegistrations(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my/invoices')
  findMyInvoices(@CurrentUser() user: JwtPayload) {
    return this.registrationsService.findMyInvoices(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my/invoices/:id')
  findMyInvoice(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.registrationsService.findMyInvoice(user.sub, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.HOST)
  @Get()
  findAll(
    @Query('eventId') eventId?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.registrationsService.findAll(eventId, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.registrationsService.findOne(id);
  }
}