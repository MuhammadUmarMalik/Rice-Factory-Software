import { Suspense, lazy, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { DocKey } from "@/print/docRegistry";

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

  return (
    <div className="flex gap-2">
      <Button variant="outline" onClick={handlePrint} disabled={disabled} data-shortcut="print-preview">
        Print
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
