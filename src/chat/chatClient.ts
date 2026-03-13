import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

function getChatClient() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not set');
  const key = JSON.parse(keyJson) as Record<string, unknown>;
  const auth = google.auth.fromJSON(key);
  // fromJSON returns JWT or UserRefreshClient; scopes must be set manually
  (auth as { scopes?: string[] }).scopes = ['https://www.googleapis.com/auth/chat.bot'];
  return google.chat({ version: 'v1', auth: auth as unknown as OAuth2Client });
}

export const chatClient = getChatClient();
