import { retrieveRawInitData } from '@tma.js/sdk-react';
import { api, apiUrl, getSelectedTenantSlug } from './client';
import type { Photo } from './types';

export interface StagedUpload {
  uploadId: string;
}

interface UploadIntentResponse {
  uploadId: string;
  uploadUrl: string;
  uploadMethod: 'PUT';
  expiresAt: string;
}

/** Stage 1: create intent → direct or proxy PUT. Safe to run concurrently. */
export async function stagePhoto(
  albumId: string,
  file: File,
): Promise<StagedUpload> {
  const contentType = file.type || 'application/octet-stream';
  const intent = await api<UploadIntentResponse>('/photos/upload', {
    method: 'POST',
    body: JSON.stringify({ albumId, contentType, size: file.size }),
  });
  const isProxyUpload = intent.uploadUrl.startsWith('/');
  const tenantSlug = getSelectedTenantSlug();
  const put = await fetch(apiUrl(intent.uploadUrl), {
    method: intent.uploadMethod,
    headers: {
      'Content-Type': contentType,
      ...(isProxyUpload
        ? {
            Authorization: `tma ${retrieveRawInitData()}`,
            ...(tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {}),
          }
        : {}),
    },
    body: file,
  });
  if (!put.ok) {
    throw new Error(`Upload failed: ${put.status}`);
  }
  return { uploadId: intent.uploadId };
}

/** Stage 2: sequential confirmation preserves the selected display order. */
export function confirmPhoto(staged: StagedUpload): Promise<Photo> {
  return api<Photo>('/photos/confirm', {
    method: 'POST',
    body: JSON.stringify({ uploadId: staged.uploadId }),
  });
}
