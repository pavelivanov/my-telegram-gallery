import { constants, createWriteStream, mkdirSync, realpathSync } from 'node:fs';
import {
  access,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  stat as fileStat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type {
  ObjectStorage,
  StorageObjectMetadata,
  StorageWriteOptions,
  StoredObject,
} from './storage.types';

interface FilesystemMetadata {
  contentType: string;
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

export class FilesystemStorage implements ObjectStorage {
  readonly capabilities = { presignGet: false, presignPut: false } as const;
  private readonly root: string;

  constructor(root: string) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    this.root = realpathSync(root);
  }

  async checkReady(): Promise<void> {
    await access(this.root, constants.R_OK | constants.W_OK);
  }

  private resolveKey(key: string): string {
    const segments = key.split('/');
    if (
      !key ||
      key.includes('\\') ||
      key.includes('\0') ||
      segments.some(
        (segment) =>
          !segment ||
          segment === '.' ||
          segment === '..' ||
          !/^[a-zA-Z0-9._-]+$/.test(segment),
      )
    ) {
      throw new Error('Invalid storage key');
    }

    const resolved = resolve(this.root, ...segments);
    const fromRoot = relative(this.root, resolved);
    if (fromRoot.startsWith(`..${sep}`) || fromRoot === '..') {
      throw new Error('Storage key escapes configured root');
    }
    return resolved;
  }

  private async assertNoSymlinks(path: string): Promise<void> {
    const fromRoot = relative(this.root, path);
    let current = this.root;
    for (const segment of fromRoot.split(sep).filter(Boolean)) {
      current = resolve(current, segment);
      try {
        const info = await lstat(current);
        if (info.isSymbolicLink()) {
          throw new Error('Storage paths may not contain symbolic links');
        }
      } catch (error) {
        if (!isMissing(error)) throw error;
        return;
      }
    }
  }

  private metadataPath(path: string): string {
    return `${path}.metadata.json`;
  }

  async put(
    key: string,
    body: Readable | Buffer,
    options: StorageWriteOptions,
  ): Promise<void> {
    const target = this.resolveKey(key);
    const parent = dirname(target);
    await this.assertNoSymlinks(parent);
    await mkdir(parent, { recursive: true, mode: 0o700 });
    await this.assertNoSymlinks(parent);

    const temporary = `${target}.${randomUUID()}.tmp`;
    const temporaryMetadata = `${temporary}.metadata.json`;
    const source = Buffer.isBuffer(body) ? Readable.from([body]) : body;
    let received = 0;
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length;
        if (received > options.contentLength) {
          callback(new Error('Stored object exceeds expected content length'));
          return;
        }
        callback(null, chunk);
      },
      flush(callback) {
        callback(
          received === options.contentLength
            ? undefined
            : new Error('Stored object content length does not match'),
        );
      },
    });

    try {
      await pipeline(
        source,
        counter,
        createWriteStream(temporary, { flags: 'wx', mode: 0o600 }),
      );
      await writeFile(
        temporaryMetadata,
        JSON.stringify({ contentType: options.contentType }),
        { flag: 'wx', mode: 0o600 },
      );
      await rename(temporary, target);
      await rename(temporaryMetadata, this.metadataPath(target));
    } catch (error) {
      await Promise.all([
        unlink(temporary).catch(() => undefined),
        unlink(temporaryMetadata).catch(() => undefined),
      ]);
      throw error;
    }
  }

  async stat(key: string): Promise<StorageObjectMetadata | null> {
    const target = this.resolveKey(key);
    await this.assertNoSymlinks(target);
    try {
      const info = await fileStat(target);
      if (!info.isFile()) return null;
      let metadata: FilesystemMetadata = {
        contentType: 'application/octet-stream',
      };
      try {
        metadata = JSON.parse(
          await readFile(this.metadataPath(target), 'utf8'),
        ) as FilesystemMetadata;
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
      return {
        contentLength: info.size,
        contentType: metadata.contentType,
        lastModified: info.mtime,
      };
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async get(key: string): Promise<StoredObject | null> {
    const metadata = await this.stat(key);
    if (!metadata) return null;
    const target = this.resolveKey(key);
    const handle = await open(
      target,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    return {
      ...metadata,
      body: handle.createReadStream(),
    };
  }

  async delete(key: string): Promise<void> {
    const target = this.resolveKey(key);
    await this.assertNoSymlinks(target);
    await Promise.all([
      unlink(target).catch((error: unknown) => {
        if (!isMissing(error)) throw error;
      }),
      unlink(this.metadataPath(target)).catch((error: unknown) => {
        if (!isMissing(error)) throw error;
      }),
    ]);
  }
}
