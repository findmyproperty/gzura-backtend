import { IsUUID } from 'class-validator';

export class MarkAttendedDto {
  @IsUUID()
  eventId!: string;
}
