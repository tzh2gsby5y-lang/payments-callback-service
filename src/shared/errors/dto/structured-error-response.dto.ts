import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StructuredErrorDto {
  @ApiProperty({ example: 'IDEMPOTENCY_PAYLOAD_MISMATCH' })
  code!: string;

  @ApiProperty({ example: 'Same idempotency key was used with a different payload' })
  message!: string;

  @ApiProperty({ example: 409 })
  statusCode!: number;

  @ApiProperty({ example: 'demo-request-id' })
  requestId!: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  details?: Record<string, unknown>;
}

export class StructuredErrorResponseDto {
  @ApiProperty({ type: () => StructuredErrorDto })
  error!: StructuredErrorDto;
}
