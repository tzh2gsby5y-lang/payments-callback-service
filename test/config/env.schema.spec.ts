import { validateEnv } from '../../src/config/env.schema';

describe('environment validation', () => {
  const baseEnv = {
    DATABASE_URL: 'postgres://app:app@localhost:5432/app',
  };

  it('coerces local defaults and boolean/number values deterministically', () => {
    const env = validateEnv({
      ...baseEnv,
      DB_SYNCHRONIZE: 'false',
      SESSION_TTL_SECONDS: '120',
      STRIPE_SIGNATURE_TOLERANCE_SECONDS: '42',
    });

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      DB_SYNCHRONIZE: false,
      SESSION_TTL_SECONDS: 120,
      STRIPE_SIGNATURE_TOLERANCE_SECONDS: 42,
      STRIPE_WEBHOOK_SECRET: '',
      PRAGMATIC_WEBHOOK_SECRET: '',
    });
  });

  it('uses a deterministic default session TTL when it is not configured', () => {
    expect(validateEnv(baseEnv)).toMatchObject({
      SESSION_TTL_SECONDS: 86_400,
    });
  });

  it('requires provider secrets in production so adapters fail closed by configuration', () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        NODE_ENV: 'production',
        STRIPE_WEBHOOK_SECRET: '',
        PRAGMATIC_WEBHOOK_SECRET: '',
      }),
    ).toThrow(/STRIPE_WEBHOOK_SECRET is required in production/);
  });

  it('rejects invalid operational values with a structured validation message', () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        PORT: '99999',
        SESSION_TTL_SECONDS: '10',
      }),
    ).toThrow(/PORT: Number must be less than or equal to 65535/);
  });
});
