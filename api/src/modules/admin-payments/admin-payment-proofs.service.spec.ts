import { Test } from '@nestjs/testing';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { NOW } from '../../shared/testing/fixtures';
import { Clock, FixedClock } from '../../shared/time/clock';
import { STORAGE_PROVIDER_TOKEN } from '../storage/providers/storage-provider.interface';
import {
  AdminPaymentProofsService,
  PROOF_SIGNED_URL_TTL_SEC,
} from './admin-payment-proofs.service';
import { AdminPaymentsService } from './admin-payments.service';

const COMPLEX = 'c-1';
const ADMIN = 'u-admin';
const BOOKING = 'b-1';
const PROOF = 'p-1';

const proofRow = (over: Record<string, unknown> = {}) => ({
  id: PROOF,
  bookingId: BOOKING,
  fileKey: 'payment-proofs/b-1/aa.pdf',
  status: 'PENDING',
  payerName: 'Juan',
  playersCount: 2,
  declaredAmount: 6000,
  amount: null,
  createdAt: new Date('2026-01-01T10:00:00Z'),
  reviewedAt: null,
  reviewedById: null,
  rejectReason: null,
  ...over,
});

describe('AdminPaymentProofsService', () => {
  let service: AdminPaymentProofsService;
  let proof: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    updateMany: jest.Mock;
    findUniqueOrThrow: jest.Mock;
  };
  let booking: { findFirst: jest.Mock; findUniqueOrThrow: jest.Mock };
  let createPayment: jest.Mock;
  let storage: { signedUrl: jest.Mock };

  beforeEach(async () => {
    proof = {
      findFirst: jest.fn().mockResolvedValue(proofRow()),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue(proofRow({ status: 'APPROVED', amount: 6000 })),
    };
    booking = {
      findFirst: jest.fn().mockResolvedValue({ id: BOOKING }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        price: 10000,
        payments: [{ amount: 4000, voidedAt: null }],
      }),
    };
    createPayment = jest.fn().mockResolvedValue(undefined);
    storage = { signedUrl: jest.fn().mockResolvedValue('https://signed') };
    const prisma: Record<string, unknown> = { paymentProof: proof, booking };
    prisma.$transaction = (fn: (tx: unknown) => unknown) => fn(prisma);

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminPaymentProofsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AdminPaymentsService, useValue: { createPayment } },
        { provide: Clock, useValue: new FixedClock(NOW) },
        { provide: STORAGE_PROVIDER_TOKEN, useValue: storage },
      ],
    }).compile();
    service = moduleRef.get(AdminPaymentProofsService);
  });

  const expectError = async (promise: Promise<unknown>, code: ErrorCode) => {
    const error = (await promise.catch((e: unknown) => e)) as AppException;
    expect(error).toBeInstanceOf(AppException);
    expect(error.code).toBe(code);
  };

  it('list 404s for a booking outside the complex', async () => {
    booking.findFirst.mockResolvedValue(null);
    await expectError(service.list(COMPLEX, BOOKING), ErrorCode.NOT_FOUND);
  });

  it('fileUrl signs the private key with a 10 minute TTL', async () => {
    await expect(service.fileUrl(COMPLEX, BOOKING, PROOF)).resolves.toEqual({
      url: 'https://signed',
    });
    expect(storage.signedUrl).toHaveBeenCalledWith(
      'payment-proofs/b-1/aa.pdf',
      PROOF_SIGNED_URL_TTL_SEC,
      'paymentProofs',
    );
    expect(PROOF_SIGNED_URL_TTL_SEC).toBe(600);
  });

  it('list returns the payer name, players count and declared amount', async () => {
    proof.findMany.mockResolvedValue([proofRow()]);
    const [row] = await service.list(COMPLEX, BOOKING);
    expect(row).toMatchObject({
      payerName: 'Juan',
      playersCount: 2,
      declaredAmount: 6000,
      amount: null,
    });
  });

  it('approve defaults to the declared amount and registers a TRANSFER by the admin', async () => {
    proof.findFirst.mockResolvedValue(proofRow({ declaredAmount: 2500 }));
    const result = await service.approve(COMPLEX, ADMIN, BOOKING, PROOF);
    expect(proof.updateMany).toHaveBeenCalledWith({
      where: { id: PROOF, status: 'PENDING' },
      data: expect.objectContaining({
        status: 'APPROVED',
        amount: 2500,
        reviewedById: ADMIN,
      }) as unknown,
    });
    expect(createPayment).toHaveBeenCalledTimes(1);
    expect(createPayment).toHaveBeenCalledWith(
      expect.anything(),
      COMPLEX,
      ADMIN,
      BOOKING,
      expect.objectContaining({
        amount: 2500,
        method: 'TRANSFER',
        payerName: proofRow().payerName,
        proofId: PROOF,
      }),
    );
    expect(result.status).toBe('APPROVED');
  });

  it('approve caps the default to the current balance', async () => {
    proof.findFirst.mockResolvedValue(proofRow({ declaredAmount: 9000 }));
    await service.approve(COMPLEX, ADMIN, BOOKING, PROOF);
    expect(createPayment).toHaveBeenCalledWith(
      expect.anything(),
      COMPLEX,
      ADMIN,
      BOOKING,
      expect.objectContaining({ amount: 6000 }),
    );
  });

  it('approve of a legacy proof (declaredAmount 0) falls back to the balance', async () => {
    proof.findFirst.mockResolvedValue(proofRow({ declaredAmount: 0 }));
    const result = await service.approve(COMPLEX, ADMIN, BOOKING, PROOF);
    expect(proof.updateMany).toHaveBeenCalledWith({
      where: { id: PROOF, status: 'PENDING' },
      data: expect.objectContaining({ amount: 6000 }) as unknown,
    });
    expect(createPayment).toHaveBeenCalledWith(
      expect.anything(),
      COMPLEX,
      ADMIN,
      BOOKING,
      expect.objectContaining({ amount: 6000, method: 'TRANSFER' }),
    );
    expect(result.status).toBe('APPROVED');
  });

  it('approve uses the amount given by the admin', async () => {
    await service.approve(COMPLEX, ADMIN, BOOKING, PROOF, 2500);
    expect(createPayment).toHaveBeenCalledWith(
      expect.anything(),
      COMPLEX,
      ADMIN,
      BOOKING,
      expect.objectContaining({ amount: 2500 }),
    );
  });

  it('approve of a non-PENDING proof conflicts without touching payments', async () => {
    proof.findFirst.mockResolvedValue(proofRow({ status: 'APPROVED' }));
    await expectError(
      service.approve(COMPLEX, ADMIN, BOOKING, PROOF),
      ErrorCode.PAYMENT_PROOF_NOT_PENDING,
    );
    expect(createPayment).not.toHaveBeenCalled();
  });

  it('approve loses the race when the conditional update matches nothing', async () => {
    proof.updateMany.mockResolvedValue({ count: 0 });
    await expectError(
      service.approve(COMPLEX, ADMIN, BOOKING, PROOF),
      ErrorCode.PAYMENT_PROOF_NOT_PENDING,
    );
    expect(createPayment).not.toHaveBeenCalled();
  });

  it('approve of a fully paid booking without amount is not payable', async () => {
    booking.findUniqueOrThrow.mockResolvedValue({
      price: 10000,
      payments: [{ amount: 10000, voidedAt: null }],
    });
    await expectError(
      service.approve(COMPLEX, ADMIN, BOOKING, PROOF),
      ErrorCode.BOOKING_NOT_PAYABLE,
    );
  });

  it('reject stores the reason and reviewer; rejects a reviewed proof', async () => {
    proof.findUniqueOrThrow.mockResolvedValue(
      proofRow({ status: 'REJECTED', rejectReason: 'Ilegible' }),
    );
    const result = await service.reject(
      COMPLEX,
      ADMIN,
      BOOKING,
      PROOF,
      'Ilegible',
    );
    expect(proof.updateMany).toHaveBeenCalledWith({
      where: { id: PROOF, status: 'PENDING' },
      data: expect.objectContaining({
        status: 'REJECTED',
        rejectReason: 'Ilegible',
        reviewedById: ADMIN,
      }) as unknown,
    });
    expect(result.rejectReason).toBe('Ilegible');

    proof.findFirst.mockResolvedValue(proofRow({ status: 'REJECTED' }));
    await expectError(
      service.reject(COMPLEX, ADMIN, BOOKING, PROOF, 'x'),
      ErrorCode.PAYMENT_PROOF_NOT_PENDING,
    );
  });

  it('404s for a proof outside the booking/complex', async () => {
    proof.findFirst.mockResolvedValue(null);
    await expectError(
      service.fileUrl(COMPLEX, BOOKING, PROOF),
      ErrorCode.NOT_FOUND,
    );
  });
});
