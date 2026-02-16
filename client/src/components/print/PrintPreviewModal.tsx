import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SkeletonBox, SkeletonText } from "@/components/ui/skeletons";
import { fetchPrintPreview, fetchPrintPdf } from "@/services/printApi";
import type { DocKey } from "@/print/docRegistry";
import { downloadBlob } from "@/lib/export";

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
  const [fitMode, setFitMode] = useState<"page" | "width">("page");
  const [zoom, setZoom] = useState(1);
  const [ready, setReady] = useState(false);
  const [printers, setPrinters] = useState<Array<{ name: string; displayName?: string }>>([]);
  const [printerName, setPrinterName] = useState("");
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
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
    typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("electron");
  const pageAspectClass = layout === "portrait" ? "aspect-[210/297]" : "aspect-[297/210]";

  useEffect(() => {
    if (!open) return;
    setLayout(orientation);
    setFitMode("page");
    setZoom(1);
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
    const preview = previewRef.current;
    const scroll = scrollRef.current;
    if (!iframe || !preview || !scroll) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    const pages = Array.from(doc.querySelectorAll(".page")) as HTMLElement[];
    const firstPage = pages[0];
    if (!firstPage) return;
    const pageRect = firstPage.getBoundingClientRect();
    const pageWidth = firstPage.offsetWidth || pageRect.width;
    const pageHeight = firstPage.offsetHeight || pageRect.height;
    if (!pageWidth || !pageHeight) return;
    const scrollStyles = window.getComputedStyle(scroll);
    const paddingX =
      (Number.parseFloat(scrollStyles.paddingLeft) || 0) +
      (Number.parseFloat(scrollStyles.paddingRight) || 0);
    const paddingY =
      (Number.parseFloat(scrollStyles.paddingTop) || 0) +
      (Number.parseFloat(scrollStyles.paddingBottom) || 0);
    const viewportWidth = Math.max(scroll.clientWidth - paddingX, 1);
    const viewportHeight = Math.max(scroll.clientHeight - paddingY, 1);
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
    const scaleByWidth = viewportWidth / pageWidth;
    const scaleByHeight = viewportHeight / pageHeight;
    const scaleByViewport = fitMode === "width" ? scaleByWidth : Math.min(scaleByWidth, scaleByHeight);
    const maxScale = 3;
    const minScale = 0.25;
    const scale = Math.max(minScale, Math.min(maxScale, scaleByViewport * zoom));
    preview.style.transform = `scale(${scale.toFixed(3)})`;
    preview.style.transformOrigin = "top center";

    preview.style.height = `${Math.ceil(contentHeight)}px`;
    preview.style.width = `${Math.ceil(contentWidth)}px`;
    iframe.style.height = "100%";
    iframe.style.width = "100%";
  }, [layout, fitMode, zoom]);

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
    downloadBlob(`${docKey}.pdf`, blob);
  }, [docKey, requestPayload]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-full max-w-6xl overflow-auto border-0 bg-transparent p-4 shadow-none sm:p-6">
        <div className="flex min-h-[520px] w-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl">
          <DialogHeader className="flex-row items-center justify-between space-y-0 border-b border-slate-200/80 px-4 py-3 text-left sm:px-6">
            <div>
              <DialogTitle className="text-left text-lg font-semibold">
                {title || "Print Preview"}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">Review layout and adjust settings.</p>
            </div>
            <DialogDescription className="sr-only">
              Review the document preview and adjust print settings before printing.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
            <div className="w-full min-h-0 shrink-0 border-b border-slate-200/80 bg-slate-50/90 p-4 lg:w-[320px] lg:border-b-0 lg:border-r">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Print
                  </div>
                  <div className="text-xs text-muted-foreground">Choose settings for output.</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={handlePrint} data-autofocus>
                    Print
                  </Button>
                  <Button variant="secondary" size="sm" onClick={handleDownload}>
                    Download
                  </Button>
                </div>
              </div>
              <div className="mt-5 space-y-5">
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
            <div
              ref={scrollRef}
              className=" min-w-fu l  min-h-0 overflow-auto bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.35),_rgba(241,245,249,0.6)_45%,_rgba(226,232,240,1))] p-3 sm:p-4"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Preview
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant={fitMode === "page" ? "default" : "secondary"}
                    onClick={() => setFitMode("page")}
                  >
                    Fit Page
                  </Button>
                  <Button
                    size="sm"
                    variant={fitMode === "width" ? "default" : "secondary"}
                    onClick={() => setFitMode("width")}
                  >
                    Fit Width
                  </Button>
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={zoom}
                    onChange={(event) => setZoom(Number(event.target.value))}
                  >
                    <option value={0.75}>75%</option>
                    <option value={0.9}>90%</option>
                    <option value={1}>100%</option>
                    <option value={1.1}>110%</option>
                    <option value={1.25}>125%</option>
                    <option value={1.5}>150%</option>
                  </select>
                </div>
              </div>
              {loading ? (
                <div className="flex min-h-full items-center justify-center">
                  <div
                    className={`print-preview-frame w-full rounded-lg bg-white shadow-lg ${pageAspectClass}`}
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
                <div className="flex min-h-full w-full items-center justify-center">
                  <div ref={previewRef} className="origin-top">
                    <iframe
                      key={`${layout}-${format}-${customWidthMm}-${customHeightMm}-${marginTopMm}-${marginRightMm}-${marginBottomMm}-${marginLeftMm}`}
                      ref={iframeRef}
                      title="Print preview"
                      className="print-preview-frame flow-root rounded-lg bg-white shadow-lg"
                      srcDoc={html}
                      onLoad={handleIframeLoad}
                    />
                  </div>
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
