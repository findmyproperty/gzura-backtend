/* One-off: delete child rows whose event_id no longer exists so TypeORM can add FKs. */
require('dotenv').config();
const mysql = require('mysql2/promise');

const CHILD_TABLES = [
  'event_activity_logs',
  'event_content_items',
  'event_registrations',
];

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: process.env.DB_SSL === 'true' ? {} : undefined,
  });

  try {
    for (const table of CHILD_TABLES) {
      const [existsRows] = await connection.query(
        `SELECT COUNT(*) AS count
         FROM information_schema.tables
         WHERE table_schema = DATABASE()
           AND table_name = ?`,
        [table],
      );

      if (!Number(existsRows[0]?.count ?? 0)) {
        console.log(`${table}: table missing, skipped`);
        continue;
      }

      const [orphanRows] = await connection.query(
        `SELECT COUNT(*) AS count
         FROM \`${table}\` child
         LEFT JOIN events e ON e.id = child.event_id
         WHERE e.id IS NULL`,
      );
      const orphans = Number(orphanRows[0]?.count ?? 0);

      if (orphans > 0) {
        await connection.query(
          `DELETE child
           FROM \`${table}\` child
           LEFT JOIN events e ON e.id = child.event_id
           WHERE e.id IS NULL`,
        );
      }

      console.log(`${table}: removed ${orphans} orphaned row(s)`);
    }
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
