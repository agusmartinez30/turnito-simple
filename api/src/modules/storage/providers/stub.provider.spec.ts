import { ConfigService } from '@nestjs/config';
import { Env } from '../../../config/env.schema';
import { StubStorageProvider } from './stub.provider';

const config = {
  get: () => 'complex-logos',
} as unknown as ConfigService<Env, true>;

describe('StubStorageProvider private buckets', () => {
  const body = Buffer.from('%PDF-1.7');
  let stub: StubStorageProvider;

  beforeEach(() => {
    stub = new StubStorageProvider(config);
  });

  it('keeps documents and payment proofs in separate buckets', async () => {
    await stub.uploadPrivate({ key: 'a', body, contentType: 'image/jpeg' });
    await stub.uploadPrivate({
      key: 'b',
      body,
      contentType: 'application/pdf',
      bucket: 'paymentProofs',
    });

    expect(stub.privateKeys()).toEqual(['a']);
    expect(stub.paymentProofKeys()).toEqual(['b']);
  });

  it('signs and removes only within the selected bucket', async () => {
    await stub.uploadPrivate({
      key: 'b',
      body,
      contentType: 'application/pdf',
      bucket: 'paymentProofs',
    });

    await expect(stub.signedUrl('b', 600, 'paymentProofs')).resolves.toMatch(
      /^data:application\/pdf;base64,/,
    );
    await expect(stub.signedUrl('b', 600)).resolves.not.toMatch(/^data:/);

    await stub.removePrivate('b');
    expect(stub.paymentProofKeys()).toEqual(['b']);
    await stub.removePrivate('b', 'paymentProofs');
    expect(stub.paymentProofKeys()).toEqual([]);
  });
});
