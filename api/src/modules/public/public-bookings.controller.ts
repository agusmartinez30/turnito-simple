import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { ComplexService } from '../complex/complex.service';
import {
  PublicBookingListItem,
  PublicBookingsService,
} from './public-bookings.service';

const MINUTE = 60_000;

/** Recent bookings of a complex (QR landing). A missing slug is a 404. */
@ApiTags('public')
@ApiParam({ name: 'slug', example: 'complejo-demo' })
@Public()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: MINUTE } })
@Controller('public/c/:slug/bookings')
export class PublicBookingsController {
  constructor(
    private readonly complex: ComplexService,
    private readonly bookings: PublicBookingsService,
  ) {}

  @Get()
  async list(@Param('slug') slug: string): Promise<PublicBookingListItem[]> {
    const complex = await this.complex.findPublicBySlugOrThrow(slug);
    return this.bookings.list(complex);
  }
}
