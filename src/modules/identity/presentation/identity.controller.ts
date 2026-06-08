import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { StructuredErrorResponseDto } from '../../../shared/errors/dto/structured-error-response.dto';
import { RegisterUserUseCase } from '../application/use-cases/register-user.use-case';
import { LoginUserUseCase } from '../application/use-cases/login-user.use-case';
import { GetProfileUseCase } from '../application/use-cases/get-profile.use-case';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SessionAuthGuard } from './session-auth.guard';
import { AuthenticatedRequest } from './authenticated-request';
import { IdentityUserResponseDto, LoginResponseDto } from './dto/identity-response.dto';

@ApiTags('identity')
@Controller()
export class IdentityController {
  constructor(
    private readonly registerUser: RegisterUserUseCase,
    private readonly loginUser: LoginUserUseCase,
    private readonly getProfile: GetProfileUseCase,
  ) {}

  @Post('/auth/register')
  @ApiCreatedResponse({
    description: 'Tenant-scoped user was registered.',
    type: IdentityUserResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid registration payload.',
    type: StructuredErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'User already exists for this brand.',
    type: StructuredErrorResponseDto,
  })
  register(@Body() dto: RegisterDto) {
    return this.registerUser.execute(dto);
  }

  @Post('/auth/login')
  @ApiOkResponse({
    description: 'Session token for the tenant-scoped user.',
    type: LoginResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid login payload.',
    type: StructuredErrorResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials or brand.',
    type: StructuredErrorResponseDto,
  })
  login(@Body() dto: LoginDto) {
    return this.loginUser.execute(dto);
  }

  @Get('/profile/me')
  @ApiBearerAuth()
  @ApiOkResponse({
    description: 'Current tenant-scoped profile.',
    type: IdentityUserResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid, or expired bearer token.',
    type: StructuredErrorResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Session brand does not match x-brand-id.',
    type: StructuredErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Authenticated user was not found in this brand.',
    type: StructuredErrorResponseDto,
  })
  @UseGuards(SessionAuthGuard)
  me(@Req() request: AuthenticatedRequest) {
    return this.getProfile.execute(request.principal);
  }
}
