import { ConfigService } from '@nestjs/config';
import { MediaUrlSigner } from './media-url.signer';

describe('MediaUrlSigner', () => {
  const signer = new MediaUrlSigner(
    new ConfigService({
      MEDIA_URL_SIGNING_SECRET: 'test-media-signing-secret-32-bytes-long',
    }),
  );
  const now = 1_700_000_000;

  it('binds the photo, variant, and expiry', () => {
    const expires = now + 60;
    const signature = signer.sign('tenant-1', 'photo-1', 'thumb', expires);

    expect(
      signer.verify(
        'tenant-1',
        'photo-1',
        'thumb',
        String(expires),
        signature,
        now,
      ),
    ).toEqual({ expires, variant: 'thumb' });
    expect(
      signer.verify(
        'tenant-2',
        'photo-1',
        'thumb',
        String(expires),
        signature,
        now,
      ),
    ).toBeNull();
    expect(
      signer.verify(
        'tenant-1',
        'photo-2',
        'thumb',
        String(expires),
        signature,
        now,
      ),
    ).toBeNull();
    expect(
      signer.verify(
        'tenant-1',
        'photo-1',
        'preview',
        String(expires),
        signature,
        now,
      ),
    ).toBeNull();
  });

  it('rejects expired and malformed signatures', () => {
    const expires = now - 1;
    const signature = signer.sign('tenant-1', 'photo-1', 'original', expires);

    expect(
      signer.verify(
        'tenant-1',
        'photo-1',
        'original',
        String(expires),
        signature,
        now,
      ),
    ).toBeNull();
    expect(
      signer.verify(
        'tenant-1',
        'photo-1',
        'original',
        String(now + 60),
        'bad',
        now,
      ),
    ).toBeNull();
  });
});
