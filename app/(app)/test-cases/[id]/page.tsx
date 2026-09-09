import { TestCaseDetailView } from "@/components/test-cases/test-case-detail-view";

export default function TestCaseDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { tab?: string };
}) {
  return <TestCaseDetailView testCaseId={params.id} initialTab={searchParams?.tab} />;
}
