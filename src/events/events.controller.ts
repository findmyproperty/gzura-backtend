import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';

import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@Controller('events')
export class EventsController {
  constructor(private eventsService: EventsService) {}

  @Get()
  findAll(@Query('all') all?: string) {
    return this.eventsService.findAll(all !== 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Query('all') all?: string) {
    return this.eventsService.findOne(id, all !== 'true');
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.HOST)
  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateEventDto,
  ) {
    const isAdmin = user?.role === Role.ADMIN;
    return this.eventsService.create(dto, isAdmin);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id/approve')
  approve(@Param('id') id: string) {
    return this.eventsService.approveEvent(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id/reject')
  reject(@Param('id') id: string, @Body('reason') reason: string) {
    return this.eventsService.rejectEvent(id, reason);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.HOST)
  @Patch(':id/resubmit')
  resubmit(@Param('id') id: string, @Body() dto?: UpdateEventDto) {
    return this.eventsService.resubmitEvent(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.HOST)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEventDto) {
    return this.eventsService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.HOST)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.eventsService.remove(id);
  }
}