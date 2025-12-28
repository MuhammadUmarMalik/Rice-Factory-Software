import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fetchPrintPreview, fetchPrintPdf } from "@/services/printApi";
import type { DocKey } from "@/print/docRegistry";

type PrintPreviewModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docKey: DocKey;
  params?: Record<string, unknown>;
  orientation?: "portrait" | "landscape";
  title?: string;
  autoPrint?: boolean;
  onPrinted?: () => void;
};

export function PrintPreviewModal({
  open,
  onOpenChange,
  docKey,
  params,
  orientation = "portrait",
  title,
  autoPrint,
  onPrinted,
}: PrintPreviewModalProps) {
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [layout, setLayout] = useState<"portrait" | "landscape">(orientation);
  const [format, setFormat] = useState<"A4" | "A5" | "Letter" | "Legal" | "Custom">("A4");
  const [customWidthMm, setCustomWidthMm] = useState(210);
  const [customHeightMm, setCustomHeightMm] = useState(297);
  const [marginTopMm, setMarginTopMm] = useState(10);
  const [marginRightMm, setMarginRightMm] = useState(10);
  const [marginBottomMm, setMarginBottomMm] = useState(10);
  const [marginLeftMm, setMarginLeftMm] = useState(10);
  const [ready, setReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const serializedParams = useMemo(() => JSON.stringify(params || {}), [params]);

  useEffect(() => {
    if (!open) return;
    setLayout(orientation);
    setReady(false);
  }, [open, orientation]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    const widthMm = format === "Custom" ? customWidthMm : undefined;
    const heightMm = format === "Custom" ? customHeightMm : undefined;
    fetchPrintPreview({
      docKey,
      params,
      orientation: layout,
      format,
      widthMm,
      heightMm,
      marginTopMm,
      marginRightMm,
      marginBottomMm,
      marginLeftMm,
    })
      .then((markup) => {
        if (active) setHtml(markup);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    open,
    docKey,
    serializedParams,
    layout,
    format,
    customWidthMm,
    customHeightMm,
    marginTopMm,
    marginRightMm,
    marginBottomMm,
    marginLeftMm,
  ]);

  const updatePreviewScale = () => {
    const iframe = iframeRef.current;
    const container = previewRef.current;
    if (!iframe || !container) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    const page = doc.querySelector(".page") as HTMLElement | null;
    if (!page) return;
    const pageWidth = page.offsetWidth || page.getBoundingClientRect().width;
    const pageHeight = page.offsetHeight || page.getBoundingClientRect().height;
    if (!pageWidth || !pageHeight) return;
    const padding = 24;
    const maxWidth = Math.max(container.clientWidth - padding, 1);
    const maxHeight = Math.max(container.clientHeight - padding, 1);
    const scale = Math.min(1, maxWidth / pageWidth, maxHeight / pageHeight);
    doc.documentElement.style.setProperty("--preview-scale", scale.toFixed(3));
  };

  const handleIframeLoad = () => {
    setReady(true);
    updatePreviewScale();
    if (!autoPrint) return;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    setTimeout(() => {
      win.print();
      onPrinted?.();
    }, 0);
  };

  useEffect(() => {
    if (!open) return;
    const handleResize = () => updatePreviewScale();
    window.addEventListener("resize", handleResize);
    const raf = window.requestAnimationFrame(() => updatePreviewScale());
    return () => {
      window.removeEventListener("resize", handleResize);
      window.cancelAnimationFrame(raf);
    };
  }, [
    open,
    html,
    format,
    customWidthMm,
    customHeightMm,
    marginTopMm,
    marginRightMm,
    marginBottomMm,
    marginLeftMm,
  ]);

  const handlePrint = () => {
    if (!ready) return;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    setTimeout(() => {
      win.print();
      onPrinted?.();
    }, 0);
  };

  const handleDownload = async () => {
    const widthMm = format === "Custom" ? customWidthMm : undefined;
    const heightMm = format === "Custom" ? customHeightMm : undefined;
    const blob = await fetchPrintPdf({
      docKey,
      params,
      orientation: layout,
      format,
      widthMm,
      heightMm,
      marginTopMm,
      marginRightMm,
      marginBottomMm,
      marginLeftMm,
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${docKey}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-6xl h-[92vh] flex flex-col">
        <DialogHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <DialogTitle className="text-left">{title || "Print Preview"}</DialogTitle>
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            <label className="text-xs text-muted-foreground" htmlFor="print-paper">
              Paper
            </label>
            <select
              id="print-paper"
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
                <label className="text-xs text-muted-foreground" htmlFor="print-width">
                  W (mm)
                </label>
                <input
                  id="print-width"
                  type="number"
                  min={80}
                  max={400}
                  step={1}
                  className="h-9 w-[88px] rounded-md border border-input bg-background px-2 text-sm"
                  value={customWidthMm}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isFinite(next)) setCustomWidthMm(next);
                  }}
                />
                <label className="text-xs text-muted-foreground" htmlFor="print-height">
                  H (mm)
                </label>
                <input
                  id="print-height"
                  type="number"
                  min={80}
                  max={600}
                  step={1}
                  className="h-9 w-[88px] rounded-md border border-input bg-background px-2 text-sm"
                  value={customHeightMm}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isFinite(next)) setCustomHeightMm(next);
                  }}
                />
              </>
            )}
            <label className="text-xs text-muted-foreground" htmlFor="print-layout">
              Layout
            </label>
            <select
              id="print-layout"
              className="h-9 min-w-[140px] rounded-md border border-input bg-background px-2 text-sm"
              value={layout}
              onChange={(event) => setLayout(event.target.value as "portrait" | "landscape")}
            >
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
            <label className="text-xs text-muted-foreground" htmlFor="print-margin-top">
              T (mm)
            </label>
            <input
              id="print-margin-top"
              type="number"
              min={0}
              max={40}
              step={1}
              className="h-9 w-[72px] rounded-md border border-input bg-background px-2 text-sm"
              value={marginTopMm}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next)) setMarginTopMm(next);
              }}
            />
            <label className="text-xs text-muted-foreground" htmlFor="print-margin-right">
              R (mm)
            </label>
            <input
              id="print-margin-right"
              type="number"
              min={0}
              max={40}
              step={1}
              className="h-9 w-[72px] rounded-md border border-input bg-background px-2 text-sm"
              value={marginRightMm}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next)) setMarginRightMm(next);
              }}
            />
            <label className="text-xs text-muted-foreground" htmlFor="print-margin-bottom">
              B (mm)
            </label>
            <input
              id="print-margin-bottom"
              type="number"
              min={0}
              max={40}
              step={1}
              className="h-9 w-[72px] rounded-md border border-input bg-background px-2 text-sm"
              value={marginBottomMm}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next)) setMarginBottomMm(next);
              }}
            />
            <label className="text-xs text-muted-foreground" htmlFor="print-margin-left">
              L (mm)
            </label>
            <input
              id="print-margin-left"
              type="number"
              min={0}
              max={40}
              step={1}
              className="h-9 w-[72px] rounded-md border border-input bg-background px-2 text-sm"
              value={marginLeftMm}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next)) setMarginLeftMm(next);
              }}
            />
            <Button variant="outline" size="sm" onClick={handlePrint}>
              Print
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              Download PDF
            </Button>
          </div>
        </DialogHeader>
        <div ref={previewRef} className="flex-1 min-h-0 rounded-lg border bg-muted/20 p-4">
          {loading ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              Loading preview...
            </div>
          ) : (
            <div className="h-full w-full overflow-hidden rounded-md bg-white shadow-sm">
              <iframe
                ref={iframeRef}
                title="Print preview"
                className="print-preview-frame h-full w-full"
                srcDoc={html}
                onLoad={handleIframeLoad}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
