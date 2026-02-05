import { createRoot } from "react-dom/client";
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
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = (event.reason && (event.reason.stack || event.reason.message)) || String(event.reason);
    writeAppLog(`renderer unhandledrejection: ${reason}`);
  });
}

createRoot(document.getElementById("root")!).render(<App />);
