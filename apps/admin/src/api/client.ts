import { retrieveRawInitData } from '@tma.js/sdk-react';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
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
