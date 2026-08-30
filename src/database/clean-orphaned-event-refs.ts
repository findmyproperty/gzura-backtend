import { ConfigService } from '@nestjs/config';
import { RowDataPacket } from 'mysql2';
import { createConnection } from 'mysql2/promise';

const CHILD_TABLES = [
  'event_activity_logs',
  'event_content_items',
  'event_registrations',
] as const;

export async function cleanOrphanedEventRefs(config: ConfigService) {
  const connection = await createConnection({
    host: config.get<string>('DB_HOST'),
    port: parseInt(config.get<string>('DB_PORT') || '3306', 10),
    user: config.get<string>('DB_USERNAME'),
    password: config.get<string>('DB_PASSWORD'),
    database: config.get<string>('DB_DATABASE'),
    ssl: config.get<string>('DB_SSL') === 'true' ? {} : undefined,
  });

  try {
    for (const table of CHILD_TABLES) {
      const [existsRows] = await connection.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS count
         FROM information_schema.tables
         WHERE table_schema = DATABASE()
           AND table_name = ?`,
        [table],
      );

      if (!Number(existsRows?.[0]?.count ?? 0)) continue;

      await connection.query(
        `DELETE child
         FROM \`${table}\` child
         LEFT JOIN events e ON e.id = child.event_id
         WHERE e.id IS NULL`,
      );
    }
  } finally {
    await connection.end();
  }
}
