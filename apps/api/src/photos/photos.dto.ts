import { IsIn, IsInt, IsString, Min } from 'class-validator';

export const ALLOWED_UPLOAD_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export class CreateUploadDto {
  @IsString()
  albumId: string;

  @IsIn(ALLOWED_UPLOAD_MIME_TYPES)
  contentType: string;

  @IsInt()
  @Min(1)
  size: number;
}

export class ConfirmUploadDto {
  @IsString()
  uploadId: string;
}
