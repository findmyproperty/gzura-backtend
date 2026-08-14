import { IsOptional, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  currentPassword?: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;
}
