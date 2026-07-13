import { GalleryTheme } from '../../generated/prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { TENANT_SLUG_PATTERN } from './tenant.constants';

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(100)
  name: string;

  @IsString()
  @Matches(TENANT_SLUG_PATTERN, {
    message: 'slug must be 3-30 lowercase letters, numbers, or underscores',
  })
  slug: string;
}

export class AddTenantAdminDto {
  @IsString()
  @Matches(/^[1-9]\d{0,15}$/, {
    message: 'tgUserId must be a positive decimal Telegram user ID',
  })
  tgUserId: string;
}

export class UpdateTenantThemeDto {
  @IsEnum(GalleryTheme)
  theme: GalleryTheme;
}
