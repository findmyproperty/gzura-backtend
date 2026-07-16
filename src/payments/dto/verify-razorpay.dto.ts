import { IsString, IsUUID } from 'class-validator';

export class VerifyRazorpayDto {
  @IsUUID()
  eventId!: string;

  @IsString()
  razorpayOrderId!: string;

  @IsString()
  razorpayPaymentId!: string;

  @IsString()
  razorpaySignature!: string;
}