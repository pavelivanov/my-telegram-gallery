import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { TenantBotEncryptionKey } from '../config/env';

const TOKEN_AAD_VERSION = 'tenant-bot-token:v1';

interface EncryptedToken {
  keyId: string;
  tokenAuthTag: Uint8Array<ArrayBuffer>;
  tokenCiphertext: Uint8Array<ArrayBuffer>;
  tokenIv: Uint8Array<ArrayBuffer>;
}

interface StoredToken extends EncryptedToken {
  tenantId: string;
}

@Injectable()
export class TenantBotCryptoService {
  private readonly active: TenantBotEncryptionKey | undefined;
  private readonly keys: ReadonlyMap<string, Buffer>;

  constructor(config: ConfigService) {
    const configured = config.getOrThrow<readonly TenantBotEncryptionKey[]>(
      'TENANT_BOT_ENCRYPTION_KEYS',
    );
    this.active = configured[0];
    this.keys = new Map(configured.map(({ id, key }) => [id, key]));
  }

  get configured(): boolean {
    return this.active !== undefined;
  }

  encrypt(tenantId: string, token: string): EncryptedToken {
    if (!this.active) {
      throw new ServiceUnavailableException(
        'Tenant bot connections are not configured',
      );
    }
    const tokenIv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.active.key, tokenIv);
    cipher.setAAD(this.aad(tenantId));
    const tokenCiphertext = Buffer.concat([
      cipher.update(token, 'utf8'),
      cipher.final(),
    ]);
    return {
      keyId: this.active.id,
      tokenAuthTag: Uint8Array.from(cipher.getAuthTag()),
      tokenCiphertext: Uint8Array.from(tokenCiphertext),
      tokenIv: Uint8Array.from(tokenIv),
    };
  }

  decrypt(stored: StoredToken): string {
    const key = this.keys.get(stored.keyId);
    if (!key) {
      throw new ServiceUnavailableException(
        'Tenant bot encryption key is unavailable',
      );
    }
    const decipher = createDecipheriv('aes-256-gcm', key, stored.tokenIv);
    decipher.setAAD(this.aad(stored.tenantId));
    decipher.setAuthTag(stored.tokenAuthTag);
    return Buffer.concat([
      decipher.update(Buffer.from(stored.tokenCiphertext)),
      decipher.final(),
    ]).toString('utf8');
  }

  private aad(tenantId: string): Buffer {
    return Buffer.from(`${TOKEN_AAD_VERSION}\0${tenantId}`, 'utf8');
  }
}
