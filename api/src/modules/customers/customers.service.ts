import { Injectable } from '@nestjs/common';
import { Customer, CustomerSource } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { isUniqueViolationOn } from '../../shared/prisma-errors';
import { normalizePhone } from '../../shared/customers/phone';

export const CUSTOMER_MESSAGES = {
  notFound: 'Cliente no encontrado.',
  archived: 'Ese cliente está archivado.',
  phoneExists: 'Ya hay un cliente con ese teléfono.',
};

export interface UpsertCustomerInput {
  firstName: string;
  lastName?: string | null;
  phone: string;
}

/** Clientes del complejo (docs/17-admin-customers.md). Sin cuenta: no inician sesión. */
@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Un cliente de otro complejo devuelve el mismo 404 que uno inexistente. */
  async findOrThrow(complexId: string, id: string): Promise<Customer> {
    const customer = await this.prisma.customer.findFirst({
      where: { id, complexId },
    });
    if (!customer) {
      throw new AppException(ErrorCode.NOT_FOUND, CUSTOMER_MESSAGES.notFound);
    }
    return customer;
  }

  /** Para reservar: además de existir, el cliente tiene que estar activo. */
  async findActiveOrThrow(complexId: string, id: string): Promise<Customer> {
    const customer = await this.findOrThrow(complexId, id);
    if (!customer.isActive) {
      throw new AppException(
        ErrorCode.CUSTOMER_ARCHIVED,
        CUSTOMER_MESSAGES.archived,
      );
    }
    return customer;
  }

  /**
   * Alta desde la app pública: idempotente por `(complexId, phone)`, así dos pedidos
   * simultáneos con el mismo teléfono terminan en el mismo cliente.
   *
   * `create` + catch de P2002 en vez de `prisma.customer.upsert`: Prisma *puede* compilar un
   * upsert simple a `INSERT ... ON CONFLICT`, pero es una optimización interna condicionada y
   * la corrección no debería depender de ella.
   *
   * Se pisa el nombre porque es el dato más fresco que dio la persona; el apellido solo si
   * viene uno nuevo, para no borrar el que tenía cargado el complejo. Un cliente archivado que
   * vuelve a pedir turno se reactiva: por definición está activo otra vez.
   */
  async upsertByPhone(
    complexId: string,
    input: UpsertCustomerInput,
  ): Promise<Customer> {
    const phone = normalizePhone(input.phone);
    const names = {
      firstName: input.firstName,
      ...(input.lastName ? { lastName: input.lastName } : {}),
    };
    try {
      return await this.prisma.customer.create({
        data: {
          complexId,
          phone,
          ...names,
          source: CustomerSource.PUBLIC,
        },
      });
    } catch (err) {
      if (!isUniqueViolationOn(err, 'phone')) throw err;
      // Carrera: otro request creó el mismo teléfono entre el create y este punto.
      return this.prisma.customer.update({
        where: { complexId_phone: { complexId, phone } },
        data: { ...names, isActive: true },
      });
    }
  }
}
