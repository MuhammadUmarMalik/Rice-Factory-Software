import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PrintPreviewModal } from "./PrintPreviewModal";
import type { DocKey } from "@/print/docRegistry";
import { fetchPrintPdf } from "@/services/printApi";

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

  const handlePrint = () => {
    if (disabled) return;
    setAutoPrint(true);
    setOpen(true);
  };

  const handleDownload = async () => {
    if (disabled) return;
    const blob = await fetchPrintPdf({ docKey, params: safeParams, orientation, format: "A4" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${docKey}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex gap-2">
      <Button variant="outline" onClick={handlePrint} disabled={disabled}>
        Print
      </Button>
      <Button variant="outline" onClick={handleDownload} disabled={disabled}>
        Download PDF
      </Button>
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
    </div>
  );
}
