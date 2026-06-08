import { ApiProperty } from '@nestjs/swagger';

export class IdentityUserResponseDto {
  @ApiProperty({ format: 'uuid', example: '7d63fdd7-7708-4753-8ad6-f00e9b3300ad' })
  id!: string;

  @ApiProperty({ example: 'brandA' })
  brandId!: string;

  @ApiProperty({ format: 'email', example: 'player@example.com' })
  email!: string;
}

export class LoginResponseDto {
  @ApiProperty({ example: 'opaque-session-token' })
  accessToken!: string;

  @ApiProperty({ format: 'date-time', example: '2026-06-10T00:00:00.000Z' })
  expiresAt!: string;
}
