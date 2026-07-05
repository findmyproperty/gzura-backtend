import { IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateRegistrationDto {
  @IsUUID()
  eventId!: string;

  @IsString()
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  profession?: string;
}