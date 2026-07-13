import { type ArgumentsHost, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { TgRequest } from '../auth/request-context';
import { SafeExceptionFilter } from './safe-exception.filter';

describe('SafeExceptionFilter', () => {
  it('redacts configured and request secrets from captured logs', () => {
    const secret = 'seeded-bot-secret';
    const database = 'postgresql://secret-database';
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const json = jest.fn();
    const response = {
      status: jest.fn().mockReturnThis(),
      json,
    } as unknown as Response;
    const request = { requestId: 'request_1234' } as TgRequest;
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as ArgumentsHost;
    const filter = new SafeExceptionFilter(
      new ConfigService({
        TELEGRAM_BOT_TOKEN: secret,
        DATABASE_URL: database,
      }),
    );

    filter.catch(
      new Error(
        `${secret} ${database} authorization=tma-secret ?signature=signed-value&expires=123`,
      ),
      host,
    );

    expect(logger).toHaveBeenCalledWith(expect.not.stringContaining(secret));
    expect(logger).toHaveBeenCalledWith(expect.not.stringContaining(database));
    expect(logger).toHaveBeenCalledWith(
      expect.not.stringContaining('signed-value'),
    );
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'The request could not be completed.',
        requestId: 'request_1234',
      }),
    );
    logger.mockRestore();
  });
});
