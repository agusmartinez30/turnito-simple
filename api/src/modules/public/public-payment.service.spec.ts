import { Test } from '@nestjs/testing';
import { PaymentProofStatus } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { bookingFixture, complexFixture } from '../../shared/testing/fixtures';
import { STORAGE_PROVIDER_TOKEN } from '../storage/providers/storage-provider.interface';
import { CreatePaymentProofDto } from './dto/create-payment-proof.dto';
import { PublicPaymentService } from './public-payment.service';

const PDF = Buffer.from('%PDF-1.7\n%%EOF');

function pdfFile(overrides: Partial<Express.Multer.File> = {}) {
  return {
    buffer: PDF,
    originalname: 'comprobante.pdf',
    mimetype: 'application/pdf',
    ...overrides,
  } as Express.Multer.File;
}

function bookingRow(overrides: Record<string, unknown> = {}) {
  return {
    ...bookingFixture(),
    price: 10000,
    court: { name: 'Pádel 1' },
    payments: [],
    ...overrides,
  };
}

const dto = (
  over: Partial<CreatePaymentProofDto> = {},
): CreatePaymentProofDto => ({ payerName: 'Juan', amount: 4000, ...over });

const group = (status: PaymentProofStatus, count: number, sum = 0) => ({
  status,
  _count: { _all: count },
  _sum: { declaredAmount: sum },
});

async function expectCode(promise: Promise<unknown>, code: ErrorCode) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppException);
  expect((error as AppException).code).toBe(code);
  return error as AppException;
}

describe('PublicPaymentService', () => {
  let service: PublicPaymentService;
  let findFirst: jest.Mock;
  let findUniqueOrThrow: jest.Mock;
  let groupBy: jest.Mock;
  let proofCreate: jest.Mock;
  let queryRaw: jest.Mock;
  let uploadPrivate: jest.Mock;
  let removePrivate: jest.Mock;

  beforeEach(async () => {
    findFirst = jest.fn().mockResolvedValue(bookingRow());
    findUniqueOrThrow = jest
      .fn()
      .mockResolvedValue({ status: 'CONFIRMED', price: 10000, payments: [] });
    groupBy = jest.fn().mockResolvedValue([]);
    proofCreate = jest.fn().mockResolvedValue({});
    queryRaw = jest.fn().mockResolvedValue([]);
    uploadPrivate = jest.fn().mockResolvedValue(undefined);
    removePrivate = jest.fn().mockResolvedValue(undefined);
    const prisma: Record<string, unknown> = {
      booking: { findFirst, findUniqueOrThrow },
      paymentProof: { groupBy, create: proofCreate },
      $queryRaw: queryRaw,
    };
    prisma.$transaction = (fn: (tx: unknown) => unknown) => fn(prisma);
    const moduleRef = await Test.createTestingModule({
      providers: [
        PublicPaymentService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: STORAGE_PROVIDER_TOKEN,
          useValue: { uploadPrivate, removePrivate },
        },
      ],
    }).compile();
    service = moduleRef.get(PublicPaymentService);
  });

  describe('view', () => {
    it('returns null bank data and an untouched balance when nothing is configured', async () => {
      const res = await service.view(complexFixture, 'b1');
      expect(res.bank).toEqual({ cbu: null, alias: null, holderName: null });
      expect(res.proofs).toEqual({
        pendingCount: 0,
        approvedCount: 0,
        rejectedCount: 0,
      });
      expect(res.booking).toMatchObject({
        courtName: 'Pádel 1',
        price: 10000,
        paidAmount: 0,
        pendingAmount: 10000,
        pendingProofsAmount: 0,
        remaining: 10000,
        fullyCovered: false,
      });
    });

    it('computes the balance ignoring voided payments', async () => {
      findFirst.mockResolvedValue(
        bookingRow({
          payments: [
            { amount: 4000, voidedAt: null },
            { amount: 3000, voidedAt: new Date() },
          ],
        }),
      );
      const res = await service.view(
        { ...complexFixture, bankCbu: '0'.repeat(22), bankAlias: 'club.alias' },
        'b1',
      );
      expect(res.bank.cbu).toBe('0'.repeat(22));
      expect(res.booking).toMatchObject({
        paidAmount: 4000,
        pendingAmount: 6000,
        remaining: 6000,
      });
    });

    it('discounts PENDING proofs from the remaining balance and exposes only aggregates', async () => {
      findFirst.mockResolvedValue(
        bookingRow({ payments: [{ amount: 2000, voidedAt: null }] }),
      );
      groupBy.mockResolvedValue([
        group(PaymentProofStatus.PENDING, 2, 5000),
        group(PaymentProofStatus.APPROVED, 1, 9999),
        group(PaymentProofStatus.REJECTED, 3, 9999),
      ]);
      const res = await service.view(complexFixture, 'b1');
      expect(res.booking).toMatchObject({
        paidAmount: 2000,
        pendingAmount: 8000,
        pendingProofsAmount: 5000,
        remaining: 3000,
        fullyCovered: false,
      });
      expect(res.proofs).toEqual({
        pendingCount: 2,
        approvedCount: 1,
        rejectedCount: 3,
      });
      expect(JSON.stringify(res)).not.toMatch(/payerName|declaredAmount/);
    });

    it('is fully covered when pending proofs cover the rest (remaining never negative)', async () => {
      groupBy.mockResolvedValue([group(PaymentProofStatus.PENDING, 1, 12000)]);
      const res = await service.view(complexFixture, 'b1');
      expect(res.booking.remaining).toBe(0);
      expect(res.booking.fullyCovered).toBe(true);
    });

    it('404s for a booking outside the complex', async () => {
      findFirst.mockResolvedValue(null);
      await expectCode(service.view(complexFixture, 'b1'), ErrorCode.NOT_FOUND);
      expect(findFirst.mock.calls[0][0].where).toMatchObject({
        id: 'b1',
        court: { complexId: complexFixture.id },
      });
    });

    it('rejects a cancelled booking as not payable', async () => {
      findFirst.mockResolvedValue(bookingRow({ status: 'CANCELLED' }));
      await expectCode(
        service.view(complexFixture, 'b1'),
        ErrorCode.BOOKING_NOT_PAYABLE,
      );
    });
  });

  describe('uploadProof', () => {
    it('stores the PDF privately and creates a PENDING proof with payer data, under a booking row lock', async () => {
      await service.uploadProof(
        complexFixture,
        'b1',
        dto({ payerName: 'Ana', playersCount: 2, amount: 5000 }),
        pdfFile(),
      );
      const input = uploadPrivate.mock.calls[0][0];
      expect(input.key).toMatch(/^payment-proofs\/b1\/[0-9a-f]+\.pdf$/);
      expect(input.contentType).toBe('application/pdf');
      expect(input.bucket).toBe('paymentProofs');
      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect(proofCreate).toHaveBeenCalledWith({
        data: {
          bookingId: 'b1',
          fileKey: input.key,
          payerName: 'Ana',
          playersCount: 2,
          declaredAmount: 5000,
        },
      });
    });

    it('stores a null playersCount when omitted', async () => {
      await service.uploadProof(complexFixture, 'b1', dto(), pdfFile());
      expect(proofCreate.mock.calls[0][0].data.playersCount).toBeNull();
    });

    it('allows several PENDING proofs for the same booking', async () => {
      groupBy.mockResolvedValue([group(PaymentProofStatus.PENDING, 1, 3000)]);
      await service.uploadProof(
        complexFixture,
        'b1',
        dto({ amount: 7000 }),
        pdfFile(),
      );
      expect(proofCreate).toHaveBeenCalled();
    });

    it('accepts exactly the remaining amount', async () => {
      groupBy.mockResolvedValue([group(PaymentProofStatus.PENDING, 1, 3000)]);
      await service.uploadProof(
        complexFixture,
        'b1',
        dto({ amount: 7000 }),
        pdfFile(),
      );
      expect(proofCreate).toHaveBeenCalledTimes(1);
    });

    it('rejects an amount above the remaining balance with details.amount, before uploading', async () => {
      groupBy.mockResolvedValue([group(PaymentProofStatus.PENDING, 1, 3000)]);
      const error = await expectCode(
        service.uploadProof(
          complexFixture,
          'b1',
          dto({ amount: 7001 }),
          pdfFile(),
        ),
        ErrorCode.VALIDATION_ERROR,
      );
      expect(error.details?.amount).toHaveLength(1);
      expect(uploadPrivate).not.toHaveBeenCalled();
    });

    it('re-checks inside the transaction: a racing proof makes the insert fail and the file is removed', async () => {
      // Lock-free pre-check sees no pending proofs; once locked, a concurrent one is visible.
      groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([group(PaymentProofStatus.PENDING, 1, 8000)]);
      await expectCode(
        service.uploadProof(
          complexFixture,
          'b1',
          dto({ amount: 4000 }),
          pdfFile(),
        ),
        ErrorCode.VALIDATION_ERROR,
      );
      expect(proofCreate).not.toHaveBeenCalled();
      expect(removePrivate).toHaveBeenCalledWith(
        uploadPrivate.mock.calls[0][0].key,
        'paymentProofs',
      );
    });

    it('requires a file', async () => {
      await expectCode(
        service.uploadProof(complexFixture, 'b1', dto(), undefined),
        ErrorCode.VALIDATION_ERROR,
      );
    });

    it('rejects a non-PDF extension', async () => {
      await expectCode(
        service.uploadProof(
          complexFixture,
          'b1',
          dto(),
          pdfFile({ originalname: 'foto.png' }),
        ),
        ErrorCode.UNSUPPORTED_FILE_TYPE,
      );
      expect(uploadPrivate).not.toHaveBeenCalled();
    });

    it('rejects a .pdf without the magic bytes', async () => {
      await expectCode(
        service.uploadProof(
          complexFixture,
          'b1',
          dto(),
          pdfFile({ buffer: Buffer.from('<html>fake</html>') }),
        ),
        ErrorCode.UNSUPPORTED_FILE_TYPE,
      );
      expect(uploadPrivate).not.toHaveBeenCalled();
    });

    it('rejects a fully paid booking', async () => {
      findFirst.mockResolvedValue(
        bookingRow({ payments: [{ amount: 10000, voidedAt: null }] }),
      );
      await expectCode(
        service.uploadProof(complexFixture, 'b1', dto(), pdfFile()),
        ErrorCode.BOOKING_NOT_PAYABLE,
      );
      expect(uploadPrivate).not.toHaveBeenCalled();
    });

    it('rejects when pending proofs already cover the price', async () => {
      groupBy.mockResolvedValue([group(PaymentProofStatus.PENDING, 2, 10000)]);
      await expectCode(
        service.uploadProof(
          complexFixture,
          'b1',
          dto({ amount: 1 }),
          pdfFile(),
        ),
        ErrorCode.BOOKING_NOT_PAYABLE,
      );
    });

    it('rejects a cancelled booking', async () => {
      findFirst.mockResolvedValue(bookingRow({ status: 'CANCELLED' }));
      await expectCode(
        service.uploadProof(complexFixture, 'b1', dto(), pdfFile()),
        ErrorCode.BOOKING_NOT_PAYABLE,
      );
    });

    it('removes the private file when the DB insert fails', async () => {
      proofCreate.mockRejectedValue(new Error('db down'));
      await expect(
        service.uploadProof(complexFixture, 'b1', dto(), pdfFile()),
      ).rejects.toThrow('db down');
      expect(removePrivate).toHaveBeenCalledWith(
        uploadPrivate.mock.calls[0][0].key,
        'paymentProofs',
      );
    });
  });
});
