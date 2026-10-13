import {
  CreateRunView,
  type CreateRunSearchParams,
} from "@/components/test-runs/create-run-view";

export default function CreateTestRunPage({
  searchParams,
}: {
  searchParams?: CreateRunSearchParams;
}) {
  return <CreateRunView searchParams={searchParams ?? {}} />;
}
