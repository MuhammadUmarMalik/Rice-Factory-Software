/**
 * Sentry must be initialized before any other application code.
 * This file is imported first in index.ts.
 */
import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;
const env = process.env.NODE_ENV || "development";

if (dsn) {
  Sentry.init({
    dsn,
    environment: env,
    release: process.env.SENTRY_RELEASE || undefined,
    enableLogs: true,
    integrations: [
      Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
    ],
    tracesSampleRate: env === "production" ? 0.2 : 1.0,
    beforeSend(event, hint) {
      const err = hint.originalException;
      if (err && typeof err === "object" && "statusCode" in err && (err as { statusCode: number }).statusCode < 500) {
        return null;
      }
      return event;
    },
    beforeSendLog(log) {
      if (log.attributes?.password !== undefined) delete log.attributes.password;
      if (log.attributes?.token !== undefined) delete log.attributes.token;
      return log;
    },
  });
}

export const captureException = Sentry.captureException.bind(Sentry);
export const captureMessage = Sentry.captureMessage.bind(Sentry);
export const logger = Sentry.logger;
export const isSentryEnabled = () => !!dsn;
