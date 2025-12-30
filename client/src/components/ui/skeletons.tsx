import * as React from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

type SkeletonBoxProps = React.HTMLAttributes<HTMLDivElement>

function SkeletonBox({ className, ...props }: SkeletonBoxProps) {
  return <Skeleton className={cn("rounded-md", className)} {...props} />
}

type SkeletonTextProps = {
  lines?: number
  widths?: string[]
  className?: string
  lineClassName?: string
}

function SkeletonText({
  lines = 2,
  widths = ["w-5/6", "w-3/4", "w-2/3", "w-1/2"],
  className,
  lineClassName,
}: SkeletonTextProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <SkeletonBox
          key={index}
          className={cn("h-4", widths[index % widths.length], lineClassName)}
        />
      ))}
    </div>
  )
}

type SkeletonAvatarProps = {
  size?: number
  className?: string
}

function SkeletonAvatar({ size = 40, className }: SkeletonAvatarProps) {
  return (
    <SkeletonBox
      className={cn("rounded-full", className)}
      style={{ width: size, height: size }}
    />
  )
}

type SkeletonCardProps = {
  lines?: number
  headerWidthClassName?: string
  className?: string
}

function SkeletonCard({
  lines = 3,
  headerWidthClassName = "w-32",
  className,
}: SkeletonCardProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <SkeletonBox className={cn("h-4", headerWidthClassName)} />
      </CardHeader>
      <CardContent>
        <SkeletonText lines={lines} />
      </CardContent>
    </Card>
  )
}

type SkeletonTableRowProps = {
  columns: number
  rowHeightClassName?: string
  className?: string
}

function SkeletonTableRow({
  columns,
  rowHeightClassName = "h-5",
  className,
}: SkeletonTableRowProps) {
  const widths = ["w-5/6", "w-2/3", "w-3/4", "w-1/2", "w-4/5"]
  return (
    <TableRow className={className}>
      {Array.from({ length: columns }).map((_, index) => (
        <TableCell key={index}>
          <SkeletonBox className={cn(rowHeightClassName, widths[index % widths.length])} />
        </TableCell>
      ))}
    </TableRow>
  )
}

type SkeletonTableProps = {
  columns?: number
  rows?: number
  className?: string
}

function SkeletonTable({ columns = 5, rows = 6, className }: SkeletonTableProps) {
  return (
    <div className={cn("rounded-lg border border-border overflow-hidden", className)}>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            {Array.from({ length: columns }).map((_, index) => (
              <TableHead key={index}>
                <SkeletonBox className="h-4 w-20" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }).map((_, index) => (
            <SkeletonTableRow key={index} columns={columns} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export {
  SkeletonBox,
  SkeletonText,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonTable,
  SkeletonTableRow,
}
