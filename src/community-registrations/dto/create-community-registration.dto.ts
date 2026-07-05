import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCommunityRegistrationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  gender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  profession?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  interest?: string;

  @IsOptional()
  @IsString()
  message?: string;
}