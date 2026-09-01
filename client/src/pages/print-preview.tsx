import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchPrintPreview } from "@/services/printApi";
import { SkeletonBox, SkeletonText } from "@/components/ui/skeletons";
import { downloadBlob } from "@/lib/export";

type PreviewPayload = {
  docKey: string;
  params?: Record<string, unknown>;
  title?: string;
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

const toPdfBlob = (base64: string): Blob => {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: "application/pdf" });
};

const toPdfBlobUrl = (base64: string): string => {
  const blob = toPdfBlob(base64);
  return URL.createObjectURL(blob);
};

export default function PrintPreviewPage() {
  const search = useMemo(() => new URLSearchParams(window.location.search), []);
  const payload = decodePayload(search.get("payload") || "");
  const isElectron =
    typeof navigator !== "undefined" &&
    navigator.userAgent.toLowerCase().includes("electron");

  const [format, setFormat] = useState<"A4" | "A5" | "Letter" | "Legal" | "Custom">("A4");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [customWidthMm, setCustomWidthMm] = useState(210);
  const [customHeightMm, setCustomHeightMm] = useState(297);
  const [marginTopMm, setMarginTopMm] = useState(10);
  const [marginRightMm, setMarginRightMm] = useState(10);
  const [marginBottomMm, setMarginBottomMm] = useState(10);
  const [marginLeftMm, setMarginLeftMm] = useState(10);
  const [zoom, setZoom] = useState(100);
  const [pdfUrl, setPdfUrl] = useState<string>("");
  const [html, setHtml] = useState<string>("");
  const [pdfBase64, setPdfBase64] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!payload || !isElectron) return;
    let active = true;
    const widthMm = format === "Custom" ? customWidthMm : undefined;
    const heightMm = format === "Custom" ? customHeightMm : undefined;
    setLoading(true);
    fetchPrintPreview({
      docKey: payload.docKey,
      params: payload.params,
      format,
      orientation,
      widthMm,
      heightMm,
      marginTopMm,
      marginRightMm,
      marginBottomMm,
      marginLeftMm,
    })
      .then((markup) => {
        if (!active) return;
        setHtml(markup);
        return window.electronPrintPreview?.renderPdf({
          html: markup,
          options: {
            format,
            orientation,
            widthMm,
            heightMm,
            marginTopMm,
            marginRightMm,
            marginBottomMm,
            marginLeftMm,
          },
        });
      })
      .then((base64) => {
        if (!active || !base64) return;
        setPdfBase64(base64);
        const nextUrl = toPdfBlobUrl(base64);
        setPdfUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return nextUrl;
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    payload,
    isElectron,
    format,
    orientation,
    customWidthMm,
    customHeightMm,
    marginTopMm,
    marginRightMm,
    marginBottomMm,
    marginLeftMm,
  ]);

  const handlePrint = async () => {
    if (!html) return;
    await window.electronPrintPreview?.printHtml({ html });
  };

  const handleDownload = () => {
    if (!pdfBase64) return;
    const blob = toPdfBlob(pdfBase64);
    downloadBlob(`${payload?.docKey || "print"}.pdf`, blob);
  };

  if (!isElectron) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Print preview is available in the desktop app.
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Missing preview payload.
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <header
        className="flex flex-wrap items-center gap-3 border-b bg-background px-4 py-3"
        aria-label="Print preview controls"
      >
        <div className="text-sm font-semibold">{payload.title || "Print Preview"}</div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="pp-size">
            Paper
          </label>
          <select
            id="pp-size"
            className="h-9 min-w-[120px] rounded-md border border-input bg-background px-2 text-sm"
            value={format}
            onChange={(event) =>
              setFormat(event.target.value as "A4" | "A5" | "Letter" | "Legal" | "Custom")
            }
          >
            <option value="A4">A4</option>
            <option value="A5">A5</option>
            <option value="Letter">Letter</option>
            <option value="Legal">Legal</option>
            <option value="Custom">Custom</option>
          </select>
          {format === "Custom" && (
            <>
              <label className="text-xs text-muted-foreground" htmlFor="pp-width">
                W (mm)
              </label>
              <input
                id="pp-width"
                type="number"
                min={80}
                max={400}
                className="h-9 w-[88px] rounded-md border border-input bg-background px-2 text-sm"
                value={customWidthMm}
                onChange={(event) => setCustomWidthMm(Number(event.target.value))}
              />
              <label className="text-xs text-muted-foreground" htmlFor="pp-height">
                H (mm)
              </label>
              <input
                id="pp-height"
                type="number"
                min={80}
                max={600}
                className="h-9 w-[88px] rounded-md border border-input bg-background px-2 text-sm"
                value={customHeightMm}
                onChange={(event) => setCustomHeightMm(Number(event.target.value))}
              />
            </>
          )}
          <label className="text-xs text-muted-foreground" htmlFor="pp-orientation">
            Layout
          </label>
          <select
            id="pp-orientation"
            className="h-9 min-w-[120px] rounded-md border border-input bg-background px-2 text-sm"
            value={orientation}
            onChange={(event) => setOrientation(event.target.value as "portrait" | "landscape")}
          >
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
          <label className="text-xs text-muted-foreground" htmlFor="pp-mt">
            T
          </label>
          <input
            id="pp-mt"
            type="number"
            min={0}
            max={40}
            className="h-9 w-[64px] rounded-md border border-input bg-background px-2 text-sm"
            value={marginTopMm}
            onChange={(event) => setMarginTopMm(Number(event.target.value))}
          />
          <label className="text-xs text-muted-foreground" htmlFor="pp-mr">
            R
          </label>
          <input
            id="pp-mr"
            type="number"
            min={0}
            max={40}
            className="h-9 w-[64px] rounded-md border border-input bg-background px-2 text-sm"
            value={marginRightMm}
            onChange={(event) => setMarginRightMm(Number(event.target.value))}
          />
          <label className="text-xs text-muted-foreground" htmlFor="pp-mb">
            B
          </label>
          <input
            id="pp-mb"
            type="number"
            min={0}
            max={40}
            className="h-9 w-[64px] rounded-md border border-input bg-background px-2 text-sm"
            value={marginBottomMm}
            onChange={(event) => setMarginBottomMm(Number(event.target.value))}
          />
          <label className="text-xs text-muted-foreground" htmlFor="pp-ml">
            L
          </label>
          <input
            id="pp-ml"
            type="number"
            min={0}
            max={40}
            className="h-9 w-[64px] rounded-md border border-input bg-background px-2 text-sm"
            value={marginLeftMm}
            onChange={(event) => setMarginLeftMm(Number(event.target.value))}
          />
          <label className="text-xs text-muted-foreground" htmlFor="pp-zoom">
            Zoom
          </label>
          <input
            id="pp-zoom"
            type="range"
            min={60}
            max={140}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
          <Button variant="outline" size="sm" onClick={handleDownload}>
            Download PDF
          </Button>
          <Button size="sm" onClick={handlePrint} disabled={loading || !html}>
            Print
          </Button>
        </div>
      </header>
      <main className="flex-1 bg-muted/20 p-4" aria-label="Print preview">
        {loading ? (
          <div className="h-full w-full rounded-md bg-white p-6 shadow-sm">
            <SkeletonBox className="h-6 w-48" />
            <SkeletonText className="mt-4" lines={3} />
            <SkeletonBox className="mt-6 h-[420px] w-full" />
          </div>
        ) : (
          <div className="h-full w-full overflow-auto rounded-md bg-white shadow-sm">
            {pdfUrl ? (
              <iframe
                title="Print preview"
                src={pdfUrl}
                className="h-full w-full"
                style={{
                  transform: `scale(${zoom / 100})`,
                  transformOrigin: "top center",
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No preview available.
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
