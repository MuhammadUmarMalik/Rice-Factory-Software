import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
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
import { can } from "@/lib/roles";
import { useLanguage } from "@/contexts/language-context";
import { allNavItems } from "@/components/app-sidebar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

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

function focusSearch() {
  const el = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="search"]')).find(isVisible);
  el?.focus();
  return !!el;
}

function triggerPrintPreview() {
  return clickFirst(['[data-shortcut="print-preview"]']);
}

export function ShortcutManager() {
  const user = useAuthStore((state) => state.user);
  const [, setLocation] = useLocation();
  const { t } = useLanguage();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const pages = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allNavItems
      .filter((item) => can(user?.role, item.roles))
      .map((item) => ({ url: item.url, label: t(item.title as any) }))
      .filter((item) => !q || item.label.toLowerCase().includes(q) || item.url.includes(q));
  }, [query, t, user?.role]);

  const go = (url?: string) => {
    if (!url) return;
    setPaletteOpen(false);
    setLocation(url);
  };

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

      if (matchesShortcut(event, config.commandPalette)) {
        event.preventDefault();
        setQuery("");
        setActive(0);
        setPaletteOpen(true);
        return;
      }
      if (matchesShortcut(event, config.focusSearch)) {
        if (focusSearch()) event.preventDefault();
        return;
      }
      if (matchesShortcut(event, config.printPreview)) {
        event.preventDefault();
        triggerPrintPreview();
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

  return (
    <Dialog modal open={paletteOpen} onOpenChange={setPaletteOpen}>
      <DialogContent variant="modal" className="max-w-md gap-2 p-3">
        <DialogTitle className="sr-only">Go to page</DialogTitle>
        <Input
          autoFocus
          placeholder={t("search")}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setActive((i) => Math.min(i + 1, pages.length - 1));
            else if (e.key === "ArrowUp") setActive((i) => Math.max(i - 1, 0));
            else if (e.key === "Enter") go(pages[active]?.url);
            else return;
            e.preventDefault();
          }}
        />
        <ul role="listbox" className="max-h-80 overflow-y-auto">
          {pages.map((page, i) => (
            <li
              key={page.url}
              role="option"
              aria-selected={i === active}
              ref={i === active ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(page.url)}
              className={`cursor-pointer rounded px-3 py-2 text-sm ${i === active ? "bg-accent text-accent-foreground" : ""}`}
            >
              {page.label}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
