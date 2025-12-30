export type ShortcutConfig = {
  enabled: boolean;
  toggleSidebar: string;
  printPreview: string;
  downloadPdf: string;
  newDialog: string;
  saveDialog: string;
  addLine: string;
};

export const defaultShortcutConfig: ShortcutConfig = {
  enabled: true,
  toggleSidebar: "Ctrl+B",
  printPreview: "Ctrl+P",
  downloadPdf: "Ctrl+Shift+P",
  newDialog: "Ctrl+N",
  saveDialog: "Ctrl+Enter",
  addLine: "Ctrl+Shift+N",
};

let currentConfig: ShortcutConfig = { ...defaultShortcutConfig };

export function mergeShortcutConfig(input?: Partial<ShortcutConfig>): ShortcutConfig {
  return { ...defaultShortcutConfig, ...input, enabled: input?.enabled ?? true };
}

export function setShortcutConfig(config: ShortcutConfig) {
  currentConfig = { ...config };
}

export function getShortcutConfig(): ShortcutConfig {
  return currentConfig;
}

type ParsedShortcut = {
  key: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
};

function normalizeKey(value?: string | null): string {
  if (!value) return "";
  const key = value.toLowerCase();
  if (key === "escape" || key === "esc") return "escape";
  if (key === "enter" || key === "return") return "enter";
  if (key === " ") return "space";
  return key;
}

function parseShortcut(value: string): ParsedShortcut | null {
  if (!value) return null;
  const tokens = value
    .split("+")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return null;

  let ctrl = false;
  let meta = false;
  let shift = false;
  let alt = false;
  let key = tokens[tokens.length - 1];

  for (const token of tokens) {
    if (token === "ctrl" || token === "control" || token === "cmdorctrl" || token === "ctrlorcmd") {
      ctrl = true;
      continue;
    }
    if (token === "cmd" || token === "command" || token === "meta") {
      meta = true;
      continue;
    }
    if (token === "shift") {
      shift = true;
      continue;
    }
    if (token === "alt" || token === "option") {
      alt = true;
      continue;
    }
    key = token;
  }

  return {
    key: normalizeKey(key),
    ctrl,
    meta,
    shift,
    alt,
  };
}

export function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parsed = parseShortcut(shortcut);
  if (!parsed) return false;
  const key = normalizeKey(event.key);
  if (!key) return false;
  if (key !== parsed.key) return false;

  const ctrlMatch = parsed.ctrl ? event.ctrlKey || event.metaKey : !event.ctrlKey;
  const metaMatch = parsed.meta ? event.metaKey : !event.metaKey || parsed.ctrl;
  const shiftMatch = parsed.shift ? event.shiftKey : !event.shiftKey;
  const altMatch = parsed.alt ? event.altKey : !event.altKey;

  return ctrlMatch && metaMatch && shiftMatch && altMatch;
}
