type FocusDirection = "next" | "prev";

const focusableSelector = [
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "button",
  "[tabindex]:not([tabindex='-1'])",
  "[role='combobox']",
].join(",");

const isFocusable = (el: HTMLElement) => {
  if (el.hasAttribute("disabled")) return false;
  if (el.getAttribute("aria-disabled") === "true") return false;
  if (el.getAttribute("data-arrow-nav") === "false") return false;
  if (el.tabIndex < 0) return false;
  if (el.getClientRects().length === 0) return false;
  return true;
};

export const moveFocusByArrowKey = (
  event: React.KeyboardEvent<HTMLElement>,
  direction: FocusDirection,
) => {
  if (event.defaultPrevented) return;
  if (event.altKey || event.ctrlKey || event.metaKey) return;

  const target = event.currentTarget as HTMLElement;
  if (target.getAttribute("data-arrow-nav") === "false") return;

  const root =
    target.closest("form, [role='dialog'], [data-focus-scope]") || document.body;
  const focusables = Array.from(
    root.querySelectorAll<HTMLElement>(focusableSelector),
  ).filter(isFocusable);
  if (focusables.length === 0) return;

  const index = focusables.indexOf(target);
  const nextIndex = direction === "next" ? index + 1 : index - 1;
  if (nextIndex < 0 || nextIndex >= focusables.length) return;

  event.preventDefault();
  const next = focusables[nextIndex];
  next.focus();
  next.setAttribute("data-arrow-highlight", "true");
  window.setTimeout(() => {
    next.removeAttribute("data-arrow-highlight");
  }, 250);
};
