import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { memoryStorage } from 'multer';
import { ComplexId } from '../../common/decorators/complex-id.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import {
  ComplexResponse,
  toComplexResponse,
} from '../../shared/serializers/complex.serializer';
import { ComplexService } from '../complex/complex.service';
import {
  ComplexLogoService,
  LOGO_FIELD,
  MAX_LOGO_BYTES,
} from './complex-logo.service';
import { UpdateComplexDto } from './dto/update-complex.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/complex')
export class AdminComplexController {
  constructor(
    private readonly complex: ComplexService,
    private readonly logo: ComplexLogoService,
  ) {}

  @Patch()
  async update(
    @ComplexId() complexId: string,
    @Body() dto: UpdateComplexDto,
  ): Promise<ComplexResponse> {
    const data = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.address !== undefined && { address: dto.address }),
      ...(dto.cancellationWindowHours !== undefined && {
        cancellationWindowHours: dto.cancellationWindowHours,
      }),
      ...(dto.autoConfirmPublicRequests !== undefined && {
        autoConfirmPublicRequests: dto.autoConfirmPublicRequests,
      }),
      ...(dto.instagramUrl !== undefined && {
        instagramUrl: dto.instagramUrl,
      }),
      ...(dto.facebookUrl !== undefined && { facebookUrl: dto.facebookUrl }),
      ...(dto.tiktokUrl !== undefined && { tiktokUrl: dto.tiktokUrl }),
      ...(dto.youtubeUrl !== undefined && { youtubeUrl: dto.youtubeUrl }),
      ...(dto.contactWhatsapp !== undefined && {
        contactWhatsapp: dto.contactWhatsapp,
      }),
      ...(dto.primaryColor !== undefined && {
        primaryColor: dto.primaryColor,
      }),
      ...(dto.secondaryColor !== undefined && {
        secondaryColor: dto.secondaryColor,
      }),
      ...(dto.bankCbu !== undefined && { bankCbu: dto.bankCbu }),
      ...(dto.bankAlias !== undefined && { bankAlias: dto.bankAlias }),
      ...(dto.bankHolderName !== undefined && {
        bankHolderName: dto.bankHolderName,
      }),
    };
    if (Object.keys(data).length === 0) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Revisá los datos ingresados.',
        {
          _: ['No hay cambios'],
        },
      );
    }
    return toComplexResponse(await this.complex.update(complexId, data));
  }

  /**
   * El archivo no toca el disco (`memoryStorage`): llega como Buffer, se valida por sus bytes y
   * se sube al bucket (docs/18-storage.md). `limits.fileSize` corta antes de bufferear todo.
   */
  @Post('logo')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { [LOGO_FIELD]: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor(LOGO_FIELD, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_LOGO_BYTES, files: 1 },
    }),
  )
  async uploadLogo(
    @ComplexId() complexId: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ComplexResponse> {
    return toComplexResponse(await this.logo.replace(complexId, file));
  }

  @Delete('logo')
  async deleteLogo(@ComplexId() complexId: string): Promise<ComplexResponse> {
    return toComplexResponse(await this.logo.remove(complexId));
  }
}
