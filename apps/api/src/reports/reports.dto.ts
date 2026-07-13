import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReportReason } from '../../generated/prisma/client';

export class CreateReportDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  albumId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  photoId?: string;

  @IsEnum(ReportReason)
  reason!: ReportReason;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  detail?: string;
}
