import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { type Language, type TranslationKey, translations } from "@/lib/i18n";
import { ensureUrduFonts } from "@/lib/fonts";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== "undefined") {
      try {
        return (localStorage.getItem("language") as Language) || "en";
      } catch (err) {
        console.warn("Language storage unavailable, falling back to en", err);
        return "en";
      }
    }
    return "en";
  });

  const isRTL = language === "ur";

  useEffect(() => {
    try {
      localStorage.setItem("language", language);
    } catch (err) {
      console.warn("Language storage write failed", err);
    }
    if (isRTL) {
      ensureUrduFonts();
    }
    document.documentElement.dir = isRTL ? "rtl" : "ltr";
    document.documentElement.lang = language;
  }, [language, isRTL]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const t = (key: TranslationKey): string => {
    const val = translations[language][key];
    if (val) return val;
    return translations.ur[key] ?? translations.en[key];
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
