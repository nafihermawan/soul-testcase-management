import { EditRunView } from "@/components/test-runs/edit-run-view";

export default function EditTestRunPage({ params }: { params: { id: string } }) {
  return <EditRunView runId={params.id} />;
}
