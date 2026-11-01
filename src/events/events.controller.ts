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
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { EventStatus } from '../common/enums/event-status.enum';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';

import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@Controller('events')
export class EventsController {
  constructor(private eventsService: EventsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  findAll(@Query('all') all?: string, @Request() req?: any) {
    const fetchAll = all === 'true';

    // Public /events API: only published
    if (!fetchAll) {
      return this.eventsService.findAll(true);
    }

    // /events?all=true API: needs authorization
    if (!req?.user) {
      throw new UnauthorizedException('Must be logged in to fetch all events');
    }

    if (req.user.role === Role.ADMIN) {
      return this.eventsService.findAll(false);
    } else if (req.user.role === Role.HOST) {
      return this.eventsService.findAll(false, req.user.sub);
    } else {
      throw new UnauthorizedException('Not authorized to view all events');
    }
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  async findOne(@Param('id') id: string, @Query('all') all?: string, @Request() req?: any) {
    const fetchAll = all === 'true';

    // Public API: only published
    if (!fetchAll) {
      return this.eventsService.findOne(id, true);
    }

    // /events/:id?all=true API: needs authorization
    if (!req?.user) {
      throw new UnauthorizedException('Must be logged in to fetch unpublished event');
    }

    const event = await this.eventsService.findOne(id, false);
    if (!event) {
      return event;
    }

    if (req.user.role === Role.ADMIN) {
      return event;
    } else if (req.user.role === Role.HOST) {
      if (!(await this.eventsService.hostOwnsEvent(event, req.user.sub))) {
        throw new UnauthorizedException('Not authorized to view this event');
      }
      return event;
    } else {
      throw new UnauthorizedException('Not authorized to view unpublished events');
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.HOST)
  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateEventDto,
  ) {
    if (user?.role === Role.HOST) {
      dto.hostId = user.sub;
      if (dto.status === EventStatus.PUBLISHED || dto.status === EventStatus.REJECTED) {
        dto.status = EventStatus.PENDING_APPROVAL;
      }
    }
    return this.eventsService.create(dto, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.eventsService.approveEvent(id, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id/reject')
  reject(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.eventsService.rejectEvent(id, reason, user);
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
  update(@Param('id') id: string, @Body() dto: UpdateEventDto, @Request() req: any) {
    return this.eventsService.update(id, dto, req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.HOST)
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.eventsService.remove(id, req.user);
  }
}