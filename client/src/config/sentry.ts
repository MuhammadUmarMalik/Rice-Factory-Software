/**
 * Sentry for the React client. The SDK (with replay) is ~200 KB, so it is only
 * downloaded when a DSN is configured; errors raised before it loads are queued.
 */

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const env = import.meta.env.MODE || "development";

let sentry: typeof import("@sentry/react") | null = null;
type CaptureArgs = Parameters<typeof import("@sentry/react").captureException>;
const pending: CaptureArgs[] = [];

if (dsn) {
  void import("@sentry/react").then((Sentry) => {
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
    sentry = Sentry;
    pending.splice(0).forEach((args) => Sentry.captureException(...args));
  });
}

export function captureException(...args: CaptureArgs) {
  if (!dsn) return;
  if (sentry) sentry.captureException(...args);
  else pending.push(args);
}

export const isSentryEnabled = () => !!dsn;
