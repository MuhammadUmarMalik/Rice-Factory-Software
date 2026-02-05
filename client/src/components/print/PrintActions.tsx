import { Suspense, lazy, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { DocKey } from "@/print/docRegistry";
import { fetchPrintPdf } from "@/services/printApi";
import { downloadBlob } from "@/lib/export";

const PrintPreviewModal = lazy(() =>
  import("./PrintPreviewModal").then((module) => ({ default: module.PrintPreviewModal })),
);

type PrintActionsProps = {
  docKey: DocKey;
  params?: Record<string, unknown>;
  orientation?: "portrait" | "landscape";
  title?: string;
  disabled?: boolean;
};

export function PrintActions({
  docKey,
  params,
  orientation = "portrait",
  title,
  disabled,
}: PrintActionsProps) {
  const [open, setOpen] = useState(false);
  const [autoPrint, setAutoPrint] = useState(false);
  const safeParams = useMemo(() => params || {}, [params]);
  const isElectron =
    typeof navigator !== "undefined" &&
    navigator.userAgent.toLowerCase().includes("electron");

  const handlePrint = () => {
    if (disabled) return;
    setAutoPrint(!isElectron);
    setOpen(true);
  };

  const handleDownload = async () => {
    if (disabled) return;
    const blob = await fetchPrintPdf({ docKey, params: safeParams, orientation, format: "A4" });
    downloadBlob(`${docKey}.pdf`, blob);
  };

  return (
    <div className="flex gap-2">
      <Button variant="outline" onClick={handlePrint} disabled={disabled} data-shortcut="print-preview">
        Print
      </Button>
      <Button variant="outline" onClick={handleDownload} disabled={disabled} data-shortcut="download-pdf">
        Download PDF
      </Button>
      {open ? (
        <Suspense fallback={null}>
          <PrintPreviewModal
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (!next) setAutoPrint(false);
            }}
            docKey={docKey}
            params={safeParams}
            orientation={orientation}
            title={title}
            autoPrint={autoPrint}
            onPrinted={() => setAutoPrint(false)}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
