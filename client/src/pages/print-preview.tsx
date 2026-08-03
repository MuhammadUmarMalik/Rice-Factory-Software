import { useMemo } from "react";
import { PrintPreviewModal } from "@/components/print/PrintPreviewModal";
import type { DocKey } from "@/print/docRegistry";

/*
 * Standalone Electron preview window (route `/print-preview`, opened by
 * `print-preview:open`). It used to carry its own copy of the paper/margin/zoom
 * controls and its own preview pipeline, which is exactly the duplication that
 * let the two previews drift apart. It is now a thin host around the one shared
 * PrintPreviewModal.
 */

type PreviewPayload = {
  docKey: DocKey;
  params?: Record<string, unknown>;
  title?: string;
  orientation?: "portrait" | "landscape";
};

const decodePayload = (value: string): PreviewPayload | null => {
  try {
    const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json) as PreviewPayload;
  } catch {
    return null;
  }
};

export default function PrintPreviewPage() {
  const payload = useMemo(
    () => decodePayload(new URLSearchParams(window.location.search).get("payload") || ""),
    [],
  );

  if (!payload?.docKey) {
    return <div className="p-6 text-sm text-muted-foreground">Missing preview payload.</div>;
  }

  return (
    <div className="h-screen bg-muted/20">
      <PrintPreviewModal
        open
        onOpenChange={(next) => {
          if (!next) window.close();
        }}
        docKey={payload.docKey}
        params={payload.params}
        orientation={payload.orientation || "portrait"}
        title={payload.title}
      />
    </div>
  );
}
