import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiParam, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { Public } from '../../common/decorators/public.decorator';
import { uuidParam } from '../../common/pipes/uuid.pipe';
import { ComplexService } from '../complex/complex.service';
import { CreatePaymentProofDto } from './dto/create-payment-proof.dto';
import {
  MAX_PAYMENT_PROOF_BYTES,
  PAYMENT_PROOF_FIELD,
  PublicPaymentResponse,
  PublicPaymentService,
} from './public-payment.service';

const MINUTE = 60_000;

/** Public payment link of a booking (docs/23-public-payment-link.md). */
@ApiTags('public')
@ApiParam({ name: 'slug', example: 'complejo-demo' })
@Public()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: MINUTE } })
@Controller('public/c/:slug/bookings/:id')
export class PublicPaymentController {
  constructor(
    private readonly complex: ComplexService,
    private readonly payments: PublicPaymentService,
  ) {}

  @Get('payment')
  async view(
    @Param('slug') slug: string,
    @Param('id', uuidParam('id')) id: string,
  ): Promise<PublicPaymentResponse> {
    const complex = await this.complex.findPublicBySlugOrThrow(slug);
    return this.payments.view(complex, id);
  }

  @Post('payment-proof')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 20, ttl: MINUTE } })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor(PAYMENT_PROOF_FIELD, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_PAYMENT_PROOF_BYTES, files: 1 },
    }),
  )
  async uploadProof(
    @Param('slug') slug: string,
    @Param('id', uuidParam('id')) id: string,
    @Body() dto: CreatePaymentProofDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<PublicPaymentResponse> {
    const complex = await this.complex.findBySlugOrThrow(slug);
    return this.payments.uploadProof(complex, id, dto, file);
  }
}
