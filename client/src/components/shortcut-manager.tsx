import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuthStore } from "@/stores/auth.store";
import {
  defaultShortcutConfig,
  getShortcutConfig,
  mergeShortcutConfig,
  matchesShortcut,
  setShortcutConfig,
  type ShortcutConfig,
} from "@/lib/shortcuts";

type SettingsPayload = {
  shortcuts?: Partial<ShortcutConfig>;
};

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return target.isContentEditable;
}

function isVisible(el: Element | null) {
  if (!el || !(el instanceof HTMLElement)) return false;
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

function clickFirst(selectors: string[], root: ParentNode = document) {
  for (const selector of selectors) {
    const el = root.querySelector(selector);
    if (el && isVisible(el)) {
      (el as HTMLElement).click();
      return true;
    }
  }
  return false;
}

function submitDialogForm() {
  const dialog = document.querySelector('[role="dialog"]');
  if (!dialog) return false;
  const form = dialog.querySelector("form");
  if (form instanceof HTMLFormElement) {
    form.requestSubmit();
    return true;
  }
  return clickFirst(
    ['[data-shortcut="save-dialog"]', 'button[type="submit"]', 'button[data-testid^="button-save"]'],
    dialog,
  );
}

function addDialogLine() {
  const dialog = document.querySelector('[role="dialog"]');
  if (!dialog) return false;
  return clickFirst(
    [
      '[data-shortcut="add-line"]',
      'button[data-testid*="button-add-item"]',
      'button[data-testid*="button-add-line"]',
      'button[data-testid*="button-add-row"]',
    ],
    dialog,
  );
}

function openNewDialog() {
  return clickFirst([
    '[data-shortcut="new-dialog"]',
    'button[data-testid^="button-add"]',
    'button[data-testid^="button-new"]',
  ]);
}

function triggerPrintPreview() {
  return clickFirst(['[data-shortcut="print-preview"]']);
}

function triggerDownloadPdf() {
  return clickFirst(['[data-shortcut="download-pdf"]']);
}

export function ShortcutManager() {
  const user = useAuthStore((state) => state.user);

  const settingsQuery = useQuery<SettingsPayload>({
    queryKey: ["/api/settings/shortcuts"],
    enabled: !!user,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/settings/shortcuts");
      return res.json();
    },
    staleTime: 60 * 60 * 1000,
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setShortcutConfig(mergeShortcutConfig(settingsQuery.data.shortcuts));
    } else if (settingsQuery.isError) {
      setShortcutConfig(defaultShortcutConfig);
    }
  }, [settingsQuery.data, settingsQuery.isError]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const config = getShortcutConfig();
      if (!config.enabled) return;
      if (isEditableTarget(event.target) && !(event.ctrlKey || event.metaKey)) return;
      if (event.defaultPrevented) return;

      if (matchesShortcut(event, config.printPreview)) {
        event.preventDefault();
        triggerPrintPreview();
        return;
      }
      if (matchesShortcut(event, config.downloadPdf)) {
        event.preventDefault();
        triggerDownloadPdf();
        return;
      }
      if (matchesShortcut(event, config.newDialog)) {
        event.preventDefault();
        openNewDialog();
        return;
      }
      if (matchesShortcut(event, config.saveDialog)) {
        event.preventDefault();
        submitDialogForm();
        return;
      }
      if (matchesShortcut(event, config.addLine)) {
        event.preventDefault();
        addDialogLine();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return null;
}
