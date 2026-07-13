import { Readable } from 'node:stream';
import type {
  ObjectStorage,
  StorageObjectMetadata,
  StorageWriteOptions,
  StoredObject,
} from '../storage.types';

interface MemoryObject extends StorageObjectMetadata {
  buffer: Buffer;
}

async function readBody(
  body: Readable | Buffer,
  maximum: number,
): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body) {
    const buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk as string);
    total += buffer.length;
    if (total > maximum) throw new Error('Object exceeds expected length');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export class InMemoryStorage implements ObjectStorage {
  readonly objects = new Map<string, MemoryObject>();
  readonly deletedKeys: string[] = [];
  readonly capabilities: { presignGet: boolean; presignPut: boolean };

  constructor(presigning = false) {
    this.capabilities = {
      presignGet: presigning,
      presignPut: presigning,
    };
  }

  async put(
    key: string,
    body: Readable | Buffer,
    options: StorageWriteOptions,
  ): Promise<void> {
    const buffer = await readBody(body, options.contentLength);
    if (buffer.length !== options.contentLength) {
      throw new Error('Object length does not match');
    }
    this.objects.set(key, {
      buffer,
      contentLength: buffer.length,
      contentType: options.contentType,
      lastModified: new Date(),
    });
  }

  get(key: string): Promise<StoredObject | null> {
    const object = this.objects.get(key);
    if (!object) return Promise.resolve(null);
    return Promise.resolve({
      body: Readable.from([object.buffer]),
      contentLength: object.contentLength,
      contentType: object.contentType,
      etag: object.etag,
      lastModified: object.lastModified,
    });
  }

  stat(key: string): Promise<StorageObjectMetadata | null> {
    const object = this.objects.get(key);
    if (!object) return Promise.resolve(null);
    return Promise.resolve({
      contentLength: object.contentLength,
      contentType: object.contentType,
      etag: object.etag,
      lastModified: object.lastModified,
    });
  }

  delete(key: string): Promise<void> {
    this.deletedKeys.push(key);
    this.objects.delete(key);
    return Promise.resolve();
  }

  presignPut(key: string): Promise<string> {
    if (!this.capabilities.presignPut) {
      return Promise.reject(new Error('Presigning unavailable'));
    }
    return Promise.resolve(
      `https://storage.test/put/${encodeURIComponent(key)}`,
    );
  }

  presignGet(key: string): Promise<string> {
    if (!this.capabilities.presignGet) {
      return Promise.reject(new Error('Presigning unavailable'));
    }
    return Promise.resolve(
      `https://storage.test/get/${encodeURIComponent(key)}`,
    );
  }
}
