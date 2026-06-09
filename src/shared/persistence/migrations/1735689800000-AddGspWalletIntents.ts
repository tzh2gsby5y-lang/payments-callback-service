import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGspWalletIntents1735689800000 implements MigrationInterface {
  name = 'AddGspWalletIntents1735689800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS gsp_wallet_intents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id varchar(80) NOT NULL,
        source varchar(16) NOT NULL,
        provider varchar(80) NOT NULL,
        raw_event_id uuid NOT NULL,
        idempotency_key_id uuid NOT NULL,
        idempotency_key varchar(255) NOT NULL,
        request_hash char(64) NOT NULL,
        operation varchar(32) NOT NULL,
        provider_transaction_id varchar(255) NOT NULL,
        round_id varchar(255),
        original_provider_transaction_id varchar(255),
        player_id varchar(255) NOT NULL,
        amount varchar(64),
        currency varchar(16),
        ledger_command_id varchar(255) NOT NULL,
        status varchar(40) NOT NULL,
        attempt_count integer NOT NULL DEFAULT 0,
        next_attempt_at timestamptz,
        lease_expires_at timestamptz,
        ledger_request jsonb NOT NULL,
        ledger_result jsonb,
        response_status integer,
        response_body jsonb,
        last_error jsonb,
        completed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_gsp_wallet_intents_raw_event_id
          FOREIGN KEY (raw_event_id) REFERENCES raw_events(id) ON DELETE CASCADE,
        CONSTRAINT fk_gsp_wallet_intents_idempotency_key_id
          FOREIGN KEY (idempotency_key_id) REFERENCES idempotency_keys(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_gsp_wallet_intents_brand_provider_key_unique
      ON gsp_wallet_intents (brand_id, source, provider, idempotency_key)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_gsp_wallet_intents_ledger_command_unique
      ON gsp_wallet_intents (ledger_command_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_gsp_wallet_intents_status_next_created
      ON gsp_wallet_intents (status, next_attempt_at, created_at)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_gsp_wallet_intents_brand_player_created
      ON gsp_wallet_intents (brand_id, provider, player_id, created_at)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_gsp_wallet_intents_brand_round
      ON gsp_wallet_intents (brand_id, provider, round_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS gsp_wallet_intents');
  }
}
