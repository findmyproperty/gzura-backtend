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
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CommunityRegistrationsService } from './community-registrations.service';
import { CreateCommunityRegistrationDto } from './dto/create-community-registration.dto';
import { UpdateCommunityRegistrationDto } from './dto/update-community-registration.dto';

@Controller('community-registrations')
export class CommunityRegistrationsController {
  constructor(
    private communityRegistrationsService: CommunityRegistrationsService,
  ) {}

  @Post()
  create(@Body() dto: CreateCommunityRegistrationDto) {
    return this.communityRegistrationsService.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get()
  findAll() {
    return this.communityRegistrationsService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.communityRegistrationsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCommunityRegistrationDto,
  ) {
    return this.communityRegistrationsService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.communityRegistrationsService.remove(id);
  }
}