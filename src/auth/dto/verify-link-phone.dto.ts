import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyLinkPhoneDto {
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @IsNotEmpty()
  otp!: string;
}
