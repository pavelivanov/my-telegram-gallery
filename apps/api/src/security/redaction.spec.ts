import { redactSensitiveText } from './redaction';

describe('redactSensitiveText', () => {
  it('removes tenant bot tokens and encryption key configuration', () => {
    const redacted = redactSensitiveText(
      'botToken=700000001:secret TENANT_BOT_ENCRYPTION_KEYS=v1:keymaterial {"bot_token":"700000002:json-secret"}',
      [],
    );

    expect(redacted).toBe(
      'botToken=[REDACTED] TENANT_BOT_ENCRYPTION_KEYS=[REDACTED] {"bot_token":"[REDACTED]"}',
    );
    expect(redacted).not.toContain('secret');
    expect(redacted).not.toContain('keymaterial');
    expect(redacted).not.toContain('json-secret');
  });
});
