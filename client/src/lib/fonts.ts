const GOOGLE_FONTS = {
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

export function ensureUrduFonts() {
  ensureStylesheet("font-urdu-arabic", GOOGLE_FONTS.urdu);
}
