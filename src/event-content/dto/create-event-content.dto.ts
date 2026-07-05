import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  ValidateIf,
} from 'class-validator';
import { EventContentType } from '../../common/enums/event-content-type.enum';

export class CreateEventContentDto {
  @IsString()
  title!: string;

  @IsEnum(EventContentType)
  contentType!: EventContentType;

  @ValidateIf((dto: CreateEventContentDto) => dto.contentType === EventContentType.TEXT)
  @IsString()
  textContent?: string;

  @ValidateIf((dto: CreateEventContentDto) => dto.contentType !== EventContentType.TEXT)
  @IsUrl()
  fileUrl?: string;

  @ValidateIf((dto: CreateEventContentDto) => dto.contentType !== EventContentType.TEXT)
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
