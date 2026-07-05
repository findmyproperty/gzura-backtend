/**
 * Probe Hostinger VPS over SFTP and prepare the event uploads folder.
 * Usage: cd backend && npx ts-node scripts/setup-vps-upload.ts
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import SftpClient from 'ssh2-sftp-client';

const HOST = process.env.SFTP_HOST || process.env.DB_HOST || '187.127.133.141';
const PORT = parseInt(process.env.SFTP_PORT || '22', 10);
const DOMAIN = process.env.UPLOAD_DOMAIN || 'gzura.com';

async function connect(client: SftpClient) {
  const username = process.env.SFTP_USER;
  const password = process.env.SFTP_PASSWORD;
  const privateKeyPath = process.env.SFTP_PRIVATE_KEY_PATH;

  if (!username) {
    throw new Error('Set SFTP_USER in backend/.env (SSH username from Hostinger hPanel).');
  }

  const config: Record<string, unknown> = {
    host: HOST,
    port: PORT,
    username,
    readyTimeout: 20000,
  };

  if (privateKeyPath) {
    config.privateKey = readFileSync(privateKeyPath, 'utf8');
    if (process.env.SFTP_PRIVATE_KEY_PASSPHRASE) {
      config.passphrase = process.env.SFTP_PRIVATE_KEY_PASSPHRASE;
    }
  } else if (password) {
    config.password = password;
  } else {
    throw new Error('Set SFTP_PASSWORD or SFTP_PRIVATE_KEY_PATH in backend/.env.');
  }

  await client.connect(config);
}

async function discoverWebRoot(client: SftpClient): Promise<string | null> {
  const candidates = [
    process.env.SFTP_REMOTE_PATH,
    `/home/${process.env.SFTP_USER}/domains/${DOMAIN}/public_html`,
    `/home/${process.env.SFTP_USER}/public_html`,
    `/var/www/${DOMAIN}/public_html`,
    `/var/www/html`,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (candidate.endsWith('/uploads/events')) {
      const base = candidate.replace(/\/uploads\/events\/?$/, '');
      try {
        await client.exists(base);
        return base;
      } catch {
        continue;
      }
    }

    try {
      const exists = await client.exists(candidate);
      if (exists) return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

async function main() {
  const client = new SftpClient();

  try {
    console.log(`Connecting to ${HOST}:${PORT} as ${process.env.SFTP_USER}...`);
    await connect(client);
    console.log('SSH/SFTP connected.');

    const cwd = await client.cwd();
    console.log('Remote home:', cwd);

    let uploadBase = process.env.SFTP_REMOTE_PATH;
    if (!uploadBase) {
      const webRoot = await discoverWebRoot(client);
      if (!webRoot) {
        console.log('Could not auto-detect web root. Listing home directory:');
        const listing = await client.list(cwd);
        for (const item of listing.slice(0, 20)) {
          console.log(`  ${item.type} ${item.name}`);
        }
        throw new Error(
          `Set SFTP_REMOTE_PATH in .env, e.g. /home/${process.env.SFTP_USER}/domains/${DOMAIN}/public_html/uploads/events`,
        );
      }
      uploadBase = `${webRoot.replace(/\/$/, '')}/uploads/events`;
    }

    await client.mkdir(uploadBase, true);
    console.log('Upload directory ready:', uploadBase);

    const testName = '.gzura-upload-test.txt';
    const testPath = `${uploadBase.replace(/\/$/, '')}/${testName}`;
    await client.put(Buffer.from('gzura upload ok'), testPath);
    console.log('Test file uploaded:', testPath);

    const publicUrl =
      process.env.UPLOAD_PUBLIC_URL ||
      `https://${DOMAIN}/uploads/events`;
    console.log('\nAdd/update these in backend/.env:\n');
    console.log(`UPLOAD_STORAGE=sftp`);
    console.log(`UPLOAD_PUBLIC_URL=${publicUrl}`);
    console.log(`SFTP_HOST=${HOST}`);
    console.log(`SFTP_REMOTE_PATH=${uploadBase}`);
    console.log('\nRestart the backend after saving .env.');
  } catch (error) {
    console.error('Setup failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
