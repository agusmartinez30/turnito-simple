import { Test } from '@nestjs/testing';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { complexFixture } from '../../shared/testing/fixtures';
import { ComplexService } from './complex.service';

describe('ComplexService', () => {
  let service: ComplexService;
  let findUnique: jest.Mock;
  let findMany: jest.Mock;
  let create: jest.Mock;
  let update: jest.Mock;

  beforeEach(async () => {
    findUnique = jest
      .fn()
      .mockImplementation(
        ({ where }: { where: { id?: string; slug?: string } }) =>
          Promise.resolve(
            where.id === complexFixture.id || where.slug === complexFixture.slug
              ? complexFixture
              : null,
          ),
      );
    findMany = jest.fn().mockResolvedValue([]);
    create = jest
      .fn()
      .mockImplementation(({ data }: { data: object }) =>
        Promise.resolve({ ...complexFixture, id: 'c-new', ...data }),
      );
    update = jest
      .fn()
      .mockImplementation(({ data }: { data: object }) =>
        Promise.resolve({ ...complexFixture, ...data }),
      );
    const moduleRef = await Test.createTestingModule({
      providers: [
        ComplexService,
        {
          provide: PrismaService,
          useValue: { complex: { findUnique, findMany, create, update } },
        },
      ],
    }).compile();
    service = moduleRef.get(ComplexService);
  });

  it('findByIdOrThrow cachea por id: dos llamadas, una query', async () => {
    await service.findByIdOrThrow(complexFixture.id);
    await service.findByIdOrThrow(complexFixture.id);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('id inexistente → 404 NOT_FOUND', async () => {
    await expect(service.findByIdOrThrow('nope')).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
      message: 'Complejo no encontrado.',
    });
  });

  it('findBySlugOrThrow resuelve por slug y comparte el cache por id', async () => {
    expect((await service.findBySlugOrThrow('complejo-demo')).id).toBe('c1');
    await service.findBySlugOrThrow('complejo-demo');
    await service.findByIdOrThrow('c1');
    expect(findUnique).toHaveBeenCalledTimes(1);
    await expect(service.findBySlugOrThrow('otro')).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });

  it('update escribe por id e invalida solo ese complejo', async () => {
    await service.findByIdOrThrow('c1'); // calienta
    const updated = await service.update('c1', { name: 'Complejo Norte' });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { name: 'Complejo Norte' },
    });
    expect(updated.name).toBe('Complejo Norte');

    findUnique.mockResolvedValue({ ...complexFixture, name: 'Complejo Norte' });
    expect((await service.findByIdOrThrow('c1')).name).toBe('Complejo Norte');
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('create deriva el slug del nombre y agrega sufijo si está tomado', async () => {
    const input = { name: 'Club Río', address: 'x', timezone: 'UTC' };
    await service.create(input);
    expect(create).toHaveBeenCalledWith({
      data: { ...input, slug: 'club-rio' },
    });

    findMany.mockResolvedValue([{ slug: 'club-rio' }]);
    await service.create(input);
    expect(create).toHaveBeenLastCalledWith({
      data: { ...input, slug: 'club-rio-2' },
    });
  });
});
