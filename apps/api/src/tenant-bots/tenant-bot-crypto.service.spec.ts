import { ConfigService } from '@nestjs/config';
import { TenantBotCryptoService } from './tenant-bot-crypto.service';

function service(keys = [{ id: 'active', key: Buffer.alloc(32, 7) }]) {
  return new TenantBotCryptoService(
    new ConfigService({ TENANT_BOT_ENCRYPTION_KEYS: keys }),
  );
}

describe('TenantBotCryptoService', () => {
  it('round-trips a token with tenant-bound authenticated encryption', () => {
    const crypto = service();
    const encrypted = crypto.encrypt(
      'tenant-alpha',
      '700000001:tenant_bot_secret_token_1234567890',
    );

    expect(encrypted).toMatchObject({ keyId: 'active' });
    expect(encrypted.tokenIv).toHaveLength(12);
    expect(encrypted.tokenAuthTag).toHaveLength(16);
    expect(
      Buffer.from(encrypted.tokenCiphertext).toString('utf8'),
    ).not.toContain('tenant_bot_secret');
    expect(crypto.decrypt({ tenantId: 'tenant-alpha', ...encrypted })).toBe(
      '700000001:tenant_bot_secret_token_1234567890',
    );
  });

  it('cannot move ciphertext to another tenant', () => {
    const crypto = service();
    const encrypted = crypto.encrypt(
      'tenant-alpha',
      '700000001:tenant_bot_secret_token_1234567890',
    );

    expect(() =>
      crypto.decrypt({ tenantId: 'tenant-beta', ...encrypted }),
    ).toThrow();
  });

  it('decrypts with a retained old key while encrypting with the first key', () => {
    const old = service([{ id: 'old', key: Buffer.alloc(32, 2) }]);
    const encrypted = old.encrypt(
      'tenant-alpha',
      '700000001:tenant_bot_secret_token_1234567890',
    );
    const rotated = service([
      { id: 'new', key: Buffer.alloc(32, 3) },
      { id: 'old', key: Buffer.alloc(32, 2) },
    ]);

    expect(rotated.decrypt({ tenantId: 'tenant-alpha', ...encrypted })).toBe(
      '700000001:tenant_bot_secret_token_1234567890',
    );
    expect(
      rotated.encrypt('tenant-alpha', '700000001:replacement_secret_1234567890')
        .keyId,
    ).toBe('new');
  });
});
