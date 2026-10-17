import { useSyncExternalStore } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { useLanguage } from "@/contexts/language-context";

type Pending = { message: string; resolve: (ok: boolean) => void } | null;

let pending: Pending = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Styled, RTL-aware replacement for window.confirm(). Resolves true on confirm. */
export function confirmAction(message: string): Promise<boolean> {
  pending?.resolve(false);
  return new Promise((resolve) => {
    pending = { message, resolve };
    emit();
  });
}

function settle(ok: boolean) {
  pending?.resolve(ok);
  pending = null;
  emit();
}

/** Mount once in the app shell. */
export function ConfirmHost() {
  const current = useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => pending,
  );
  const { t, isRTL } = useLanguage();

  return (
    <AlertDialog open={!!current} onOpenChange={(open) => !open && settle(false)}>
      <AlertDialogContent className={isRTL ? "font-urdu text-right" : ""}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("delete")}?</AlertDialogTitle>
          <AlertDialogDescription>{current?.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className={isRTL ? "sm:flex-row-reverse sm:justify-start" : ""}>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: "destructive" })}
            onClick={() => settle(true)}
          >
            {t("delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
