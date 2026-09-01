import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SkeletonBox, SkeletonText } from "@/components/ui/skeletons";
import { fetchPrintPreview, fetchPrintPdf } from "@/services/printApi";
import type { PrintColorMode, PrintFormat } from "@/services/printApi";
import type { DocKey } from "@/print/docRegistry";
import {
  COLOR_MODES,
  PAPER_FORMATS,
  PX_PER_MM,
  isRollFormat,
  loadPrintSettings,
  resolvePageSizeMm,
  savePrintSettings,
  toPrintRequestOptions,
  type PrintSettings,
} from "@/print/printSettings";
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

const MIN_SCALE = 0.25;
const MAX_SCALE = 3;

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
  const [printing, setPrinting] = useState(false);
  const [settings, setSettings] = useState<PrintSettings>(() =>
    loadPrintSettings(docKey, { orientation }),
  );
  const [fitMode, setFitMode] = useState<"page" | "width">("page");
  const [zoom, setZoom] = useState(1);
  const [scale, setScale] = useState(1);
  const [contentHeightPx, setContentHeightPx] = useState(0);
  const [ready, setReady] = useState(false);
  const [printers, setPrinters] = useState<Array<{ name: string; displayName?: string }>>([]);
  const [printerName, setPrinterName] = useState("");
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const autoPrintedRef = useRef(false);

  const serializedParams = useMemo(() => JSON.stringify(params || {}), [params]);
  const pageSizeMm = useMemo(() => resolvePageSizeMm(settings), [settings]);
  const pageWidthPx = pageSizeMm.width * PX_PER_MM;
  const pageHeightPx = pageSizeMm.height * PX_PER_MM;

  const requestPayload = useMemo(
    () => ({ docKey, params, ...toPrintRequestOptions(settings) }),
    // `serializedParams` keeps the identity stable when callers pass a fresh
    // object literal on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [docKey, serializedParams, settings],
  );

  const isElectron =
    typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("electron");

  const update = useCallback(
    (patch: Partial<PrintSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        // Roll paper is never rotated, so silently normalise instead of letting
        // the UI show a landscape option that the renderer would ignore.
        if (isRollFormat(next.format)) next.orientation = "portrait";
        savePrintSettings(docKey, next);
        return next;
      });
    },
    [docKey],
  );

  useEffect(() => {
    if (!open) return;
    setSettings(loadPrintSettings(docKey, { orientation }));
    setFitMode("page");
    setZoom(1);
    setReady(false);
    autoPrintedRef.current = false;
  }, [open, docKey, orientation]);

  useEffect(() => {
    if (!open || !isElectron || !window.electronPrintPreview?.getPrinters) return;
    let active = true;
    window.electronPrintPreview.getPrinters().then((list) => {
      if (!active) return;
      setPrinters(list || []);
      if (!printerName && list?.length) setPrinterName(list[0].name);
    });
    return () => {
      active = false;
    };
  }, [open, isElectron, printerName]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setReady(false);
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
  }, [open, requestPayload]);

  /*
   * The preview is scaled with a CSS transform, which does NOT affect layout.
   * The wrapper below is therefore sized to the *scaled* dimensions explicitly;
   * without that the scroll container had nothing to scroll to and content
   * wider than the viewport was silently clipped.
   */
  const recomputeScale = useCallback(() => {
    const scroll = scrollRef.current;
    if (!scroll || !pageWidthPx || !pageHeightPx) return;
    const styles = window.getComputedStyle(scroll);
    const paddingX =
      (Number.parseFloat(styles.paddingLeft) || 0) + (Number.parseFloat(styles.paddingRight) || 0);
    const paddingY =
      (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0);
    const viewportWidth = Math.max(scroll.clientWidth - paddingX, 1);
    const viewportHeight = Math.max(scroll.clientHeight - paddingY, 1);
    const byWidth = viewportWidth / pageWidthPx;
    const byHeight = viewportHeight / pageHeightPx;
    const base = fitMode === "width" ? byWidth : Math.min(byWidth, byHeight);
    setScale(Math.max(MIN_SCALE, Math.min(MAX_SCALE, base * zoom)));
  }, [fitMode, zoom, pageWidthPx, pageHeightPx]);

  /** Measures how tall the rendered document actually is, so multi-page documents scroll. */
  const measureContent = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const height = Math.max(
      doc.documentElement?.scrollHeight || 0,
      doc.body?.scrollHeight || 0,
      pageHeightPx,
    );
    setContentHeightPx(height);
  }, [pageHeightPx]);

  const handleIframeLoad = useCallback(() => {
    setReady(true);
    measureContent();
    recomputeScale();
    // Web fonts and images settle a frame or two after load.
    window.setTimeout(() => {
      measureContent();
      recomputeScale();
    }, 60);
  }, [measureContent, recomputeScale]);

  useEffect(() => {
    if (!open) return;
    const handleResize = () => recomputeScale();
    window.addEventListener("resize", handleResize);
    const raf = window.requestAnimationFrame(() => recomputeScale());
    return () => {
      window.removeEventListener("resize", handleResize);
      window.cancelAnimationFrame(raf);
    };
  }, [open, html, recomputeScale]);

  /*
   * Print and Download both go through the SAME PDF that the server (or Electron)
   * renders from the previewed HTML. Previously the browser path called
   * `iframe.contentWindow.print()`, which re-laid the document out using the
   * browser's own page setup - so Print, Download and the preview could all
   * disagree. Printing the PDF removes that entire class of mismatch.
   */
  const handlePrint = useCallback(async () => {
    if (!ready || printing) return;
    setPrinting(true);
    try {
      if (isElectron && window.electronPrintPreview?.printHtml) {
        await window.electronPrintPreview.printHtml({
          html,
          silent: false,
          deviceName: printerName || undefined,
          options: toPrintRequestOptions(settings),
        });
        onPrinted?.();
        return;
      }
      const blob = await fetchPrintPdf(requestPayload);
      const url = URL.createObjectURL(blob);
      const frame = document.createElement("iframe");
      frame.style.position = "fixed";
      frame.style.right = "0";
      frame.style.bottom = "0";
      frame.style.width = "0";
      frame.style.height = "0";
      frame.style.border = "0";
      frame.src = url;
      frame.onload = () => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        onPrinted?.();
        // Keep the frame alive long enough for the print dialog to read it.
        window.setTimeout(() => {
          URL.revokeObjectURL(url);
          frame.remove();
        }, 60_000);
      };
      document.body.appendChild(frame);
    } finally {
      setPrinting(false);
    }
  }, [ready, printing, isElectron, html, printerName, settings, requestPayload, onPrinted]);

  useEffect(() => {
    if (!autoPrint || !ready || autoPrintedRef.current) return;
    autoPrintedRef.current = true;
    void handlePrint();
  }, [autoPrint, ready, handlePrint]);

  const handleDownload = useCallback(async () => {
    const blob = await fetchPrintPdf(requestPayload);
    downloadBlob(`${docKey}.pdf`, blob);
  }, [docKey, requestPayload]);

  const scaledWidth = Math.ceil(pageWidthPx * scale);
  const scaledHeight = Math.ceil((contentHeightPx || pageHeightPx) * scale);
  const pageAspectClass = settings.orientation === "portrait" ? "aspect-[210/297]" : "aspect-[297/210]";
  const numberField =
    "mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
  const selectField = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

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
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div className="w-full min-h-0 shrink-0 overflow-y-auto border-b border-slate-200/80 bg-slate-50/90 p-4 lg:w-[320px] lg:border-b-0 lg:border-r">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Print
                  </div>
                  <div className="text-xs text-muted-foreground">Choose settings for output.</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={handlePrint} disabled={!ready || printing} data-autofocus>
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
                      className={`mt-2 ${selectField}`}
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
                    <div>
                      <label className="text-xs text-muted-foreground" htmlFor="print-paper">
                        Paper
                      </label>
                      <select
                        id="print-paper"
                        className={`mt-1 ${selectField}`}
                        value={settings.format}
                        onChange={(event) => update({ format: event.target.value as PrintFormat })}
                      >
                        {PAPER_FORMATS.map((paper) => (
                          <option key={paper.value} value={paper.value}>
                            {paper.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {settings.format === "Custom" && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground" htmlFor="print-width">
                            W (mm)
                          </label>
                          <input
                            id="print-width"
                            type="number"
                            min={40}
                            max={400}
                            step={1}
                            className={numberField}
                            value={settings.widthMm}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              if (Number.isFinite(next)) update({ widthMm: next });
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
                            min={40}
                            max={1200}
                            step={1}
                            className={numberField}
                            value={settings.heightMm}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              if (Number.isFinite(next)) update({ heightMm: next });
                            }}
                          />
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="text-xs text-muted-foreground" htmlFor="print-layout">
                        Layout
                      </label>
                      <select
                        id="print-layout"
                        className={`mt-1 ${selectField}`}
                        value={settings.orientation}
                        disabled={isRollFormat(settings.format)}
                        onChange={(event) =>
                          update({ orientation: event.target.value as "portrait" | "landscape" })
                        }
                      >
                        <option value="portrait">Portrait</option>
                        <option value="landscape">Landscape</option>
                      </select>
                      {isRollFormat(settings.format) && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Receipt rolls always print portrait.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground">Colour</div>
                  <div className="mt-2 grid gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground" htmlFor="print-color-mode">
                        Print colour
                      </label>
                      <select
                        id="print-color-mode"
                        className={`mt-1 ${selectField}`}
                        value={settings.colorMode}
                        onChange={(event) =>
                          update({ colorMode: event.target.value as PrintColorMode })
                        }
                      >
                        {COLOR_MODES.map((mode) => (
                          <option key={mode.value} value={mode.value}>
                            {mode.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input"
                        checked={settings.showLogo}
                        onChange={(event) => update({ showLogo: event.target.checked })}
                      />
                      Include company logo
                    </label>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input"
                        checked={settings.showColoredHeaders}
                        onChange={(event) => update({ showColoredHeaders: event.target.checked })}
                      />
                      Coloured headers &amp; fills
                    </label>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground">Margins</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(
                      [
                        ["marginTopMm", "Top (mm)", "print-margin-top"],
                        ["marginRightMm", "Right (mm)", "print-margin-right"],
                        ["marginBottomMm", "Bottom (mm)", "print-margin-bottom"],
                        ["marginLeftMm", "Left (mm)", "print-margin-left"],
                      ] as Array<[keyof PrintSettings, string, string]>
                    ).map(([key, label, id]) => (
                      <div key={id}>
                        <label className="text-xs text-muted-foreground" htmlFor={id}>
                          {label}
                        </label>
                        <input
                          id={id}
                          type="number"
                          min={0}
                          max={40}
                          step={1}
                          className={numberField}
                          value={settings[key] as number}
                          onChange={(event) => {
                            const next = Number(event.target.value);
                            if (Number.isFinite(next)) {
                              update({ [key]: Math.min(40, Math.max(0, next)) } as Partial<PrintSettings>);
                            }
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div
              ref={scrollRef}
              className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.35),_rgba(241,245,249,0.6)_45%,_rgba(226,232,240,1))] p-3 sm:p-4"
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
                    aria-label="Zoom"
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
                <div className="flex flex-1 items-center justify-center">
                  <div
                    className={`print-preview-frame w-full max-w-full rounded-lg bg-white shadow-lg ${pageAspectClass}`}
                  >
                    <div className="space-y-4 p-6">
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
                /*
                 * `mx-auto` centres the page but collapses to 0 when the scaled
                 * page is wider than the viewport, so nothing is ever pushed off
                 * the left edge and out of scroll range. The old flex centring
                 * did exactly that.
                 */
                <div
                  className="relative mx-auto shrink-0"
                  style={{ width: scaledWidth, height: scaledHeight }}
                >
                  <iframe
                    key={`${settings.format}-${settings.orientation}-${settings.widthMm}-${settings.heightMm}-${settings.marginTopMm}-${settings.marginRightMm}-${settings.marginBottomMm}-${settings.marginLeftMm}-${settings.colorMode}-${settings.showLogo}-${settings.showColoredHeaders}`}
                    ref={iframeRef}
                    title="Print preview"
                    className="print-preview-frame absolute left-0 top-0 origin-top-left rounded-lg border-0 bg-white shadow-lg"
                    style={{
                      width: pageWidthPx,
                      height: contentHeightPx || pageHeightPx,
                      transform: `scale(${scale})`,
                    }}
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
