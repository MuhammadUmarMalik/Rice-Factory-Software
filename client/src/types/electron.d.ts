export {};

declare global {
  interface Window {
    electronPrintPreview?: {
      openPreview: (payload: {
        docKey: string;
        params?: Record<string, unknown>;
        title?: string;
      }) => Promise<number | undefined>;
      renderPdf: (payload: {
        html: string;
        options: {
          format: "A4" | "A5" | "Letter" | "Legal" | "Custom";
          orientation: "portrait" | "landscape";
          widthMm?: number;
          heightMm?: number;
          marginTopMm: number;
          marginRightMm: number;
          marginBottomMm: number;
          marginLeftMm: number;
        };
      }) => Promise<string | undefined>;
      printHtml: (payload: {
        html: string;
        silent?: boolean;
        deviceName?: string;
      }) => Promise<boolean | undefined>;
      getPrinters: () => Promise<Array<{ name: string; displayName?: string }>>;
    };
  }
}
