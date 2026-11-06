import { Injectable } from '@nestjs/common';
import { Complex, Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { slugify, uniqueSlug } from '../../shared/slug';

export const COMPLEX_NOT_FOUND_MESSAGE = 'Complejo no encontrado.';

export interface CreateComplexInput {
  name: string;
  address: string;
  timezone: string;
}

/**
 * Complejos (docs/15-multi-complex.md). Cache en memoria por proceso, por id: se lee en casi
 * todos los requests (timezone, ventana de cancelación) y solo cambia por PATCH /admin/complex,
 * que lo invalida. El slug es inmutable, así que `idBySlug` no necesita invalidación.
 * Con una sola instancia de la API (MVP) alcanza; si se escala horizontalmente pasa a TTL corto.
 */
@Injectable()
export class ComplexService {
  private readonly byId = new Map<string, Complex>();
  private readonly idBySlug = new Map<string, string>();

  constructor(private readonly prisma: PrismaService) {}

  /** 404 con el mismo mensaje que un slug inexistente: un id ajeno nunca se distingue. */
  async findByIdOrThrow(id: string): Promise<Complex> {
    const cached = this.byId.get(id);
    if (cached) return cached;
    const complex = await this.prisma.complex.findUnique({ where: { id } });
    if (!complex) {
      throw new AppException(ErrorCode.NOT_FOUND, COMPLEX_NOT_FOUND_MESSAGE);
    }
    this.remember(complex);
    return complex;
  }

  /** Resuelve `/public/c/:slug` y `/app/[slug]`. */
  async findBySlugOrThrow(slug: string): Promise<Complex> {
    const id = this.idBySlug.get(slug);
    if (id) return this.findByIdOrThrow(id);
    const complex = await this.prisma.complex.findUnique({ where: { slug } });
    if (!complex) {
      throw new AppException(ErrorCode.NOT_FOUND, COMPLEX_NOT_FOUND_MESSAGE);
    }
    this.remember(complex);
    return complex;
  }

  /**
   * Alta desde POST /auth/register. Acepta el cliente de la transacción para crearse junto con
   * su admin. Si dos altas simultáneas calculan el mismo slug, el unique de `slug` frena a una;
   * el caller reintenta la transacción completa.
   */
  async create(
    input: CreateComplexInput,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Complex> {
    const base = slugify(input.name);
    const slug = await uniqueSlug(base, async () =>
      (
        await db.complex.findMany({
          where: { OR: [{ slug: base }, { slug: { startsWith: `${base}-` } }] },
          select: { slug: true },
        })
      ).map((c) => c.slug),
    );
    return db.complex.create({ data: { ...input, slug } });
  }

  /** PATCH /admin/complex. Invalida el cache de ese complejo (docs/08-admin-complex.md). */
  async update(id: string, data: Prisma.ComplexUpdateInput): Promise<Complex> {
    const updated = await this.prisma.complex.update({ where: { id }, data });
    this.invalidate(id);
    return updated;
  }

  invalidate(id: string): void {
    this.byId.delete(id);
  }

  private remember(complex: Complex): void {
    this.byId.set(complex.id, complex);
    this.idBySlug.set(complex.slug, complex.id);
  }
}
