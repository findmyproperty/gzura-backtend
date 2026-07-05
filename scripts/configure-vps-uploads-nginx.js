/**
 * Configure nginx on the VPS to serve /public_html/uploads publicly.
 */
require('dotenv').config();
const SftpClient = require('ssh2-sftp-client');
const { Client } = require('../node_modules/.pnpm/node_modules/ssh2');
const fs = require('fs');
const path = require('path');

const NGINX_PATH = '/etc/nginx/sites-enabled/findmypropertys.com';
const UPLOADS_BLOCK = `
    location /uploads/ {
        alias /public_html/uploads/;
        expires 30d;
        access_log off;
    }
`;

async function connectSftp() {
  const client = new SftpClient();
  await client.connect({
    host: process.env.SFTP_HOST,
    port: parseInt(process.env.SFTP_PORT || '22', 10),
    username: process.env.SFTP_USER,
    password: process.env.SFTP_PASSWORD,
    readyTimeout: 20000,
  });
  return client;
}

function execSsh(command) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn
      .on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            reject(err);
            return;
          }
          let stdout = '';
          let stderr = '';
          stream
            .on('close', (code) => {
              conn.end();
              if (code === 0) resolve({ stdout, stderr });
              else reject(new Error(stderr || stdout || `Exit ${code}`));
            })
            .on('data', (d) => {
              stdout += d.toString();
            })
            .stderr.on('data', (d) => {
              stderr += d.toString();
            });
        });
      })
      .on('error', reject)
      .connect({
        host: process.env.SFTP_HOST,
        port: parseInt(process.env.SFTP_PORT || '22', 10),
        username: process.env.SFTP_USER,
        password: process.env.SFTP_PASSWORD,
        readyTimeout: 20000,
      });
  });
}

async function main() {
  const sftp = await connectSftp();
  const localPath = path.join(__dirname, 'tmp-nginx.conf');

  try {
    await sftp.get(NGINX_PATH, localPath);
    let config = fs.readFileSync(localPath, 'utf8');

    if (config.includes('location /uploads/')) {
      console.log('Nginx already serves /uploads/.');
    } else {
      const marker = 'server_name api.theybdc.com;';
      if (!config.includes(marker)) {
        throw new Error('Could not find api.theybdc.com server block in nginx config.');
      }

      config = config.replace(
        marker,
        `${marker}\n${UPLOADS_BLOCK}`,
      );

      fs.writeFileSync(localPath, config);
      await sftp.put(localPath, NGINX_PATH);
      console.log('Updated nginx config with /uploads/ static location.');

      const test = await execSsh('nginx -t');
      console.log(test.stdout.trim() || 'nginx -t ok');

      await execSsh('systemctl reload nginx');
      console.log('Nginx reloaded.');
    }

    console.log('\nUse this public URL base in backend/.env:');
    console.log('UPLOAD_PUBLIC_URL=https://api.theybdc.com/uploads/events');
    console.log('SFTP_REMOTE_PATH=/public_html/uploads/events');
  } finally {
    await sftp.end();
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
