import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GeocodingController } from './geocoding.controller';
import { GeocodingService } from './geocoding.service';

@Module({
  imports: [ConfigModule],
  controllers: [GeocodingController],
  providers: [GeocodingService],
  exports: [GeocodingService],
})
export class GeocodingModule {}