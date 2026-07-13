import type { Readable } from 'node:stream';

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export interface StorageWriteOptions {
  contentType: string;
  contentLength: number;
}

export interface StorageObjectMetadata {
  contentType: string;
  contentLength: number;
  etag?: string;
  lastModified?: Date;
}

export interface StoredObject extends StorageObjectMetadata {
  body: Readable;
}

export interface StorageCapabilities {
  presignGet: boolean;
  presignPut: boolean;
}

export interface ObjectStorage {
  readonly capabilities: StorageCapabilities;
  checkReady(): Promise<void>;
  put(
    key: string,
    body: Readable | Buffer,
    options: StorageWriteOptions,
  ): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  stat(key: string): Promise<StorageObjectMetadata | null>;
  delete(key: string): Promise<void>;
  presignPut?(
    key: string,
    options: StorageWriteOptions,
    expiresInSeconds: number,
  ): Promise<string>;
  presignGet?(key: string, expiresInSeconds: number): Promise<string>;
}
