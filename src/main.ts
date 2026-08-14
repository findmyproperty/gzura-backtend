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

async function ensureUserOtpColumns(app: NestExpressApplication) {
  const dataSource = app.get(DataSource);
  const columns = [
    { name: 'otp_code', sql: 'VARCHAR(10) NULL AFTER `phone`' },
    { name: 'otp_expires_at', sql: 'DATETIME NULL AFTER `otp_code`' },
  ];

  for (const column of columns) {
    const rows = await dataSource.query(
      `
        SELECT COUNT(*) AS count
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'users'
          AND column_name = ?
      `,
      [column.name],
    );

    if (Number(rows?.[0]?.count ?? 0) === 0) {
      await dataSource.query(
        `ALTER TABLE users ADD COLUMN ${column.name} ${column.sql}`,
      );
    }
  }
}

async function ensurePendingPhoneColumn(app: NestExpressApplication) {
  const dataSource = app.get(DataSource);
  const rows = await dataSource.query(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'users'
        AND column_name = 'pending_phone'
    `,
  );

  if (Number(rows?.[0]?.count ?? 0) > 0) return;

  await dataSource.query(
    'ALTER TABLE users ADD COLUMN pending_phone VARCHAR(255) NULL AFTER otp_expires_at',
  );
}

async function ensurePasswordResetColumns(app: NestExpressApplication) {
  const dataSource = app.get(DataSource);
  const columns = [
    {
      name: 'password_reset_token',
      sql: 'VARCHAR(64) NULL AFTER `pending_phone`',
    },
    {
      name: 'password_reset_expires_at',
      sql: 'DATETIME NULL AFTER `password_reset_token`',
    },
  ];

  for (const column of columns) {
    const rows = await dataSource.query(
      `
        SELECT COUNT(*) AS count
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'users'
          AND column_name = ?
      `,
      [column.name],
    );

    if (Number(rows?.[0]?.count ?? 0) === 0) {
      await dataSource.query(
        `ALTER TABLE users ADD COLUMN ${column.name} ${column.sql}`,
      );
    }
  }
}

async function ensureRejectionReasonColumn(app: NestExpressApplication) {
  const dataSource = app.get(DataSource);
  const rows = await dataSource.query(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'events'
        AND column_name = 'rejection_reason'
    `,
  );

  if (Number(rows?.[0]?.count ?? 0) > 0) return;

  await dataSource.query(
    'ALTER TABLE events ADD COLUMN rejection_reason TEXT NULL AFTER status',
  );
}

async function ensureEventStatusEnum(app: NestExpressApplication) {
  const dataSource = app.get(DataSource);
  await dataSource.query(
    `ALTER TABLE events
      MODIFY COLUMN status ENUM(
        'DRAFT',
        'PENDING_APPROVAL',
        'APPROVED',
        'REJECTED',
        'RESUBMITTED',
        'PUBLISHED',
        'PENDING'
      ) NOT NULL DEFAULT 'DRAFT'`,
  );
}

async function ensureEventActivityLogsTable(app: NestExpressApplication) {
  const dataSource = app.get(DataSource);
  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS event_activity_logs (
      id VARCHAR(36) NOT NULL,
      event_id VARCHAR(36) NOT NULL,
      action VARCHAR(32) NOT NULL,
      message TEXT NULL,
      actor_id VARCHAR(36) NULL,
      actor_name VARCHAR(255) NULL,
      actor_role VARCHAR(32) NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      INDEX event_activity_logs_event_id_idx (event_id),
      CONSTRAINT event_activity_logs_event_id_fkey
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
}

async function ensureUserAvatarColumn(app: NestExpressApplication) {
  const dataSource = app.get(DataSource);
  const rows = await dataSource.query(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'users'
        AND column_name = 'avatar_url'
    `,
  );

  if (Number(rows?.[0]?.count ?? 0) > 0) return;

  await dataSource.query(
    'ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500) NULL AFTER profession',
  );
}

async function ensureCommunityPreferredColumns(app: NestExpressApplication) {
  const dataSource = app.get(DataSource);
  const columns = [
    { name: 'preferred_date', sql: 'VARCHAR(255) NULL AFTER `message`' },
    { name: 'preferred_time', sql: 'VARCHAR(255) NULL AFTER `preferred_date`' },
  ];

  for (const column of columns) {
    const rows = await dataSource.query(
      `
        SELECT COUNT(*) AS count
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'community_registrations'
          AND column_name = ?
      `,
      [column.name],
    );

    if (Number(rows?.[0]?.count ?? 0) === 0) {
      await dataSource.query(
        `ALTER TABLE community_registrations ADD COLUMN ${column.name} ${column.sql}`,
      );
    }
  }
}

async function ensurePendingChangesColumn(app: NestExpressApplication) {
  const dataSource = app.get(DataSource);
  const rows = await dataSource.query(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'events'
        AND column_name = 'pending_changes'
    `,
  );

  if (Number(rows?.[0]?.count ?? 0) > 0) return;

  await dataSource.query(
    'ALTER TABLE events ADD COLUMN pending_changes JSON NULL AFTER rejection_reason',
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

  if (!process.env.CORS_ORIGIN) {
    throw Error("Please set the cors origin domain in your .env file")
  }

  const corsOrigins = process.env.CORS_ORIGIN
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (!corsOrigins.includes('http://localhost:3000')) {
    corsOrigins.push('http://localhost:3000');
  }

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
  await ensureHostIdColumn(app);
  await ensureGoogleAuthColumns(app);
  await ensureRegistrationPassColumns(app);
  await ensureRejectionReasonColumn(app);
  await ensurePendingChangesColumn(app);
  await ensureEventStatusEnum(app);
  await ensureEventActivityLogsTable(app);
  await ensureUserAvatarColumn(app);
  await ensureUserOtpColumns(app);
  await ensurePendingPhoneColumn(app);
  await ensurePasswordResetColumns(app);
  await ensureCommunityPreferredColumns(app);

  const port = 8001;
  await app.listen(port);
  console.log(`GZURA API running on http://localhost:${port}`);
}

bootstrap();
