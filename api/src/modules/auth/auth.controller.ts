import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import {
  SessionUserResponse,
  toSessionUserResponse,
} from '../../shared/serializers/user.serializer';
import { UsersService } from '../users/users.service';
import { AuthResult, AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterComplexDto } from './dto/register-complex.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterComplexDto): Promise<AuthResult> {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<AuthResult> {
    return this.auth.login(dto);
  }

  /** No-op del lado del servidor en MVP (sin blacklist). Existe para que la web tenga un punto único. */
  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(): void {
    return;
  }

  /** Relee de la DB (no del payload) para reflejar cambios de nombre/teléfono. */
  @ApiBearerAuth()
  @Get('me')
  async me(@CurrentUser() current: AuthUser): Promise<SessionUserResponse> {
    const user = await this.users.findByIdOrThrow(current.id);
    return toSessionUserResponse(user);
  }
}
