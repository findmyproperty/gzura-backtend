import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class ValidatePassDto {
  @IsString()
  @MinLength(8)
  accessToken!: string;

  @IsOptional()
  @IsUUID()
  eventId?: string;
}