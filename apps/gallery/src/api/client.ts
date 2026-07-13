import { retrieveRawInitData } from '@tma.js/sdk-react';

const configuredBase: unknown = import.meta.env.VITE_API_BASE_URL;
const BASE = typeof configuredBase === 'string'
  ? configuredBase.replace(/\/+$/, '')
  : '';

export function apiUrl(pathOrUrl: string): string {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${BASE}${path}`;
}

interface ApiProblem {
  code?: string;
  message?: string;
  requestId?: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
    readonly requestId: string | undefined,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  let problem: ApiProblem = {};
  try {
    problem = (await response.json()) as ApiProblem;
  } catch {
    // Non-JSON proxy failures intentionally fall back to a generic message.
  }
  return new ApiError(
    response.status,
    problem.code,
    problem.message ?? 'The request could not be completed. Please try again.',
    problem.requestId ?? response.headers.get('X-Request-Id') ?? undefined,
  );
}

export async function api<T>(
  path: string,
  init?: RequestInit,
  tenantSlug?: string,
): Promise<T> {
  const res = await fetch(apiUrl(`/api${path}`), {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `tma ${retrieveRawInitData()}`,
      ...(tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw await toApiError(res);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function publicApi<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(apiUrl(`/api/public${path}`), {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) throw await toApiError(res);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
