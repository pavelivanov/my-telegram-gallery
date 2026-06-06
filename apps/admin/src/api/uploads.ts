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

/** Presign → direct PUT to R2 → confirm. Returns the persisted photo. */
export async function uploadPhoto(albumId: string, file: File): Promise<Photo> {
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
  return api<Photo>('/photos/confirm', {
    method: 'POST',
    body: JSON.stringify({
      albumId,
      key,
      mimeType: contentType,
      size: file.size,
      ...dims,
    }),
  });
}
