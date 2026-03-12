import request from 'supertest';
import { OAuth2Client } from 'google-auth-library';
import { app } from '../index';

// Mock the entire google-auth-library module
jest.mock('google-auth-library');
const MockOAuth2Client = OAuth2Client as jest.MockedClass<typeof OAuth2Client>;

// Shared helper to build a valid request body
const validBody = (argumentText: string) => ({
  type: 'MESSAGE',
  message: {
    argumentText,
    slashCommand: { commandId: '1' },
    thread: { name: 'spaces/AAAA8WYwwy4/threads/t1' },
  },
  space: { name: 'spaces/AAAA8WYwwy4' },
});

beforeEach(() => {
  MockOAuth2Client.prototype.verifyIdToken = jest.fn().mockResolvedValue({
    getPayload: () => ({
      email_verified: true,
      email: 'chat@system.gserviceaccount.com',
    }),
  });
  process.env.ALLOWED_SPACE_IDS = 'spaces/AAAA8WYwwy4';
  process.env.GOOGLE_CLOUD_PROJECT_NUMBER = '490009';
});

describe('POST / — JWT verification (SEC-01)', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app)
      .post('/')
      .send(validBody(' hello world'));
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it('returns 401 when verifyIdToken throws (invalid token)', async () => {
    MockOAuth2Client.prototype.verifyIdToken = jest.fn().mockRejectedValue(
      new Error('Invalid token')
    );
    const res = await request(app)
      .post('/')
      .set('Authorization', 'Bearer invalid.jwt.token')
      .send(validBody(' hello world'));
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token verification failed');
  });

  it('returns 200 when JWT is valid and space is allowed', async () => {
    const res = await request(app)
      .post('/')
      .set('Authorization', 'Bearer valid.jwt.token')
      .send(validBody(' hello world'));
    expect(res.status).toBe(200);
  });
});

describe('POST / — Space allowlist (SEC-02)', () => {
  it('returns 200 with empty body when space is not in ALLOWED_SPACE_IDS', async () => {
    const unlistedBody = {
      type: 'MESSAGE',
      message: {
        argumentText: ' hello world',
        slashCommand: { commandId: '1' },
        thread: { name: 'spaces/UNLISTED999/threads/t1' },
      },
      space: { name: 'spaces/UNLISTED999' },
    };
    const res = await request(app)
      .post('/')
      .set('Authorization', 'Bearer valid.jwt.token')
      .send(unlistedBody);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it('proceeds to handler when space is in ALLOWED_SPACE_IDS', async () => {
    const res = await request(app)
      .post('/')
      .set('Authorization', 'Bearer valid.jwt.token')
      .send(validBody(' hello world'));
    expect(res.status).toBe(200);
  });
});

describe('POST / — Event parsing and handler (HOOK-01, HOOK-02, HOOK-03)', () => {
  it('returns 200 immediately for a valid request with a prompt (HOOK-02)', async () => {
    const res = await request(app)
      .post('/')
      .set('Authorization', 'Bearer valid.jwt.token')
      .send(validBody(' What is the capital of France?'));
    expect(res.status).toBe(200);
  });

  it('returns cardsV2 usage hint card when argumentText is empty (HOOK-03)', async () => {
    const res = await request(app)
      .post('/')
      .set('Authorization', 'Bearer valid.jwt.token')
      .send(validBody(''));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('cardsV2');
    expect(res.body.cardsV2[0].cardId).toBe('usage-hint');
  });

  it('returns cardsV2 usage hint card when argumentText is only whitespace (HOOK-03)', async () => {
    const res = await request(app)
      .post('/')
      .set('Authorization', 'Bearer valid.jwt.token')
      .send(validBody('   '));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('cardsV2');
    expect(res.body.cardsV2[0].cardId).toBe('usage-hint');
  });

  it('trims argumentText correctly before passing to handler (HOOK-01)', async () => {
    // A request with leading/trailing whitespace in argumentText should still pass
    // the non-empty check and return 200 (not a usage hint card)
    const res = await request(app)
      .post('/')
      .set('Authorization', 'Bearer valid.jwt.token')
      .send(validBody('  summarize the incident  '));
    expect(res.status).toBe(200);
    // Should NOT return cardsV2 since argumentText has real content after trimming
    expect(res.body).not.toHaveProperty('cardsV2');
  });
});
