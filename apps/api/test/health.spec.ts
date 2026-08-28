import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestHarness } from './app-harness';

describe('GET /health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestHarness());
  });

  afterAll(async () => {
    await app.close();
  });

  it('reporta aplicacao e banco saudaveis', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      checks: { application: 'up', database: 'up' },
    });
    expect(typeof response.body.uptime).toBe('number');
    expect(typeof response.body.timestamp).toBe('string');
  });
});
