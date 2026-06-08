import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1735689600000 implements MigrationInterface {
  name = 'InitialSchema1735689600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id varchar(80) NOT NULL,
        email varchar(320) NOT NULL,
        password_hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_brand_email_unique
      ON users (brand_id, email)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id varchar(80) NOT NULL,
        user_id uuid NOT NULL,
        token_hash char(64) NOT NULL,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_sessions_user_id
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token_hash_unique
      ON sessions (token_hash)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_brand_user
      ON sessions (brand_id, user_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
      ON sessions (expires_at)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS raw_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id varchar(80) NOT NULL,
        source varchar(16) NOT NULL,
        provider varchar(80) NOT NULL,
        provider_event_id varchar(255) NOT NULL,
        idempotency_key varchar(255) NOT NULL,
        event_type varchar(160) NOT NULL,
        status varchar(32) NOT NULL,
        signature_valid boolean NOT NULL,
        request_hash char(64) NOT NULL,
        headers jsonb NOT NULL,
        raw_body text NOT NULL,
        parsed_body jsonb NOT NULL,
        normalized_body jsonb NOT NULL,
        response_status integer,
        response_body jsonb,
        received_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_raw_events_brand_provider_status_received
      ON raw_events (brand_id, source, provider, status, received_at)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_raw_events_brand_provider_event
      ON raw_events (brand_id, source, provider, provider_event_id)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id varchar(80) NOT NULL,
        source varchar(16) NOT NULL,
        provider varchar(80) NOT NULL,
        key varchar(255) NOT NULL,
        raw_event_id uuid NOT NULL,
        request_hash char(64) NOT NULL,
        status varchar(32) NOT NULL,
        response_status integer,
        response_body jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_idempotency_keys_raw_event_id
          FOREIGN KEY (raw_event_id) REFERENCES raw_events(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_brand_provider_key_unique
      ON idempotency_keys (brand_id, source, provider, key)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_idempotency_brand_provider_status_created
      ON idempotency_keys (brand_id, source, provider, status, created_at)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_idempotency_raw_event_id
      ON idempotency_keys (raw_event_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS idempotency_keys');
    await queryRunner.query('DROP TABLE IF EXISTS raw_events');
    await queryRunner.query('DROP TABLE IF EXISTS sessions');
    await queryRunner.query('DROP TABLE IF EXISTS users');
  }
}
