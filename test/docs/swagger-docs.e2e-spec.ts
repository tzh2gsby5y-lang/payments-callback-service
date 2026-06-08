import request from 'supertest';
import {
  createTypeOrmTestingApp,
  TypeOrmTestAppContext,
} from '../support/create-typeorm-testing-app';

describe('Swagger docs', () => {
  let context: TypeOrmTestAppContext;

  beforeAll(async () => {
    context = await createTypeOrmTestingApp({ setupOpenApi: true });
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  it('serves Swagger UI from the runtime Nest app', async () => {
    await request(context.app.getHttpServer())
      .get('/docs')
      .expect(200)
      .expect('content-type', /html/)
      .expect((response) => {
        expect(response.text).toContain('Swagger UI');
      });
  });
});
