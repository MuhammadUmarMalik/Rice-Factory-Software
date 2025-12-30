import { useLocation } from "wouter"
import {
  DashboardSkeleton,
  FormPageSkeleton,
  PrintPreviewSkeleton,
  TablePageSkeleton,
} from "@/components/loading/page-skeletons"

function RouteSkeleton() {
  const [location] = useLocation()

  if (location === "/" || location.startsWith("/dashboard")) {
    return <DashboardSkeleton />
  }

  if (location.startsWith("/print-preview")) {
    return <PrintPreviewSkeleton />
  }

  if (location.startsWith("/settings")) {
    return <FormPageSkeleton />
  }

  if (
    location.startsWith("/purchases") ||
    location.startsWith("/sales") ||
    location.startsWith("/processing") ||
    location.startsWith("/journal") ||
    location.startsWith("/payments") ||
    location.startsWith("/receipts") ||
    location.startsWith("/expenses") ||
    location.startsWith("/products") ||
    location.startsWith("/hr")
  ) {
    return <FormPageSkeleton includeTable />
  }

  if (
    location.startsWith("/reports") ||
    location.startsWith("/accounts") ||
    location.startsWith("/admin")
  ) {
    return <TablePageSkeleton />
  }

  return <TablePageSkeleton />
}

export { RouteSkeleton }
