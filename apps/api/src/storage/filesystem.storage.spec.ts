import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FilesystemStorage } from './filesystem.storage';

async function streamBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks);
}

describe('FilesystemStorage', () => {
  let root: string;
  let storage: FilesystemStorage;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'gallery-storage-'));
    storage = new FilesystemStorage(root);
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it('writes atomically and returns authoritative metadata and bytes', async () => {
    await storage.put('photos/album/original', Buffer.from('image'), {
      contentLength: 5,
      contentType: 'image/png',
    });

    await expect(storage.stat('photos/album/original')).resolves.toMatchObject({
      contentLength: 5,
      contentType: 'image/png',
    });
    const object = await storage.get('photos/album/original');
    expect(object).not.toBeNull();
    await expect(streamBuffer(object!.body)).resolves.toEqual(
      Buffer.from('image'),
    );
    await expect(
      readFile(join(root, 'photos/album/original'), 'utf8'),
    ).resolves.toBe('image');
  });

  it('checks that the configured storage root is readable and writable', async () => {
    await expect(storage.checkReady()).resolves.toBeUndefined();
  });

  it('rejects traversal, malformed keys, and symlink paths', async () => {
    await expect(storage.stat('../outside')).rejects.toThrow(
      'Invalid storage key',
    );
    await expect(storage.stat('/absolute')).rejects.toThrow(
      'Invalid storage key',
    );

    await symlink(tmpdir(), join(root, 'linked'));
    await expect(storage.stat('linked/object')).rejects.toThrow(
      'symbolic links',
    );
  });

  it('rejects mismatched content length without leaving an object', async () => {
    await expect(
      storage.put('photos/short', Buffer.from('short'), {
        contentLength: 10,
        contentType: 'image/png',
      }),
    ).rejects.toThrow('content length');
    await expect(storage.stat('photos/short')).resolves.toBeNull();
  });

  it('deletes objects idempotently', async () => {
    await storage.put('photos/delete', Buffer.from('x'), {
      contentLength: 1,
      contentType: 'image/png',
    });

    await storage.delete('photos/delete');
    await storage.delete('photos/delete');
    await expect(storage.stat('photos/delete')).resolves.toBeNull();
  });
});
