import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProviderEventHandoffs1735689700000 implements MigrationInterface {
  name = 'AddProviderEventHandoffs1735689700000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS provider_event_handoffs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id varchar(80) NOT NULL,
        source varchar(16) NOT NULL,
        provider varchar(80) NOT NULL,
        raw_event_id uuid NOT NULL,
        idempotency_key varchar(255) NOT NULL,
        provider_event_id varchar(255) NOT NULL,
        event_type varchar(160) NOT NULL,
        aggregate_type varchar(40) NOT NULL,
        aggregate_id varchar(255) NOT NULL,
        player_id varchar(255),
        amount varchar(64),
        currency varchar(16),
        status varchar(32) NOT NULL,
        payload jsonb NOT NULL,
        attempt_count integer NOT NULL DEFAULT 0,
        next_attempt_at timestamptz,
        last_error jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_provider_handoffs_raw_event_id
          FOREIGN KEY (raw_event_id) REFERENCES raw_events(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_handoffs_brand_source_provider_key_unique
      ON provider_event_handoffs (brand_id, source, provider, idempotency_key)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_provider_handoffs_status_next_created
      ON provider_event_handoffs (status, next_attempt_at, created_at)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_provider_handoffs_brand_provider_event
      ON provider_event_handoffs (brand_id, source, provider, provider_event_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_provider_handoffs_raw_event_id
      ON provider_event_handoffs (raw_event_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS provider_event_handoffs');
  }
}
