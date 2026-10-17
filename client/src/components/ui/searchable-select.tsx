import { useState, useRef, useEffect, useMemo } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface SearchableSelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /**
   * When true, the search box doubles as a free-text entry: typing a name that
   * does not match an existing option lets the user commit it as a custom
   * value. Used by Cash in Hand, where a payment can legitimately go to a party
   * that has not been set up as an account yet.
   */
  allowCustom?: boolean;
  customEmptyLabel?: string;
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyMessage = "No results found.",
  className,
  disabled = false,
  autoFocus = false,
  allowCustom = false,
  customEmptyLabel = "Use this name",
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  const effectiveOptions = useMemo(() => {
    if (!allowCustom || !value) return options;
    if (options.some((o) => o.value === value)) return options;
    return [...options, { value, label: value }];
  }, [options, value, allowCustom]);

  const filtered = effectiveOptions.filter((o) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      o.label.toLowerCase().includes(q) ||
      (o.sublabel && o.sublabel.toLowerCase().includes(q))
    );
  });

  const hasExactCustomMatch =
    allowCustom && search.trim() ? options.some((o) => o.label.toLowerCase() === search.trim().toLowerCase()) : false;

  const allItems = useMemo(() => {
    const items: Array<{ type: "custom" | "option"; value: string; label: string }> = [];
    if (allowCustom && search.trim() && !hasExactCustomMatch) {
      items.push({ type: "custom", value: "__custom__", label: search.trim() });
    }
    for (const o of filtered) {
      items.push({ type: "option", value: o.value, label: o.label });
    }
    return items;
  }, [allowCustom, search, hasExactCustomMatch, filtered]);

  const commitCustom = () => {
    const trimmed = search.trim();
    if (!trimmed) return;
    onValueChange(trimmed);
    setOpen(false);
    setSearch("");
    setHighlightedIndex(-1);
  };

  const selectOption = (optionValue: string) => {
    onValueChange(optionValue);
    setOpen(false);
    setSearch("");
    setHighlightedIndex(-1);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (allowCustom && search.trim() && !hasExactCustomMatch) {
        e.preventDefault();
        commitCustom();
        return;
      }
      if (highlightedIndex >= 0 && highlightedIndex < allItems.length) {
        e.preventDefault();
        selectOption(allItems[highlightedIndex].value);
        return;
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        const next = prev + 1;
        return next >= allItems.length ? prev : next;
      });
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        if (prev <= 0) return prev === -1 ? allItems.length - 1 : prev;
        return prev - 1;
      });
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setHighlightedIndex(-1);
    }
  };

  useEffect(() => {
    if (open) {
      setSearch("");
      setHighlightedIndex(-1);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [search]);

  useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-index="${highlightedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        className={cn(
          "w-full justify-between font-normal",
          !selected && "text-muted-foreground",
          className
        )}
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
      >
        <span className="truncate">
          {selected ? selected.label : placeholder}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>

      <Dialog modal open={open} onOpenChange={setOpen}>
        <DialogContent variant="modal" className="max-w-md p-0 gap-0">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle>{placeholder}</DialogTitle>
          </DialogHeader>
          <div className="px-4 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
                autoFocus={autoFocus}
                onKeyDown={handleSearchKeyDown}
              />
            </div>
          </div>
          <ScrollArea className="h-[300px] px-2 pb-2">
            {filtered.length === 0 && !(allowCustom && search.trim() && !hasExactCustomMatch) ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </p>
            ) : (
              <div className="space-y-0.5" ref={listRef}>
                {allItems.map((item, index) => {
                  const isHighlighted = index === highlightedIndex;
                  const isSelected = item.type === "option" && item.value === value;

                  if (item.type === "custom") {
                    return (
                      <button
                        key="__custom__"
                        type="button"
                        data-index={index}
                        className={cn(
                          "w-full flex items-center justify-between rounded-sm px-2 py-2 text-sm cursor-pointer text-left",
                          isHighlighted
                            ? "bg-accent ring-1 ring-primary"
                            : "bg-accent hover:bg-accent/80"
                        )}
                        onClick={commitCustom}
                        title="Use this name"
                      >
                        <span className="font-medium">{item.label}</span>
                        <span className="text-xs text-muted-foreground">{customEmptyLabel}</span>
                      </button>
                    );
                  }

                  const option = filtered.find((o) => o.value === item.value)!;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      data-index={index}
                      className={cn(
                        "w-full flex items-center justify-between rounded-sm px-2 py-2 text-sm cursor-pointer text-left",
                        isHighlighted
                          ? "bg-accent ring-1 ring-primary"
                          : "hover:bg-accent",
                        isSelected && !isHighlighted && "bg-accent"
                      )}
                      onClick={() => selectOption(option.value)}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{option.label}</span>
                        {option.sublabel && (
                          <span className="text-xs text-muted-foreground">
                            {option.sublabel}
                          </span>
                        )}
                      </div>
                      {isSelected && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
