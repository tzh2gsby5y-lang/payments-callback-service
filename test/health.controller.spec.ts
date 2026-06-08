import { HealthController } from '../src/health.controller';

describe('HealthController', () => {
  it('returns service liveness status', () => {
    expect(new HealthController().health()).toEqual({ status: 'ok' });
  });
});
