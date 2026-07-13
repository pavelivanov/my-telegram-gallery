import { HttpException, HttpStatus } from '@nestjs/common';

export type QuotaErrorCode =
  | 'QUOTA_ALBUMS'
  | 'QUOTA_PHOTOS'
  | 'QUOTA_STORAGE'
  | 'QUOTA_TENANTS'
  | 'QUOTA_UPLOAD_BYTES'
  | 'TENANT_SUSPENDED';

const SAFE_MESSAGES: Readonly<Record<QuotaErrorCode, string>> = {
  QUOTA_ALBUMS: 'This gallery has reached its album limit.',
  QUOTA_PHOTOS: 'This gallery has reached its photo limit.',
  QUOTA_STORAGE: 'This gallery has reached its storage limit.',
  QUOTA_TENANTS: 'You have reached your gallery limit.',
  QUOTA_UPLOAD_BYTES: 'This image exceeds the upload limit.',
  TENANT_SUSPENDED: 'This gallery is suspended and is read-only.',
};

export class QuotaException extends HttpException {
  constructor(
    readonly code: QuotaErrorCode,
    status: HttpStatus = HttpStatus.CONFLICT,
  ) {
    super(
      {
        statusCode: status,
        error: HttpStatus[status],
        code,
        message: SAFE_MESSAGES[code],
      },
      status,
    );
  }
}
