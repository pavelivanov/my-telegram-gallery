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

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(`/api${path}`), {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `tma ${retrieveRawInitData()}`,
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
