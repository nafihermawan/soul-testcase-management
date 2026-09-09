import { ProjectDetailView } from "@/components/hierarchy/project-detail-view";

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  return <ProjectDetailView projectId={params.id} />;
}
