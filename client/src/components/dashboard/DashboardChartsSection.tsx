import { useQuery } from "@tanstack/react-query";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";

type DashboardChartsSectionProps = {
  fromDate: string;
  toDate: string;
  godown: string;
  isRTL: boolean;
  purchasesLabel: string;
  salesLabel: string;
};

export function DashboardChartsSection({
  fromDate,
  toDate,
  godown,
  isRTL,
  purchasesLabel,
  salesLabel,
}: DashboardChartsSectionProps) {
  const { data: chartData, isLoading: chartLoading } = useQuery<{
    monthlyTotals: { name: string; purchases: number; sales: number }[];
    productStock: { name: string; stock: number; unit: string }[];
  }>({
    queryKey: ["/api/dashboard/charts", fromDate, toDate, godown],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      const res = await fetch(`/api/dashboard/charts?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch chart data");
      return res.json();
    },
    staleTime: 0,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  return (
    <DashboardCharts
      chartLoading={chartLoading}
      chartData={chartData}
      isRTL={isRTL}
      purchasesLabel={purchasesLabel}
      salesLabel={salesLabel}
    />
  );
}
