import { useEffect, useRef, useState } from "react";
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
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const isElectron =
    typeof navigator !== "undefined" &&
    navigator.userAgent.toLowerCase().includes("electron");

  useEffect(() => {
    if (!open) return;
    setLayout(orientation);
  }, [open, orientation]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    fetchPrintPreview({ docKey, params, orientation: layout, format: "A4" })
      .then((markup) => {
        if (active) setHtml(markup);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, docKey, JSON.stringify(params), layout]);

  const handleIframeLoad = () => {
    if (!autoPrint || isElectron) return;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
    onPrinted?.();
  };

  const handlePrint = () => {
    if (isElectron) {
      handleOpenPdf();
      return;
    }
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
    onPrinted?.();
  };

  const handleDownload = async () => {
    const blob = await fetchPrintPdf({ docKey, params, orientation: layout, format: "A4" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${docKey}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleOpenPdf = async () => {
    const blob = await fetchPrintPdf({ docKey, params, orientation: layout, format: "A4" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      win.focus();
    }
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col">
        <DialogHeader className="flex flex-row items-center justify-between gap-4">
          <DialogTitle>{title || "Print Preview"}</DialogTitle>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground" htmlFor="print-layout">
              Layout
            </label>
            <select
              id="print-layout"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={layout}
              onChange={(event) => setLayout(event.target.value as "portrait" | "landscape")}
            >
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
            <Button variant="outline" onClick={handlePrint}>
              {isElectron ? "Open PDF" : "Print"}
            </Button>
            <Button variant="outline" onClick={handleDownload}>
              Download PDF
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 min-h-0 rounded-lg border bg-muted/20 p-4">
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
