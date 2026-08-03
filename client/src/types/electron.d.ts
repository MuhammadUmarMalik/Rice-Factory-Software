export {};

/** Page geometry passed to the Electron print bridge. Must stay in sync with
 *  `resolvePrintGeometry` in electron/main.cjs. */
type ElectronPageOptions = {
  format: "A4" | "A5" | "Letter" | "Legal" | "Thermal80" | "Custom";
  orientation: "portrait" | "landscape";
  widthMm?: number;
  heightMm?: number;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
};

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
        options: ElectronPageOptions;
      }) => Promise<string | undefined>;
      printHtml: (payload: {
        html: string;
        silent?: boolean;
        deviceName?: string;
        options?: ElectronPageOptions;
      }) => Promise<boolean | undefined>;
      getPrinters: () => Promise<Array<{ name: string; displayName?: string }>>;
    };
    electronLog?: {
      write: (message: string) => Promise<boolean | undefined>;
    };
  }
}
