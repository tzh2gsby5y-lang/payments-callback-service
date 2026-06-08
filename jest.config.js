module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['**/*.spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/shared/persistence/typeorm-data-source.ts',
    '!src/**/*.module.ts',
    '!src/**/*.tokens.ts',
    '!src/**/application/ports/*.ts',
    '!src/**/domain/*.ts',
    '!src/**/domain/repositories/*.repository.ts',
    '!src/modules/provider-events/application/provider-event-ingestion.store.ts',
    '!src/modules/identity/presentation/authenticated-request.ts',
    '!src/**/*.dto.ts',
    '!src/**/*.orm-entity.ts',
    '!src/shared/persistence/migrations/**/*.ts',
  ],
  coverageThreshold: {
    global: {
      statements: 95,
      branches: 95,
      functions: 95,
      lines: 95,
    },
  },
};
