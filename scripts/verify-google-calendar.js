/**
 * Verify Google Calendar OAuth credentials in backend/.env.
 * Usage: node scripts/verify-google-calendar.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { google } = require('googleapis');

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

if (!clientId || !clientSecret || !refreshToken) {
  console.error('Missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or GOOGLE_REFRESH_TOKEN');
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
oauth2.setCredentials({ refresh_token: refreshToken });

async function main() {
  try {
    const calendar = google.calendar({ version: 'v3', auth: oauth2 });
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
    const response = await calendar.calendarList.get({ calendarId });

    console.log('Google Calendar credentials are valid.');
    console.log(`Calendar: ${response.data.summary} (${response.data.id})`);
  } catch (error) {
    const message = error?.response?.data?.error || error.message;

    if (message === 'unauthorized_client' || String(message).includes('unauthorized_client')) {
      console.error('Invalid refresh token for this OAuth client.');
      console.error('');
      console.error('Common causes:');
      console.error('- Token was generated in OAuth Playground without "Use your own OAuth credentials"');
      console.error('- Client ID/Secret in .env do not match the client used to create the token');
      console.error('- OAuth client secret was regenerated after the token was issued');
      console.error('');
      console.error('Fix: run  node scripts/get-google-refresh-token.js  to generate a new token.');
      process.exit(1);
    }

    console.error('Verification failed:', message);
    process.exit(1);
  }
}

main();
