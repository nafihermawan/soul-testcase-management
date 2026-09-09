import { HistoryView, type HistorySearchParams } from "@/components/test-runs/history-view";

export default function TestRunsHistoryPage({
  searchParams,
}: {
  searchParams?: HistorySearchParams;
}) {
  return <HistoryView searchParams={searchParams ?? {}} />;
}
