import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateContactDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @ValidateIf((_, value) => value != null && String(value).trim() !== '')
  @IsString()
  @MinLength(10)
  @MaxLength(20)
  phone?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  subject!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(5000)
  message!: string;
}
