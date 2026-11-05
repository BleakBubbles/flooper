import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { api, keys } from "../api";
import { usePageTitle } from "../usePageTitle";
import { InboxPage } from "./InboxPage";
import { SetupPage } from "./SetupPage";

/**
 * A site's home: Setup until its first note arrives, the Inbox after that.
 * While on Setup, the counts are polled so the page switches by itself the
 * moment a test note lands.
 */
export function SitePage() {
  const { projectId = "" } = useParams();
  const project = useQuery({
    queryKey: keys.project(projectId),
    queryFn: () => api.getProject(projectId),
  });
  const counts = useQuery({
    queryKey: keys.counts(projectId),
    queryFn: () => api.feedbackCounts(projectId),
    refetchInterval: (query) => (query.state.data?.total === 0 ? 4000 : false),
  });
  const isSetup = counts.data?.total === 0;
  usePageTitle(isSetup ? "Setup" : "Inbox", project.data?.name);

  if (project.isPending || counts.isPending) return <main className="page muted">Loading…</main>;
  if (project.isError) return <main className="page error">{project.error.message}</main>;
  if (counts.isError) return <main className="page error">{counts.error.message}</main>;

  return isSetup ? (
    <SetupPage project={project.data} />
  ) : (
    <InboxPage project={project.data} counts={counts.data} />
  );
}
