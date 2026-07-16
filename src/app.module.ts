import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CommunityRegistrationsModule } from './community-registrations/community-registrations.module';
import { ContactModule } from './contact/contact.module';
import { getTypeOrmConfig } from './database/typeorm.config';
import { EventContentModule } from './event-content/event-content.module';
import { EventsModule } from './events/events.module';
import { GeocodingModule } from './geocoding/geocoding.module';
import { HealthModule } from './health/health.module';
import { PaymentsModule } from './payments/payments.module';
import { RegistrationsModule } from './registrations/registrations.module';
import { UsersModule } from './users/users.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: getTypeOrmConfig,
    }),
    AuthModule,
    AdminModule,
    EventsModule,
    EventContentModule,
    GeocodingModule,
    HealthModule,
    RegistrationsModule,
    PaymentsModule,
    CommunityRegistrationsModule,
    UsersModule,
    ContactModule,
    UploadsModule,
  ],
})
export class AppModule {}