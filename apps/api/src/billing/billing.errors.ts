import { HttpException, HttpStatus } from '@nestjs/common';

export type BillingErrorCode =
  | 'BILLING_NOT_CONFIGURED'
  | 'BILLING_CHECKOUT_INVALID'
  | 'BILLING_CHECKOUT_IN_PROGRESS'
  | 'BILLING_SUBSCRIPTION_INACTIVE'
  | 'BILLING_PAYMENT_CONFLICT';

const MESSAGES: Record<BillingErrorCode, string> = {
  BILLING_NOT_CONFIGURED:
    'Paid billing is not configured for this installation.',
  BILLING_CHECKOUT_INVALID:
    'This checkout is no longer available. Please request a new one.',
  BILLING_CHECKOUT_IN_PROGRESS:
    'A subscription checkout is already in progress. Finish or close it before trying again.',
  BILLING_SUBSCRIPTION_INACTIVE: 'There is no active subscription to update.',
  BILLING_PAYMENT_CONFLICT:
    'This payment needs manual review. Please contact payment support.',
};

export class BillingException extends HttpException {
  constructor(
    code: BillingErrorCode,
    status: HttpStatus = HttpStatus.CONFLICT,
  ) {
    super(
      {
        statusCode: status,
        error: HttpStatus[status],
        code,
        message: MESSAGES[code],
      },
      status,
    );
  }
}

export class PermanentBillingEventError extends Error {
  constructor(
    readonly summary: string,
    readonly userMessage = 'This subscription checkout is no longer valid. Please create a new one.',
  ) {
    super(summary);
    this.name = 'PermanentBillingEventError';
  }
}

export class RetryableBillingEventError extends Error {
  constructor(readonly summary: string) {
    super(summary);
    this.name = 'RetryableBillingEventError';
  }
}
