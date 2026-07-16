import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';

async function ensureGoogleAuthColumns(app: NestExpressApplication) {
  const dataSource = app.get(DataSource);

  const passwordRows = await dataSource.query(
    `
      SELECT IS_NULLABLE AS nullable
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'users'
        AND column_name = 'password_hash'
    `,
  );

  if (passwordRows?.[0]?.nullable === 'NO') {
    await dataSource.query(
      'ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL',
    );
  }

  const googleIdRows = await dataSource.query(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'users'
        AND column_name = 'google_id'
    `,
  );

  const googleIdCount = Number(googleIdRows?.[0]?.count ?? 0);
  if (googleIdCount === 0) {
    await dataSource.query(
      'ALTER TABLE users ADD COLUMN google_id VARCHAR(255) NULL UNIQUE AFTER password_hash',
    );
  }
}

async function ensureRegistrationPassColumns(app: NestExpressApplication) {
  const dataSource = app.get(DataSource);

  const columns = [
    { name: 'access_token', sql: 'VARCHAR(64) NULL UNIQUE' },
    { name: 'payment_status', sql: "ENUM('FREE','PENDING','PAID') NOT NULL DEFAULT 'FREE'" },
    { name: 'amount_paid', sql: 'DECIMAL(10,2) NULL' },
    { name: 'razorpay_order_id', sql: 'VARCHAR(255) NULL' },
    { name: 'razorpay_payment_id', sql: 'VARCHAR(255) NULL' },
    { name: 'checked_in_at', sql: 'DATETIME NULL' },
  ];

  for (const column of columns) {
    const rows = await dataSource.query(
      `
        SELECT COUNT(*) AS count
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'event_registrations'
          AND column_name = ?
      `,
      [column.name],
    );

    if (Number(rows?.[0]?.count ?? 0) === 0) {
      await dataSource.query(
        `ALTER TABLE event_registrations ADD COLUMN ${column.name} ${column.sql}`,
      );
    }
  }

  const missingTokens = await dataSource.query(
    `
      SELECT id
      FROM event_registrations
      WHERE access_token IS NULL OR access_token = ''
    `,
  );

  for (const row of missingTokens) {
    const token = randomBytes(24).toString('hex');
    await dataSource.query(
      'UPDATE event_registrations SET access_token = ? WHERE id = ?',
      [token, row.id],
    );
  }

  const tokenNullable = await dataSource.query(
    `
      SELECT IS_NULLABLE AS nullable
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'event_registrations'
        AND column_name = 'access_token'
    `,
  );

  if (tokenNullable?.[0]?.nullable === 'YES') {
    await dataSource.query(
      'ALTER TABLE event_registrations MODIFY COLUMN access_token VARCHAR(64) NOT NULL',
    );
  }
}

async function ensureHostIdColumn(app: NestExpressApplication) {
  const dataSource = app.get(DataSource);
  const rows = await dataSource.query(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'events'
        AND column_name = 'host_id'
    `,
  );

  const count = Number(rows?.[0]?.count ?? 0);
  if (count > 0) return;

  await dataSource.query(
    'ALTER TABLE events ADD COLUMN host_id VARCHAR(36) NULL AFTER speaker_bio',
  );
  await dataSource.query(
    'ALTER TABLE events ADD CONSTRAINT events_host_id_fkey FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE SET NULL',
  );
}

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
    origin: ['http://localhost:3001', 'https://api.theybdc.com', 'https://gzura.com'],
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
  await ensureHostIdColumn(app);
  await ensureGoogleAuthColumns(app);
  await ensureRegistrationPassColumns(app);

  const port = 8001;
  await app.listen(port);
  console.log(`GZURA API running on http://localhost:${port}`);
}

bootstrap();
