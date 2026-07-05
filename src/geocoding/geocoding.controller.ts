import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { GeocodingService } from './geocoding.service';

@Controller('geocoding')
export class GeocodingController {
  constructor(private readonly geocodingService: GeocodingService) {}

  @Get('search')
  search(
    @Query('q') query = '',
    @Query('limit') limit?: string,
    @Query('lat') lat?: string,
    @Query('lon') lon?: string,
  ) {
    const parsedLimit = limit ? Number(limit) : 5;
    const latitude = lat != null ? Number(lat) : undefined;
    const longitude = lon != null ? Number(lon) : undefined;
    const bias =
      latitude != null &&
      longitude != null &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude)
        ? { lat: latitude, lon: longitude }
        : undefined;

    return this.geocodingService.search(query, parsedLimit, bias);
  }

  @Get('reverse')
  reverse(
    @Query('lat') lat?: string,
    @Query('lon') lon?: string,
  ) {
    const latitude = Number(lat);
    const longitude = Number(lon);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new BadRequestException('Valid latitude and longitude are required');
    }

    return this.geocodingService.reverse(latitude, longitude);
  }
}