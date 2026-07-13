import type { Request } from 'express';
import type { TgUser } from './tg-init-data.guard';

export interface TgAuthContext {
  authDate: number;
  startParam?: string;
  user: TgUser;
}

export type TgRequest = Request & {
  tgAuth?: TgAuthContext;
  /** Compatibility alias for existing guards and request handlers. */
  tgUser?: TgUser;
};
