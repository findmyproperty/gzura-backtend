import { IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { CommunityRegistrationStatus } from '../../common/enums/community-registration-status.enum';

export class UpdateCommunityRegistrationDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

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

  @IsOptional()
  @IsEnum(CommunityRegistrationStatus)
  status?: CommunityRegistrationStatus;
}