import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { EventFormat } from '../../common/enums/event-format.enum';
import { EventStatus } from '../../common/enums/event-status.enum';
import {
  MAX_EVENT_ATTENDEES,
  MAX_EVENT_PRICE,
} from './create-event.dto';

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(EventFormat)
  type?: EventFormat;

  @IsOptional()
  @IsDateString()
  dateStart?: string;

  @IsOptional()
  @IsDateString()
  dateEnd?: string;

  @IsOptional()
  @IsString()
  timeLabel?: string;

  @IsOptional()
  @IsString()
  location?: string;

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
  hostId?: string | null;

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

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(MAX_EVENT_PRICE)
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(MAX_EVENT_PRICE)
  memberPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(MAX_EVENT_ATTENDEES)
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

  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @IsOptional()
  @IsString()
  resubmissionComment?: string;

  @IsOptional()
  @IsBoolean()
  approvePendingChanges?: boolean;

  @IsOptional()
  @IsBoolean()
  rejectPendingChanges?: boolean;
}
