import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiProperty } from '@nestjs/swagger';

class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';
}

@Controller('/health')
export class HealthController {
  @Get()
  @ApiOkResponse({ type: HealthResponseDto })
  health() {
    return { status: 'ok' };
  }
}
