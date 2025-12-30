import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { SkeletonBox, SkeletonCard, SkeletonTable, SkeletonText } from "@/components/ui/skeletons"

function DashboardSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBox className="h-6 w-40" />
          <SkeletonBox className="h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <SkeletonBox className="h-9 w-28" />
          <SkeletonBox className="h-9 w-28" />
          <SkeletonBox className="h-9 w-28" />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <SkeletonBox className="h-4 w-24" />
                <SkeletonBox className="h-9 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonCard key={`stat-${index}`} lines={2} />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonCard key={`kpi-${index}`} lines={2} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={4} />
      </div>

      <div className="grid gap-6">
        <SkeletonCard lines={1} />
        <SkeletonCard lines={1} />
      </div>
    </div>
  )
}

type TablePageSkeletonProps = {
  columns?: number
}

function TablePageSkeleton({ columns = 6 }: TablePageSkeletonProps) {
  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <SkeletonBox className="h-6 w-44" />
        <SkeletonBox className="h-9 w-32" />
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="space-y-2">
            <SkeletonBox className="h-4 w-20" />
            <SkeletonBox className="h-9 w-full" />
          </div>
        ))}
      </div>
      <SkeletonTable columns={columns} rows={7} />
    </div>
  )
}

type FormPageSkeletonProps = {
  includeTable?: boolean
}

function FormPageSkeleton({ includeTable = false }: FormPageSkeletonProps) {
  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <SkeletonBox className="h-6 w-44" />
        <SkeletonBox className="h-9 w-28" />
      </div>
      <Card>
        <CardHeader>
          <SkeletonBox className="h-4 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <SkeletonBox className="h-4 w-24" />
                <SkeletonBox className="h-9 w-full" />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <SkeletonBox className="h-9 w-24" />
            <SkeletonBox className="h-9 w-28" />
          </div>
        </CardContent>
      </Card>
      {includeTable ? <SkeletonTable columns={6} rows={6} /> : null}
    </div>
  )
}

function PrintPreviewSkeleton() {
  return (
    <div className="flex min-h-[520px] w-full flex-col overflow-hidden rounded-xl bg-white shadow-xl">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <SkeletonBox className="h-5 w-32" />
        <div className="flex gap-2">
          <SkeletonBox className="h-8 w-20" />
          <SkeletonBox className="h-8 w-28" />
        </div>
      </div>
      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
        <div className="w-full shrink-0 border-r bg-slate-50 p-4 lg:w-80">
          <SkeletonText lines={2} />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <SkeletonBox className="h-3 w-20" />
                <SkeletonBox className="h-9 w-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1 bg-slate-100 p-3">
          <div className="mx-auto w-full max-w-[820px]">
            <SkeletonBox className="h-[520px] w-full rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  )
}

function LoginSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md min-h-[420px] shadow-sm">
        <CardHeader className="space-y-2">
          <SkeletonBox className="h-6 w-28" />
          <SkeletonBox className="h-4 w-56" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <SkeletonBox className="h-4 w-24" />
            <SkeletonBox className="h-9 w-full" />
          </div>
          <div className="space-y-2">
            <SkeletonBox className="h-4 w-24" />
            <SkeletonBox className="h-9 w-full" />
          </div>
          <SkeletonBox className="h-9 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}

export {
  DashboardSkeleton,
  TablePageSkeleton,
  FormPageSkeleton,
  PrintPreviewSkeleton,
  LoginSkeleton,
}
