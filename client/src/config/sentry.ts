/**
 * Sentry for the React client. Initialize before React in main.tsx.
 */
import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const env = import.meta.env.MODE || "development";

if (dsn) {
  Sentry.init({
    dsn,
    environment: env,
    release: import.meta.env.VITE_SENTRY_RELEASE as string | undefined,
    enableLogs: true,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
      Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
    ],
    tracesSampleRate: env === "production" ? 0.2 : 1.0,
    replaysSessionSampleRate: env === "production" ? 0.1 : 0,
    replaysOnErrorSampleRate: 1.0,
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
