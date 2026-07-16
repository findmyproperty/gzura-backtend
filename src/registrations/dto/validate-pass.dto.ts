import { IsString, MinLength } from 'class-validator';

export class ValidatePassDto {
  @IsString()
  @MinLength(8)
  accessToken!: string;
}