const GOOGLE_FONTS = {
  mono: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap",
  urdu:
    "https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;600&family=Noto+Sans+Arabic:wght@400;600&display=swap",
} as const;

function ensureStylesheet(id: string, href: string) {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  link.media = "print";
  link.onload = () => {
    link.media = "all";
  };
  document.head.appendChild(link);
}

// Keep fonts scoped to the screens that need them to protect /login performance.
export function ensureMonoFonts() {
  ensureStylesheet("font-jetbrains-mono", GOOGLE_FONTS.mono);
}

export function ensureUrduFonts() {
  ensureStylesheet("font-urdu-arabic", GOOGLE_FONTS.urdu);
}
