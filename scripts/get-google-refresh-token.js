/**
 * Generate a GOOGLE_REFRESH_TOKEN using the Client ID/Secret in backend/.env.
 *
 * Before running:
 * 1. GCP → APIs & Services → Credentials → your OAuth client (Web application)
 * 2. Add authorized redirect URI: http://localhost:8080/oauth2callback
 * 3. OAuth consent screen → add your Gmail as a test user (if app is in Testing)
 *
 * Usage: node scripts/get-google-refresh-token.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const http = require('http');
const { URL } = require('url');
const { google } = require('googleapis');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:8080/oauth2callback';
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in backend/.env');
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: SCOPES,
});

console.log('\nGoogle OAuth refresh token setup\n');
console.log('Step 1 — In GCP, add this redirect URI to your OAuth client:');
console.log(`  ${REDIRECT_URI}\n`);
console.log('Step 2 — Open this URL in your browser and sign in:\n');
console.log(authUrl);
console.log('\nWaiting for callback...\n');

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://localhost:8080`);

  if (requestUrl.pathname !== '/oauth2callback') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const error = requestUrl.searchParams.get('error');
  if (error) {
    res.writeHead(400);
    res.end(`Authorization failed: ${error}`);
    console.error(`Authorization failed: ${error}`);
    server.close();
    process.exit(1);
  }

  const code = requestUrl.searchParams.get('code');
  if (!code) {
    res.writeHead(400);
    res.end('Missing authorization code');
    server.close();
    process.exit(1);
  }

  try {
    const { tokens } = await oauth2.getToken(code);

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(
      '<h1>Success</h1><p>You can close this tab. Check the terminal for your refresh token.</p>',
    );

    if (!tokens.refresh_token) {
      console.error(
        'No refresh token returned. Revoke app access at https://myaccount.google.com/permissions',
      );
      console.error('Then run this script again (prompt=consent forces a new token).');
      server.close();
      process.exit(1);
    }

    console.log('Add this line to backend/.env:\n');
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
    console.log('Then restart the backend and try creating an online event again.\n');
  } catch (err) {
    res.writeHead(500);
    res.end('Token exchange failed. Check the terminal.');
    console.error('Token exchange failed:', err.message || err);
    server.close();
    process.exit(1);
  }

  server.close();
});

server.listen(8080, () => {
  console.log(`Listening on ${REDIRECT_URI}`);
});
