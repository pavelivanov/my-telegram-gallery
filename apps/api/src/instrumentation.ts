import 'dotenv/config';
import * as Sentry from '@sentry/nestjs';
import { createSentryOptions } from './monitoring/sentry';

const options = createSentryOptions();
if (options) Sentry.init(options);
