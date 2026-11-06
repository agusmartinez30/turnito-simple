import { Prisma } from '@prisma/client';

/**
 * Búsqueda de clientes por nombre, apellido o teléfono (docs/17-admin-customers.md).
 * Los tokens se AND-ean: "ana perez" matchea `firstName: 'Ana'` + `lastName: 'Pérez'`, pero
 * cada token puede caer en cualquiera de los tres campos. Prisma escapa `%` y `_` en `contains`.
 *
 * `mode: 'insensitive'` solo cubre mayúsculas: "Perez" no encuentra a "Pérez" (fuera de alcance).
 */
export function customerWhere(q: string): Prisma.CustomerWhereInput {
  const tokens = q.trim().split(/\s+/).filter(Boolean);
  return {
    AND: tokens.map((token) => {
      const contains: Prisma.StringFilter = {
        contains: token,
        mode: 'insensitive',
      };
      return {
        OR: [
          { firstName: contains },
          { lastName: contains },
          { phone: contains },
        ],
      };
    }),
  };
}

/**
 * Filtro por cliente de una reserva. Compartido por el listado de reservas, el de pagos y
 * el de turnos fijos, que antes duplicaban el `OR` a mano.
 */
export function customerSearch(q: string): Prisma.BookingWhereInput {
  return { customer: { is: customerWhere(q) } };
}
