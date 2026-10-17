import { useQuery } from "@tanstack/react-query";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { fetchWithAuth } from "@/lib/authFetch";

type DashboardChartsSectionProps = {
  fromDate: string;
  toDate: string;
  isRTL: boolean;
  purchasesLabel: string;
  salesLabel: string;
};

export function DashboardChartsSection({
  fromDate,
  toDate,
  isRTL,
  purchasesLabel,
  salesLabel,
}: DashboardChartsSectionProps) {
  const { data: chartData, isLoading: chartLoading } = useQuery<{
    monthlyTotals: { name: string; purchases: number; sales: number }[];
    productStock: { name: string; stock: number; unit: string }[];
  }>({
    queryKey: ["/api/dashboard/charts", fromDate, toDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      const res = await fetchWithAuth(`/api/dashboard/charts?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch chart data");
      return res.json();
    },
    staleTime: 0,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
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
