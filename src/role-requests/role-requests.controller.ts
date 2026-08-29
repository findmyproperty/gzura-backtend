import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RoleRequestStatus } from '../common/enums/role-request-status.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateRoleRequestDto } from './dto/create-role-request.dto';
import { RejectRoleRequestDto } from './dto/reject-role-request.dto';
import { RoleRequestsService } from './role-requests.service';

@Controller('role-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RoleRequestsController {
  constructor(private roleRequestsService: RoleRequestsService) {}

  @Get('me')
  @Roles(Role.MEMBER, Role.HOST)
  findMine(@CurrentUser() user: JwtPayload) {
    return this.roleRequestsService.findMine(user.sub).then((request) => ({ request }));
  }

  @Get()
  @Roles(Role.ADMIN)
  findAll(@Query('status') status?: RoleRequestStatus) {
    return this.roleRequestsService.findAll(status);
  }

  @Post()
  @Roles(Role.MEMBER)
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateRoleRequestDto,
  ) {
    return this.roleRequestsService.create(user.sub, dto);
  }

  @Patch(':id/approve')
  @Roles(Role.ADMIN)
  approve(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.roleRequestsService.approve(id, user.sub);
  }

  @Patch(':id/reject')
  @Roles(Role.ADMIN)
  reject(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: RejectRoleRequestDto,
  ) {
    return this.roleRequestsService.reject(id, user.sub, dto);
  }
}
