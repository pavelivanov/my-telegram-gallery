import type { Event, NodeOptions } from '@sentry/nestjs';
import {
  ERROR_SECRET_ENV_KEYS,
  redactSensitiveText,
} from '../security/redaction';

function readOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isValidSentryDsn(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      Boolean(url.username) &&
      !url.password &&
      Boolean(url.hostname) &&
      url.pathname !== '/'
    );
  } catch {
    return false;
  }
}

function readSampleRate(value: string | undefined): number {
  const parsed = Number(readOptional(value) ?? '0');
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0;
}

function scrubValue(
  value: unknown,
  secretValues: readonly (string | undefined)[],
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === 'string') {
    return redactSensitiveText(value, secretValues);
  }
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, secretValues, seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      scrubValue(item, secretValues, seen),
    ]),
  );
}

function stripUrlDetails(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.split(/[?#]/, 1)[0];
}

export function scrubSentryEvent<T extends Event>(
  event: T,
  secretValues: readonly (string | undefined)[],
): T {
  const scrubbed = scrubValue(event, secretValues) as T;
  delete scrubbed.user;
  delete scrubbed.breadcrumbs;

  const request = scrubbed.request;
  scrubbed.request = request
    ? {
        method: typeof request.method === 'string' ? request.method : undefined,
        url: stripUrlDetails(request.url),
      }
    : undefined;

  return scrubbed;
}

export function createSentryOptions(
  environment: NodeJS.ProcessEnv = process.env,
): NodeOptions | undefined {
  const dsn = readOptional(environment.SENTRY_DSN);
  if (!dsn || !isValidSentryDsn(dsn)) return undefined;

  const secretValues = ERROR_SECRET_ENV_KEYS.map((key) => environment[key]);
  const scrub = <T extends Event>(event: T): T =>
    scrubSentryEvent(event, secretValues);

  return {
    dsn,
    environment: readOptional(environment.SENTRY_ENVIRONMENT),
    release: readOptional(environment.SENTRY_RELEASE),
    sendDefaultPii: false,
    enableLogs: false,
    maxBreadcrumbs: 0,
    tracesSampleRate: readSampleRate(environment.SENTRY_TRACES_SAMPLE_RATE),
    beforeSend: scrub,
    beforeSendTransaction: scrub,
  };
}
