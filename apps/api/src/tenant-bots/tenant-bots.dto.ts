import { IsString, Matches } from 'class-validator';

const APP_SHORT_NAME_PATTERN = /^[A-Za-z0-9_]{3,64}$/;
const BOT_TOKEN_PATTERN = /^[1-9]\d{4,15}:[A-Za-z0-9_-]{20,128}$/;

export class ConnectTenantBotDto {
  @IsString()
  @Matches(BOT_TOKEN_PATTERN, { message: 'botToken is not a valid bot token' })
  botToken: string;

  @IsString()
  @Matches(APP_SHORT_NAME_PATTERN, {
    message: 'adminAppShortName must be 3-64 letters, numbers, or underscores',
  })
  adminAppShortName: string;

  @IsString()
  @Matches(APP_SHORT_NAME_PATTERN, {
    message:
      'galleryAppShortName must be 3-64 letters, numbers, or underscores',
  })
  galleryAppShortName: string;
}
