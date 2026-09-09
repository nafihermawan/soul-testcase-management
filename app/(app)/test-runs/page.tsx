import { RunListView, type ActiveRunsSearchParams } from "@/components/test-runs/run-list-view";

export default function TestRunsPage({
  searchParams,
}: {
  searchParams?: ActiveRunsSearchParams;
}) {
  return <RunListView searchParams={searchParams ?? {}} />;
}
