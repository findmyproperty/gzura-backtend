import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';

async function ensureCourseOutlineColumn(app: NestExpressApplication) {
  const dataSource = app.get(DataSource);
  const rows = await dataSource.query(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'events'
        AND column_name = 'course_outline'
    `,
  );

  const count = Number(rows?.[0]?.count ?? 0);
  if (count > 0) return;

  await dataSource.query(
    'ALTER TABLE events ADD COLUMN course_outline TEXT NULL AFTER speaker_bio',
  );
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const uploadDir =
    process.env.UPLOAD_LOCAL_DIR || join(process.cwd(), 'uploads', 'events');
  const contentUploadDir =
    process.env.UPLOAD_CONTENT_LOCAL_DIR ||
    join(process.cwd(), 'uploads', 'event-content');
  if (!existsSync(uploadDir)) {
    mkdirSync(uploadDir, { recursive: true });
  }
  if (!existsSync(contentUploadDir)) {
    mkdirSync(contentUploadDir, { recursive: true });
  }
  app.useStaticAssets(uploadDir, { prefix: '/uploads/events' });
  app.useStaticAssets(contentUploadDir, { prefix: '/uploads/event-content' });

  const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3001')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await ensureCourseOutlineColumn(app);

  const port = process.env.PORT || 8001;
  await app.listen(port);
  console.log(`GZURA API running on http://localhost:${port}`);
}

bootstrap();
