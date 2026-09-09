import { RunDetailView } from "@/components/test-runs/run-detail-view";

export default function RunDetailPage({ params }: { params: { id: string } }) {
  return <RunDetailView runId={params.id} />;
}
