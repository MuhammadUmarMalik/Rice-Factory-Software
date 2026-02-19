import "./config/sentry";
import { captureException, isSentryEnabled } from "./config/sentry";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import App from "./App";
import "./index.css";

function writeAppLog(message: string) {
  if (typeof window !== "undefined" && window.electronLog?.write) {
    window.electronLog.write(message);
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    const msg = event.error?.stack || event.message || "Unknown window error";
    writeAppLog(`renderer error: ${msg}`);
    if (isSentryEnabled() && event.error) captureException(event.error);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = (event.reason && (event.reason.stack || event.reason.message)) || String(event.reason);
    writeAppLog(`renderer unhandledrejection: ${reason}`);
    if (isSentryEnabled()) captureException(event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
  });
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
