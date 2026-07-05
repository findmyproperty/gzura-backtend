import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateEventContentDto } from './dto/create-event-content.dto';
import { UpdateEventContentDto } from './dto/update-event-content.dto';
import { EventContentService } from './event-content.service';

@Controller('events/:eventId/content')
export class EventContentController {
  constructor(private eventContentService: EventContentService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(
    @Param('eventId') eventId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.eventContentService.findByEvent(
      eventId,
      user.sub,
      user.role as Role,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  create(
    @Param('eventId') eventId: string,
    @Body() dto: CreateEventContentDto,
  ) {
    return this.eventContentService.create(eventId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id')
  update(
    @Param('eventId') eventId: string,
    @Param('id') id: string,
    @Body() dto: UpdateEventContentDto,
  ) {
    return this.eventContentService.update(eventId, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('eventId') eventId: string, @Param('id') id: string) {
    return this.eventContentService.remove(eventId, id);
  }
}
