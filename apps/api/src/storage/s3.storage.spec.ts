import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import { createS3ClientConfig, S3Storage } from './s3.storage';

function config() {
  return new ConfigService({
    S3_ENDPOINT: 'https://objects.example.com',
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'gallery',
    S3_ACCESS_KEY_ID: 'access',
    S3_SECRET_ACCESS_KEY: 'secret',
    S3_FORCE_PATH_STYLE: true,
  });
}

describe('S3Storage', () => {
  it('constructs a standard S3 client configuration', () => {
    expect(createS3ClientConfig(config())).toEqual({
      endpoint: 'https://objects.example.com',
      region: 'us-east-1',
      credentials: { accessKeyId: 'access', secretAccessKey: 'secret' },
      forcePathStyle: true,
    });
  });

  it('constructs put, head, get, delete, and presign commands without network', async () => {
    const commands: unknown[] = [];
    const responses: unknown[] = [
      {},
      {
        ContentLength: 5,
        ContentType: 'image/png',
      },
      {
        Body: Readable.from([Buffer.from('image')]),
        ContentLength: 5,
        ContentType: 'image/png',
      },
      {},
    ];
    const send = jest.fn((command: unknown) => {
      commands.push(command);
      return Promise.resolve(responses.shift());
    });
    const client = { send } as unknown as S3Client;
    const signer = jest.fn().mockResolvedValue('https://signed.test') as never;
    const storage = new S3Storage(config(), client, signer);

    await storage.put('photos/key', Buffer.from('image'), {
      contentLength: 5,
      contentType: 'image/png',
    });
    await storage.stat('photos/key');
    await storage.get('photos/key');
    await storage.delete('photos/key');
    await storage.presignPut(
      'photos/key',
      { contentLength: 5, contentType: 'image/png' },
      600,
    );
    await storage.presignGet('photos/key', 600);

    const putCommand = commands[0];
    expect(putCommand).toBeInstanceOf(PutObjectCommand);
    expect(commands[1]).toBeInstanceOf(HeadObjectCommand);
    expect(commands[2]).toBeInstanceOf(GetObjectCommand);
    expect(commands[3]).toBeInstanceOf(DeleteObjectCommand);
    expect(signer).toHaveBeenCalledTimes(2);
    expect((putCommand as PutObjectCommand).input).toMatchObject({
      Bucket: 'gallery',
      Key: 'photos/key',
      ContentLength: 5,
      ContentType: 'image/png',
    });
  });

  it('maps missing head objects to null', async () => {
    const client = {
      send: jest.fn().mockRejectedValue({
        name: 'NotFound',
        $metadata: { httpStatusCode: 404 },
      }),
    } as unknown as S3Client;
    const storage = new S3Storage(config(), client);

    await expect(storage.stat('missing')).resolves.toBeNull();
  });
});
