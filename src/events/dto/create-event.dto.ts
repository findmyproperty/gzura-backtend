import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { EventFormat } from '../../common/enums/event-format.enum';
import { EventStatus } from '../../common/enums/event-status.enum';

export class CreateEventDto {
  @IsString()
  title!: string;

  @IsString()
  slug!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(EventFormat)
  type!: EventFormat;

  @IsDateString()
  dateStart!: string;

  @IsOptional()
  @IsDateString()
  dateEnd?: string;

  @IsOptional()
  @IsString()
  timeLabel?: string;

  @IsString()
  location!: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsString()
  venue?: string;

  @IsOptional()
  @IsString()
  speakerName?: string;

  @IsOptional()
  @IsString()
  speakerBio?: string;

  @IsOptional()
  @IsUUID()
  hostId?: string;

  @IsOptional()
  @IsString()
  courseOutline?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  galleryImages?: string[];

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  memberPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxAttendees?: number;

  @IsOptional()
  @IsString()
  meetingLink?: string;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;
}
