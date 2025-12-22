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
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    fetchPrintPreview({ docKey, params, orientation, format: "A4" })
      .then((markup) => {
        if (active) setHtml(markup);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, docKey, JSON.stringify(params), orientation]);

  const handleIframeLoad = () => {
    if (!autoPrint) return;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
    onPrinted?.();
  };

  const handleDownload = async () => {
    const blob = await fetchPrintPdf({ docKey, params, orientation, format: "A4" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${docKey}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh]">
        <DialogHeader className="flex flex-row items-center justify-between gap-4">
          <DialogTitle>{title || "Print Preview"}</DialogTitle>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleDownload}>
              Download PDF
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 h-full border rounded-md overflow-hidden bg-muted/20">
          {loading ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              Loading preview...
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              title="Print preview"
              className="w-full h-full"
              srcDoc={html}
              onLoad={handleIframeLoad}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

