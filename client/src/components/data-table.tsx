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
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
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
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  isLoading = false,
  searchable = true,
  searchPlaceholder,
  searchAlign = "start",
  pageSize = 10,
  emptyMessage,
  onRowClick,
  testIdPrefix = "table",
}: DataTableProps<T>) {
  const { t, isRTL, language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
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

  const totalPages = Math.ceil(filteredData.length / pageSize);
  const paginatedData = useMemo(
    () => filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredData, currentPage, pageSize],
  );

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
      {searchable && (
        <div
          className={`flex w-full ${
            searchAlign === "end" ? "justify-end" : isRTL ? "justify-end" : "justify-start"
          }`}
        >
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
            />
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
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

      {totalPages > 1 && (
        <div className={`flex items-center justify-between gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
          <p className={`text-sm text-muted-foreground ${isRTL ? "font-urdu" : ""}`}>
            {language === "ur" 
              ? `${filteredData.length} میں سے ${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, filteredData.length)}`
              : `Showing ${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, filteredData.length)} of ${filteredData.length}`
            }
          </p>
          <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            <Button
              variant="outline"
              size="icon"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((prev) => prev - 1)}
              data-testid={`${testIdPrefix}-prev`}
            >
              {isRTL ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
            <span className="text-sm font-medium">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((prev) => prev + 1)}
              data-testid={`${testIdPrefix}-next`}
            >
              {isRTL ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}
