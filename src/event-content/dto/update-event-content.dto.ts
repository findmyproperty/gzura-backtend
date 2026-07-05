import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateEventContentDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  textContent?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
