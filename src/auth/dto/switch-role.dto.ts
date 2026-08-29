import { IsIn } from 'class-validator';
import { Role } from '../../common/enums/role.enum';

export class SwitchRoleDto {
  @IsIn([Role.MEMBER, Role.HOST])
  role!: Role.MEMBER | Role.HOST;
}
