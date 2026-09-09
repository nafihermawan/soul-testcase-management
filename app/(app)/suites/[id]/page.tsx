import { SuiteDetailView } from "@/components/hierarchy/suite-detail-view";

export default function SuiteDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { edit?: string };
}) {
  return <SuiteDetailView suiteId={params.id} initialEditTcId={searchParams?.edit ?? null} />;
}
