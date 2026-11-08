import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { ComplexService } from '../complex/complex.service';

const MINUTE = 60_000;

export interface PublicComplexResponse {
  slug: string;
  name: string;
  address: string;
  timezone: string;
  cancellationWindowHours: number;
  instagramUrl: string | null;
  facebookUrl: string | null;
  tiktokUrl: string | null;
  youtubeUrl: string | null;
  contactWhatsapp: string | null;
  logoUrl: string | null;
}

/** Public complex profile (no auth), resolved by slug. A missing slug is a 404. */
@ApiTags('public')
@ApiParam({ name: 'slug', example: 'complejo-demo' })
@Public()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: MINUTE } })
@Controller('public/c/:slug')
export class PublicComplexController {
  constructor(private readonly complex: ComplexService) {}

  @Get('complex')
  async getComplex(
    @Param('slug') slug: string,
  ): Promise<PublicComplexResponse> {
    const c = await this.complex.findPublicBySlugOrThrow(slug);
    return {
      slug: c.slug,
      name: c.name,
      address: c.address,
      timezone: c.timezone,
      cancellationWindowHours: c.cancellationWindowHours,
      instagramUrl: c.instagramUrl,
      facebookUrl: c.facebookUrl,
      tiktokUrl: c.tiktokUrl,
      youtubeUrl: c.youtubeUrl,
      contactWhatsapp: c.contactWhatsapp,
      logoUrl: c.logoUrl,
    };
  }
}
