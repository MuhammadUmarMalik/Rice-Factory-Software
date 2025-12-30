import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SkeletonBox, SkeletonText } from "@/components/ui/skeletons";
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

function PrintPreviewModalComponent({
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
  const [printers, setPrinters] = useState<Array<{ name: string; displayName?: string }>>([]);
  const [printerName, setPrinterName] = useState("");
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const serializedParams = useMemo(() => JSON.stringify(params || {}), [params]);
  const requestPayload = useMemo(
    () => ({
      docKey,
      params,
      orientation: layout,
      format,
      widthMm: format === "Custom" ? customWidthMm : undefined,
      heightMm: format === "Custom" ? customHeightMm : undefined,
      marginTopMm,
      marginRightMm,
      marginBottomMm,
      marginLeftMm,
    }),
    [
      docKey,
      params,
      layout,
      format,
      customWidthMm,
      customHeightMm,
      marginTopMm,
      marginRightMm,
      marginBottomMm,
      marginLeftMm,
    ],
  );
  const isElectron =
    typeof navigator !== "undefined" &&
    navigator.userAgent.toLowerCase().includes("electron");
  const pageAspectClass = layout === "portrait" ? "aspect-[210/297]" : "aspect-[297/210]";
  const pageMaxWidthClass = layout === "portrait" ? "max-w-[820px]" : "max-w-none";

  useEffect(() => {
    if (!open) return;
    setLayout(orientation);
    setReady(false);
  }, [open, orientation]);

  useEffect(() => {
    if (!open) return;
    setReady(false);
  }, [
    open,
    layout,
    format,
    customWidthMm,
    customHeightMm,
    marginTopMm,
    marginRightMm,
    marginBottomMm,
    marginLeftMm,
  ]);

  useEffect(() => {
    if (!open || !isElectron || !window.electronPrintPreview?.getPrinters) return;
    let active = true;
    window.electronPrintPreview.getPrinters().then((list) => {
      if (!active) return;
      setPrinters(list || []);
      if (!printerName && list?.length) {
        setPrinterName(list[0].name);
      }
    });
    return () => {
      active = false;
    };
  }, [open, isElectron, printerName]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    fetchPrintPreview(requestPayload)
      .then((markup) => {
        if (active) setHtml(markup);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, requestPayload, serializedParams]);

  const updatePreviewScale = useCallback(() => {
    const iframe = iframeRef.current;
    const scroll = scrollRef.current;
    if (!iframe || !scroll) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    const pages = Array.from(doc.querySelectorAll(".page")) as HTMLElement[];
    const firstPage = pages[0];
    if (!firstPage) return;
    const pageWidth = firstPage.offsetWidth || firstPage.getBoundingClientRect().width;
    if (!pageWidth) return;
    const viewportWidth = Math.max(scroll.clientWidth, 1);
    const metrics = pages.reduce(
      (acc, page) => {
        const width = page.offsetWidth || page.getBoundingClientRect().width;
        const bottom = page.offsetTop + page.offsetHeight;
        return {
          maxWidth: Math.max(acc.maxWidth, width),
          maxBottom: Math.max(acc.maxBottom, bottom),
        };
      },
      { maxWidth: pageWidth, maxBottom: firstPage.offsetHeight },
    );
    const contentWidth = metrics.maxWidth;
    const contentHeight = metrics.maxBottom;
    const scaleByWidth = viewportWidth / contentWidth;
    const scale = layout === "landscape" ? scaleByWidth : Math.min(1, scaleByWidth);
    doc.documentElement.style.setProperty("--preview-scale", scale.toFixed(3));

    const scaledHeight = Math.ceil(contentHeight * scale);
    const scaledWidth = Math.ceil(contentWidth * scale);
    iframe.style.height = `${scaledHeight}px`;
    iframe.style.width = `${scaledWidth}px`;
  }, [layout]);

  const handleIframeLoad = useCallback(() => {
    setReady(true);
    updatePreviewScale();
    window.setTimeout(() => updatePreviewScale(), 50);
    if (!autoPrint) return;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    setTimeout(() => {
      win.print();
      onPrinted?.();
    }, 0);
  }, [autoPrint, onPrinted, updatePreviewScale]);

  useEffect(() => {
    if (!open) return;
    const handleResize = () => updatePreviewScale();
    window.addEventListener("resize", handleResize);
    const raf = window.requestAnimationFrame(() => updatePreviewScale());
    const scroll = scrollRef.current;
    const handleWheel = (event: WheelEvent) => {
      if (scroll?.dataset.previewScroll === "none") {
        event.preventDefault();
      }
    };
    scroll?.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      window.removeEventListener("resize", handleResize);
      window.cancelAnimationFrame(raf);
      scroll?.removeEventListener("wheel", handleWheel);
    };
  }, [open, html, updatePreviewScale]);

  const handlePrint = useCallback(async () => {
    if (!ready) return;
    if (isElectron && window.electronPrintPreview?.printHtml) {
      await window.electronPrintPreview.printHtml({
        html,
        silent: true,
        deviceName: printerName || undefined,
      });
      onPrinted?.();
      return;
    }
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    setTimeout(() => {
      win.print();
      onPrinted?.();
    }, 0);
  }, [ready, isElectron, html, printerName, onPrinted]);

  const handleDownload = useCallback(async () => {
    const blob = await fetchPrintPdf(requestPayload);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${docKey}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  }, [docKey, requestPayload]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-full max-w-6xl overflow-auto border-0 bg-transparent p-4 pr-4 shadow-none">
        <div className="flex min-h-[480px] w-full flex-col overflow-hidden rounded-xl bg-white shadow-xl">
          <DialogHeader className="flex-row items-center justify-between space-y-0 border-b px-4 py-3 pr-4 text-left">
            <DialogTitle className="text-left">{title || "Print Preview"}</DialogTitle>
            <DialogDescription className="sr-only">
              Review the document preview and adjust print settings before printing.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
            <div className="w-full shrink-0 border-r bg-slate-50 p-4 lg:w-80 min-h-0 overflow-y-auto">
              <div className="flex items-center justify-between gap-2">
                <div className="text-lg font-semibold">Print</div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={handlePrint} data-autofocus>
                    Print
                  </Button>
                  <Button variant="secondary" size="sm" onClick={handleDownload}>
                    Download PDF
                  </Button>
                </div>
              </div>
              <div className="mt-4 space-y-4">
                {isElectron && printers.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold uppercase text-muted-foreground">
                      Printer
                    </div>
                    <select
                      id="print-printer"
                      className="mt-2 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      value={printerName}
                      onChange={(event) => setPrinterName(event.target.value)}
                    >
                      {printers.map((printer) => (
                        <option key={printer.name} value={printer.name}>
                          {printer.displayName || printer.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground">Settings</div>
                  <div className="mt-2 grid gap-3">
                    <label className="text-xs text-muted-foreground" htmlFor="print-paper">
                      Paper
                    </label>
                    <select
                      id="print-paper"
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      value={format}
                      onChange={(event) =>
                        setFormat(
                          event.target.value as "A4" | "A5" | "Letter" | "Legal" | "Custom",
                        )
                      }
                    >
                      <option value="A4">A4</option>
                      <option value="A5">A5</option>
                      <option value="Letter">Letter</option>
                      <option value="Legal">Legal</option>
                      <option value="Custom">Custom</option>
                    </select>
                    {format === "Custom" && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground" htmlFor="print-width">
                            W (mm)
                          </label>
                          <input
                            id="print-width"
                            type="number"
                            min={80}
                            max={400}
                            step={1}
                            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                            value={customWidthMm}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              if (Number.isFinite(next)) setCustomWidthMm(next);
                            }}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground" htmlFor="print-height">
                            H (mm)
                          </label>
                          <input
                            id="print-height"
                            type="number"
                            min={80}
                            max={600}
                            step={1}
                            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                            value={customHeightMm}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              if (Number.isFinite(next)) setCustomHeightMm(next);
                            }}
                          />
                        </div>
                      </div>
                    )}
                    <label className="text-xs text-muted-foreground" htmlFor="print-layout">
                      Layout
                    </label>
                    <select
                      id="print-layout"
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      value={layout}
                      onChange={(event) => setLayout(event.target.value as "portrait" | "landscape")}
                    >
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground">Margins</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground" htmlFor="print-margin-top">
                        Top (mm)
                      </label>
                      <input
                        id="print-margin-top"
                        type="number"
                        min={0}
                        max={40}
                        step={1}
                        className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        value={marginTopMm}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          if (Number.isFinite(next)) setMarginTopMm(next);
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground" htmlFor="print-margin-right">
                        Right (mm)
                      </label>
                      <input
                        id="print-margin-right"
                        type="number"
                        min={0}
                        max={40}
                        step={1}
                        className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        value={marginRightMm}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          if (Number.isFinite(next)) setMarginRightMm(next);
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground" htmlFor="print-margin-bottom">
                        Bottom (mm)
                      </label>
                      <input
                        id="print-margin-bottom"
                        type="number"
                        min={0}
                        max={40}
                        step={1}
                        className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        value={marginBottomMm}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          if (Number.isFinite(next)) setMarginBottomMm(next);
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground" htmlFor="print-margin-left">
                        Left (mm)
                      </label>
                      <input
                        id="print-margin-left"
                        type="number"
                        min={0}
                        max={40}
                        step={1}
                        className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        value={marginLeftMm}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          if (Number.isFinite(next)) setMarginLeftMm(next);
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div ref={scrollRef} className="hide-scrollbar flex-1 min-h-0 overflow-auto bg-slate-100 p-3">
              {loading ? (
                <div className="flex min-h-full items-center justify-center">
                  <div
                    className={`print-preview-frame w-full bg-white shadow-md ${pageMaxWidthClass} ${pageAspectClass}`}
                  >
                    <div className="p-6 space-y-4">
                      <SkeletonBox className="h-5 w-40" />
                      <SkeletonText lines={3} />
                      <div className="space-y-2">
                        {Array.from({ length: 6 }).map((_, index) => (
                          <SkeletonBox key={index} className="h-4 w-full" />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="min-h-full w-full">
                  <iframe
                    key={`${layout}-${format}-${customWidthMm}-${customHeightMm}-${marginTopMm}-${marginRightMm}-${marginBottomMm}-${marginLeftMm}`}
                    ref={iframeRef}
                    title="Print preview"
                    className={`print-preview-frame block h-full w-full bg-white shadow-md ${pageMaxWidthClass} ${pageAspectClass}`}
                    srcDoc={html}
                    onLoad={handleIframeLoad}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const PrintPreviewModal = memo(PrintPreviewModalComponent);
