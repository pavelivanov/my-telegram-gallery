import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';

export function authenticateOperator(config: ConfigService): string {
  const expectedHash = config.get<string>('OPS_TOKEN_SHA256');
  const providedToken = config.get<string>('OPS_TOKEN');
  const actor = config.get<string>('OPS_ACTOR');
  if (!expectedHash || !providedToken || !actor) {
    throw new Error(
      'Operator CLI requires OPS_TOKEN_SHA256, OPS_TOKEN, and OPS_ACTOR',
    );
  }
  const actualHash = createHash('sha256').update(providedToken).digest();
  const expected = Buffer.from(expectedHash, 'hex');
  if (
    expected.length !== actualHash.length ||
    !timingSafeEqual(expected, actualHash)
  ) {
    throw new Error('Operator authentication failed');
  }
  return actor;
}
