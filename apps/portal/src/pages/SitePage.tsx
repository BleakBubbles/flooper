import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { api, keys } from "../api";
import { ErrorState } from "../components/ErrorState";
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
  if (project.isError || counts.isError) {
    const error = project.error ?? counts.error;
    return (
      <main className="page">
        {error && (
          <ErrorState
            error={error}
            // Both can fail at once (e.g. offline), so retry whichever did.
            onRetry={() => {
              if (project.isError) void project.refetch();
              if (counts.isError) void counts.refetch();
            }}
          />
        )}
      </main>
    );
  }

  return isSetup ? (
    <SetupPage project={project.data} />
  ) : (
    <InboxPage project={project.data} counts={counts.data} />
  );
}
