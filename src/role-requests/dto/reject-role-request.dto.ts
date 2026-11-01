import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectRoleRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNote?: string;
}
