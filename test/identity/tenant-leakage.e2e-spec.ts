import request from 'supertest';
import {
  createTypeOrmTestingApp,
  TypeOrmTestAppContext,
} from '../support/create-typeorm-testing-app';

describe('Tenant leakage integration', () => {
  let context: TypeOrmTestAppContext;

  beforeAll(async () => {
    context = await createTypeOrmTestingApp();
  }, 120_000);

  beforeEach(async () => {
    await context.resetDatabase();
  });

  afterAll(async () => {
    await context?.close();
  });

  it('does not let a brandA session access a brandB-scoped request context', async () => {
    await request(context.app.getHttpServer()).post('/auth/register').send({
      brandId: 'brandA',
      email: 'player@example.com',
      password: 'strong-password',
    });
    await request(context.app.getHttpServer()).post('/auth/register').send({
      brandId: 'brandB',
      email: 'player@example.com',
      password: 'strong-password',
    });

    const login = await request(context.app.getHttpServer()).post('/auth/login').send({
      brandId: 'brandA',
      email: 'player@example.com',
      password: 'strong-password',
    }).expect(200);

    await request(context.app.getHttpServer())
      .get('/profile/me')
      .set('authorization', `Bearer ${login.body.accessToken}`)
      .set('x-brand-id', 'brandB')
      .expect(403);

    const profile = await request(context.app.getHttpServer())
      .get('/profile/me')
      .set('authorization', `Bearer ${login.body.accessToken}`)
      .set('x-brand-id', 'brandA')
      .expect(200);

    expect(profile.body.brandId).toBe('brandA');
    expect(profile.body.email).toBe('player@example.com');
  });
});
