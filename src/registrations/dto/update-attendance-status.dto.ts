import { IsIn } from 'class-validator';

export class UpdateAttendanceStatusDto {
  @IsIn(['present', 'absent'])
  status!: 'present' | 'absent';
}
