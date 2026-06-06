import { IsInt, IsMimeType, IsOptional, IsString, Min } from 'class-validator';

export class CreateUploadDto {
  @IsString()
  albumId: string;

  @IsMimeType()
  contentType: string;
}

export class ConfirmUploadDto {
  @IsString()
  albumId: string;

  @IsString()
  key: string;

  @IsMimeType()
  mimeType: string;

  @IsInt()
  @Min(1)
  size: number;

  @IsOptional()
  @IsInt()
  width?: number;

  @IsOptional()
  @IsInt()
  height?: number;
}
