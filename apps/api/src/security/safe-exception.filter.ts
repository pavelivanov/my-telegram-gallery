import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import type { TgRequest } from '../auth/request-context';
import { redactErrorText } from './redaction';

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SafeExceptionFilter.name);

  constructor(private readonly config: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<TgRequest>();
    const response = http.getResponse<Response>();
    const requestId = request.requestId ?? randomUUID();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500) {
      const detail =
        exception instanceof Error
          ? redactErrorText(exception.stack ?? exception.message, this.config)
          : 'Non-Error exception';
      this.logger.error(
        JSON.stringify({
          event: 'request_error',
          requestId,
          statusCode: status,
          errorType:
            exception instanceof Error ? exception.name : typeof exception,
          detail,
        }),
      );
    }

    if (status === 429) {
      response.status(status).json({
        statusCode: status,
        error: 'Too Many Requests',
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please wait and try again.',
        requestId,
      });
      return;
    }

    if (!(exception instanceof HttpException)) {
      response.status(status).json({
        statusCode: status,
        error: 'Internal Server Error',
        message: 'The request could not be completed.',
        requestId,
      });
      return;
    }

    const exceptionResponse = exception.getResponse();
    const body =
      typeof exceptionResponse === 'object'
        ? exceptionResponse
        : {
            statusCode: status,
            error: HttpStatus[status],
            message: exceptionResponse,
          };
    response.status(status).json({ ...body, requestId });
  }
}
