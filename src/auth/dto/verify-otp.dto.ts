import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @IsNotEmpty()
  otp!: string;

  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  email?: string;
}
