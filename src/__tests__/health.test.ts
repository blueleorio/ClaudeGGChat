import request from 'supertest';
import { app } from '../index';

describe('GET /health', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  it('returns healthy status in body', async () => {
    const res = await request(app).get('/health');
    expect(res.body.status).toBe('healthy');
    expect(typeof res.body.timestamp).toBe('string');
    expect(res.body.timestamp.length).toBeGreaterThan(0);
  });
});

describe('POST /', () => {
  it('returns 200 for placeholder route', async () => {
    const res = await request(app).post('/').send({ type: 'MESSAGE' });
    expect(res.status).toBe(200);
  });
});
