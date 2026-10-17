import { useEffect, useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SkeletonTableRow } from "@/components/ui/skeletons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useLanguage } from "@/contexts/language-context";

export interface Column<T> {
  key: keyof T | string;
  title: string;
  titleUrdu?: string;
  render?: (item: T, index: number) => React.ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  searchAlign?: "start" | "end";
  pageSize?: number;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  testIdPrefix?: string;
  /** Extra row appended after each page's rows (e.g. balance carried forward). */
  footerRow?: (pageRows: T[]) => T | null;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  isLoading = false,
  searchable = true,
  searchPlaceholder,
  searchAlign = "start",
  pageSize: initialPageSize = 10,
  emptyMessage,
  onRowClick,
  testIdPrefix = "table",
  footerRow,
}: DataTableProps<T>) {
  const { t, isRTL, language } = useLanguage();
  const ur = language === "ur";
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [dateSort, setDateSort] = useState<"none" | "desc" | "asc">("none");
  // First column keyed like saleDate / voucherDate / date gets the date sort.
  const dateKey = columns.find((c) => /(^date|Date)$/.test(String(c.key)))?.key as string | undefined;
  // Debounce to avoid re-filtering on every keystroke for large datasets.
  const debouncedQuery = useDebouncedValue(searchQuery, 200);

  const filteredData = useMemo(() => {
    if (!searchable) return data;
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return data;
    // Next step for very large datasets: move filtering to a Web Worker or server-side pagination.
    return data.filter((item) =>
      Object.values(item).some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [data, searchable, debouncedQuery]);

  const sortedData = useMemo(() => {
    if (!dateKey || dateSort === "none") return filteredData;
    const dir = dateSort === "asc" ? 1 : -1;
    const ts = (item: T) => (item[dateKey] == null ? NaN : new Date(item[dateKey]).getTime());
    // Rows without a parseable date (e.g. opening balance) stay at the end.
    return [...filteredData].sort((a, b) => {
      const x = ts(a), y = ts(b);
      if (isNaN(x) || isNaN(y)) return isNaN(x) ? (isNaN(y) ? 0 : 1) : -1;
      return (x - y) * dir;
    });
  }, [filteredData, dateKey, dateSort]);

  const totalPages = Math.ceil(sortedData.length / pageSize);
  const paginatedData = useMemo(() => {
    const page = sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const extra = page.length ? footerRow?.(page) : null;
    return extra ? [...page, extra] : page;
  }, [sortedData, currentPage, pageSize, footerRow]);
  const pageNumbers = pageWindow(currentPage, totalPages);

  useEffect(() => {
    // Clamp to a valid page when filters shrink the dataset.
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  const getCellValue = (item: T, column: Column<T>, index: number) => {
    if (column.render) {
      return column.render(item, index);
    }
    return item[column.key as keyof T];
  };

  return (
    <div className="space-y-4">
      {(searchable || dateKey) && (
        <div
          className={`flex w-full flex-wrap items-center gap-2 ${
            searchAlign === "end" ? "justify-end" : isRTL ? "justify-end" : "justify-start"
          } ${isRTL ? "flex-row-reverse" : ""}`}
        >
          {searchable && (
          <div className="relative w-full max-w-sm">
            <Search
              className={`absolute ${isRTL ? "right-3" : "left-3"} top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground`}
            />
            <Input
              type="search"
              placeholder={searchPlaceholder || t("search")}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className={`${isRTL ? "pr-9 pl-4 text-right font-urdu" : "pl-9 pr-4"}`}
              data-testid={`${testIdPrefix}-search`}
              aria-label={searchPlaceholder || t("search")}
            />
          </div>
          )}
          {dateKey && (
            <Select
              value={dateSort}
              onValueChange={(v) => {
                setDateSort(v as typeof dateSort);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className={`w-44 ${isRTL ? "font-urdu" : ""}`} data-testid={`${testIdPrefix}-date-sort`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{ur ? "ڈیفالٹ ترتیب" : "Default order"}</SelectItem>
                <SelectItem value="desc">{ur ? "تاریخ: نئی پہلے" : "Date: newest first"}</SelectItem>
                <SelectItem value="asc">{ur ? "تاریخ: پرانی پہلے" : "Date: oldest first"}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              {columns.map((column, index) => (
                <TableHead
                  key={index}
                  className={`${
                    column.align === "right" || (isRTL && column.align !== "left")
                      ? "text-right"
                      : column.align === "center"
                      ? "text-center"
                      : "text-left"
                  } ${column.className || ""} ${isRTL ? "font-urdu" : ""}`}
                >
                  {language === "ur" && column.titleUrdu ? column.titleUrdu : column.title}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, index) => (
                <SkeletonTableRow key={index} columns={columns.length} />
              ))
            ) : paginatedData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className={`text-center py-10 text-muted-foreground ${isRTL ? "font-urdu" : ""}`}
                >
                  {emptyMessage || t("noRecords")}
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((item, index) => (
                <TableRow
                  key={index}
                  className={onRowClick ? "cursor-pointer hover-elevate" : ""}
                  onClick={() => onRowClick?.(item)}
                  data-testid={`${testIdPrefix}-row-${index}`}
                >
                  {columns.map((column, colIndex) => (
                    <TableCell
                      key={colIndex}
                      className={`${
                        column.align === "right" || (isRTL && column.align !== "left")
                          ? "text-right"
                          : column.align === "center"
                          ? "text-center"
                          : "text-left"
                      } ${column.className || ""}`}
                    >
                      {getCellValue(item, column, (currentPage - 1) * pageSize + index)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {!isLoading && sortedData.length > Math.min(initialPageSize, PAGE_SIZES[0]) && (
        <div className={`flex flex-wrap items-center justify-between gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
          <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse font-urdu" : ""}`}>
            <p className="text-sm text-muted-foreground">
              {ur
                ? `${sortedData.length} میں سے ${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, sortedData.length)}`
                : `Showing ${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, sortedData.length)} of ${sortedData.length}`}
            </p>
            <div className={`flex items-center gap-2 text-sm text-muted-foreground ${isRTL ? "flex-row-reverse" : ""}`}>
              <span>{ur ? "فی صفحہ" : "Rows per page"}</span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-20" data-testid={`${testIdPrefix}-page-size`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set([...PAGE_SIZES, initialPageSize])].sort((a, b) => a - b).map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {totalPages > 1 && (
          <div className={`flex items-center gap-1 ${isRTL ? "flex-row-reverse" : ""}`}>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(1)}
              data-testid={`${testIdPrefix}-first`}
              aria-label={t("firstPage")}
            >
              {isRTL ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((prev) => prev - 1)}
              data-testid={`${testIdPrefix}-prev`}
              aria-label={t("previousPage")}
            >
              {isRTL ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
            {pageNumbers.map((p, i) =>
              p === null ? (
                <span key={`gap-${i}`} className="px-1 text-sm text-muted-foreground">…</span>
              ) : (
                <Button
                  key={p}
                  variant={p === currentPage ? "default" : "outline"}
                  size="icon"
                  className="h-8 w-8 text-sm"
                  onClick={() => setCurrentPage(p)}
                  aria-current={p === currentPage ? "page" : undefined}
                  data-testid={`${testIdPrefix}-page-${p}`}
                >
                  {p}
                </Button>
              ),
            )}
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((prev) => prev + 1)}
              data-testid={`${testIdPrefix}-next`}
              aria-label={t("nextPage")}
            >
              {isRTL ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(totalPages)}
              data-testid={`${testIdPrefix}-last`}
              aria-label={t("lastPage")}
            >
              {isRTL ? <ChevronsLeft className="h-4 w-4" /> : <ChevronsRight className="h-4 w-4" />}
            </Button>
          </div>
          )}
        </div>
      )}
    </div>
  );
}

const PAGE_SIZES = [10, 25, 50, 100];

/** Page buttons around the current page: 1 … 4 5 [6] 7 8 … 20 (null = gap). */
export function pageWindow(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const start = Math.max(2, Math.min(current - 2, total - 5));
  const end = Math.min(total - 1, start + 4);
  const out: (number | null)[] = [1];
  if (start > 2) out.push(null);
  for (let p = start; p <= end; p++) out.push(p);
  if (end < total - 1) out.push(null);
  out.push(total);
  return out;
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}
