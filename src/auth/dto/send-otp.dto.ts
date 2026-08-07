import { IsNotEmpty, IsString } from 'class-validator';

export class SendOtpDto {
  @IsString()
  @IsNotEmpty()
  phone!: string;
}
