import { IsIn, IsString } from 'class-validator';

export class MeetPingDto {
  @IsString()
  eventId!: string;

  @IsIn(['JOIN', 'LEAVE'])
  action!: 'JOIN' | 'LEAVE';
}
