import { captureException, isSentryEnabled } from "@/config/sentry";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (typeof window !== "undefined" && window.electronLog?.write) {
      window.electronLog.write(
        `ErrorBoundary: ${error?.message ?? "unknown"}\n${errorInfo.componentStack ?? ""}`,
      );
    }
    if (isSentryEnabled()) captureException(error, { contexts: { react: { componentStack: errorInfo.componentStack } } });
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          style={{
            padding: "2rem",
            textAlign: "center",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h2>Something went wrong</h2>
          <p>{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: "1rem", padding: "0.5rem 1rem" }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
