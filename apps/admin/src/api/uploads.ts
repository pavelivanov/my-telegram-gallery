import { api } from './client';
import type { Photo } from './types';

async function imageDimensions(
  file: File,
): Promise<{ width?: number; height?: number }> {
  try {
    const bitmap = await createImageBitmap(file);
    const dims = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dims;
  } catch {
    return {};
  }
}

export interface StagedUpload {
  key: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
}

/** Stage 1: presign → direct PUT to R2. Safe to run concurrently. */
export async function stagePhoto(
  albumId: string,
  file: File,
): Promise<StagedUpload> {
  const contentType = file.type || 'application/octet-stream';
  const { key, uploadUrl } = await api<{ key: string; uploadUrl: string }>(
    '/photos/upload',
    {
      method: 'POST',
      body: JSON.stringify({ albumId, contentType }),
    },
  );

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  });
  if (!put.ok) {
    throw new Error(`R2 upload failed: ${put.status}`);
  }

  const dims = await imageDimensions(file);
  return { key, mimeType: contentType, size: file.size, ...dims };
}

/**
 * Stage 2: confirm — the server assigns the photo the album's front
 * position at confirm time, so confirm order controls display order.
 */
export function confirmPhoto(
  albumId: string,
  staged: StagedUpload,
): Promise<Photo> {
  return api<Photo>('/photos/confirm', {
    method: 'POST',
    body: JSON.stringify({ albumId, ...staged }),
  });
}
