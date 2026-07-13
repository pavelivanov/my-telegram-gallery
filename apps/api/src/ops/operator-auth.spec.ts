import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { authenticateOperator } from './operator-auth';

describe('operator authentication', () => {
  const token = 'operator-test-token';
  const hash = createHash('sha256').update(token).digest('hex');

  it('requires the separate operator credential and identity', () => {
    expect(
      authenticateOperator(
        new ConfigService({
          OPS_TOKEN_SHA256: hash,
          OPS_TOKEN: token,
          OPS_ACTOR: 'on-call',
        }),
      ),
    ).toBe('on-call');
    expect(() =>
      authenticateOperator(
        new ConfigService({
          OPS_TOKEN_SHA256: hash,
          OPS_TOKEN: 'wrong',
          OPS_ACTOR: 'on-call',
        }),
      ),
    ).toThrow('authentication failed');
    expect(() => authenticateOperator(new ConfigService({}))).toThrow(
      'requires',
    );
  });
});
