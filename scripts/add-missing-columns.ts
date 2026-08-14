import { config } from 'dotenv';
import { DataSource } from 'typeorm';

config();

const dataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
});

async function main() {
  console.log('Connecting to MySQL database:', process.env.DB_DATABASE);
  await dataSource.initialize();
  const queryRunner = dataSource.createQueryRunner();

  const safeAddColumn = async (table: string, column: string, definition: string) => {
    try {
      await queryRunner.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      console.log(`✓ Added column ${column} to table ${table}`);
    } catch (err: any) {
      if (err?.code === 'ER_DUP_FIELDNAME' || err?.message?.includes('Duplicate column')) {
        console.log(`- Column ${column} already exists in table ${table}`);
      } else {
        console.warn(`! Note on ${table}.${column}:`, err?.message || err);
      }
    }
  };

  // Add missing columns to community_registrations
  await safeAddColumn('community_registrations', 'preferred_date', 'VARCHAR(255) NULL');
  await safeAddColumn('community_registrations', 'preferred_time', 'VARCHAR(255) NULL');

  // Add missing columns to events
  await safeAddColumn('events', 'rejection_reason', 'TEXT NULL');

  // Add missing columns to users
  await safeAddColumn('users', 'otp_code', 'VARCHAR(10) NULL');
  await safeAddColumn('users', 'otp_expires_at', 'DATETIME NULL');
  await safeAddColumn('users', 'password_reset_token', 'VARCHAR(64) NULL');
  await safeAddColumn('users', 'password_reset_expires_at', 'DATETIME NULL');

  console.log('Finished updating table schemas successfully!');
  await dataSource.destroy();
}

main().catch((err) => {
  console.error('Error executing ALTER TABLE statements:', err);
  process.exit(1);
});
