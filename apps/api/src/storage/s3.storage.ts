import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import type {
  ObjectStorage,
  StorageObjectMetadata,
  StorageWriteOptions,
  StoredObject,
} from './storage.types';

type Signer = typeof getSignedUrl;

function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const named =
    'name' in error && ['NoSuchKey', 'NotFound'].includes(String(error.name));
  const status =
    '$metadata' in error &&
    typeof error.$metadata === 'object' &&
    error.$metadata !== null &&
    'httpStatusCode' in error.$metadata
      ? error.$metadata.httpStatusCode
      : undefined;
  return named || status === 404;
}

export function createS3ClientConfig(config: ConfigService): S3ClientConfig {
  const endpoint = config.get<string>('S3_ENDPOINT');
  return {
    region: config.getOrThrow<string>('S3_REGION'),
    ...(endpoint ? { endpoint } : {}),
    credentials: {
      accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY_ID'),
      secretAccessKey: config.getOrThrow<string>('S3_SECRET_ACCESS_KEY'),
    },
    forcePathStyle: config.getOrThrow<boolean>('S3_FORCE_PATH_STYLE'),
  };
}

export class S3Storage implements ObjectStorage {
  readonly capabilities = { presignGet: true, presignPut: true } as const;
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(
    config: ConfigService,
    client?: S3Client,
    private readonly signer: Signer = getSignedUrl,
  ) {
    this.bucket = config.getOrThrow<string>('S3_BUCKET');
    this.client = client ?? new S3Client(createS3ClientConfig(config));
  }

  async checkReady(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  async put(
    key: string,
    body: Readable | Buffer,
    options: StorageWriteOptions,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentLength: options.contentLength,
        ContentType: options.contentType,
      }),
    );
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!result.Body || !(result.Body instanceof Readable)) {
        throw new Error('S3 returned an unreadable object body');
      }
      return {
        body: result.Body,
        contentLength: result.ContentLength ?? 0,
        contentType: result.ContentType ?? 'application/octet-stream',
        etag: result.ETag,
        lastModified: result.LastModified,
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async stat(key: string): Promise<StorageObjectMetadata | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        contentLength: result.ContentLength ?? 0,
        contentType: result.ContentType ?? 'application/octet-stream',
        etag: result.ETag,
        lastModified: result.LastModified,
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  presignPut(
    key: string,
    options: StorageWriteOptions,
    expiresInSeconds: number,
  ): Promise<string> {
    return this.signer(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentLength: options.contentLength,
        ContentType: options.contentType,
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  presignGet(key: string, expiresInSeconds: number): Promise<string> {
    return this.signer(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }
}
