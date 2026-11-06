import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { complexFixture, customerFixture } from '../../shared/testing/fixtures';
import { CustomersService } from './customers.service';

const uniqueErr = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6',
    meta: { target: ['complex_id', 'phone'] },
  });

describe('CustomersService', () => {
  let service: CustomersService;
  let customer: {
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(async () => {
    customer = {
      findFirst: jest.fn().mockResolvedValue(customerFixture()),
      create: jest.fn().mockResolvedValue(customerFixture()),
      update: jest.fn().mockResolvedValue(customerFixture()),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: PrismaService, useValue: { customer } },
      ],
    }).compile();
    service = moduleRef.get(CustomersService);
  });

  describe('findOrThrow', () => {
    it('filtra por complejo: un id ajeno es el mismo 404 que uno inexistente', async () => {
      customer.findFirst.mockResolvedValue(null);
      await expect(
        service.findOrThrow(complexFixture.id, 'ajeno'),
      ).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
        message: 'Cliente no encontrado.',
      });
      expect(customer.findFirst).toHaveBeenCalledWith({
        where: { id: 'ajeno', complexId: complexFixture.id },
      });
    });
  });

  describe('findActiveOrThrow', () => {
    it('un cliente archivado no puede recibir turnos nuevos', async () => {
      customer.findFirst.mockResolvedValue(
        customerFixture({ isActive: false }),
      );
      await expect(
        service.findActiveOrThrow(complexFixture.id, 'c1'),
      ).rejects.toMatchObject({
        code: ErrorCode.CUSTOMER_ARCHIVED,
        message: 'Ese cliente está archivado.',
      });
    });

    it('uno activo se devuelve tal cual', async () => {
      await expect(
        service.findActiveOrThrow(complexFixture.id, 'c1'),
      ).resolves.toEqual(customerFixture());
    });
  });

  describe('upsertByPhone', () => {
    const input = {
      firstName: 'Carlos',
      lastName: 'Pérez',
      phone: '+54 9 11 0000 0077',
    };

    it('canoniza el teléfono al crear', async () => {
      await service.upsertByPhone(complexFixture.id, input);
      expect(customer.create).toHaveBeenCalledWith({
        data: {
          complexId: complexFixture.id,
          phone: '+5491100000077',
          firstName: 'Carlos',
          lastName: 'Pérez',
          source: 'PUBLIC',
        },
      });
      expect(customer.update).not.toHaveBeenCalled();
    });

    it('ante la carrera (P2002) reusa el existente, pisa el nombre y lo reactiva', async () => {
      customer.create.mockRejectedValue(uniqueErr());
      await service.upsertByPhone(complexFixture.id, input);
      expect(customer.update).toHaveBeenCalledWith({
        where: {
          complexId_phone: {
            complexId: complexFixture.id,
            phone: '+5491100000077',
          },
        },
        data: { firstName: 'Carlos', lastName: 'Pérez', isActive: true },
      });
    });

    it('sin apellido nuevo no borra el guardado', async () => {
      customer.create.mockRejectedValue(uniqueErr());
      await service.upsertByPhone(complexFixture.id, {
        firstName: 'Carlos',
        phone: '+5491100000077',
      });
      const data = (
        customer.update.mock.calls[0][0] as { data: Record<string, unknown> }
      ).data;
      expect(data).not.toHaveProperty('lastName');
    });

    it('un error que no sea el unique del teléfono se propaga', async () => {
      customer.create.mockRejectedValue(new Error('db caída'));
      await expect(
        service.upsertByPhone(complexFixture.id, input),
      ).rejects.toThrow('db caída');
      expect(customer.update).not.toHaveBeenCalled();
    });
  });
});
