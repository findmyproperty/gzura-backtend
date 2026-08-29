import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateRoleRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}
