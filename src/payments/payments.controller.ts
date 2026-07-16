import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { CreateOrderDto } from './dto/create-order.dto';
import { VerifyRazorpayDto } from './dto/verify-razorpay.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('razorpay/order')
  createOrder(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.paymentsService.createOrder(dto.eventId, user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('razorpay/verify')
  verifyPayment(
    @Body() dto: VerifyRazorpayDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.paymentsService.verifyPayment(user.sub, dto);
  }
}