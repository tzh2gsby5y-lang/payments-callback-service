import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  GspWalletBusinessStatus,
  GspWalletBusinessStatuses,
  GspWalletErrorCode,
  GspWalletErrorCodes,
  GspWalletOperation,
  GspWalletOperations,
} from '../../domain/gsp-wallet-action';
import { GspProviders } from '../../../../shared/provider-events/domain/provider-ids';

export class GspWalletResponseDto {
  @ApiProperty({
    enum: Object.values(GspWalletBusinessStatuses),
    example: GspWalletBusinessStatuses.APPROVED,
  })
  status!: GspWalletBusinessStatus;

  @ApiProperty({ enum: Object.values(GspWalletOperations), example: GspWalletOperations.BET })
  action!: GspWalletOperation;

  @ApiProperty({ example: GspProviders.PRAGMATIC })
  provider!: string;

  @ApiProperty({ example: 'brandA' })
  brandId!: string;

  @ApiProperty({ example: 'player-1' })
  playerId!: string;

  @ApiProperty({ example: 'txn-1' })
  providerTransactionId!: string;

  @ApiProperty({
    example: `wallet:gsp-wallet:brandA:${GspProviders.PRAGMATIC}:${GspWalletOperations.BET}:txn-1`,
  })
  walletTransactionId!: string;

  @ApiPropertyOptional({ example: 'round-1' })
  roundId?: string | null;

  @ApiProperty({ example: '990.00' })
  balance!: string;

  @ApiProperty({ example: 'EUR' })
  currency!: string;

  @ApiProperty({ example: `${GspProviders.PRAGMATIC}:${GspWalletOperations.BET}:txn-1` })
  idempotencyKey!: string;

  @ApiPropertyOptional({
    enum: Object.values(GspWalletErrorCodes),
    example: GspWalletErrorCodes.INSUFFICIENT_FUNDS,
  })
  errorCode?: GspWalletErrorCode;

  @ApiPropertyOptional({ example: 'Insufficient funds' })
  errorMessage?: string;
}
