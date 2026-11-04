import { FEEDBACK_STATUSES, type FeedbackStatus, type Paginated } from "@flooper/shared";
import type { Feedback, Project } from "@flooper/shared/schemas";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { api, keys } from "../api";
import { FeedbackCard } from "../components/FeedbackCard";
import { FieldErrors } from "../components/FieldErrors";

export function ProjectPage() {
  const { projectId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "setup" ? "setup" : "inbox";
  const project = useQuery({
    queryKey: keys.project(projectId),
    queryFn: () => api.getProject(projectId),
  });

  if (project.isPending) return <p className="muted">Loading…</p>;
  if (project.isError) return <p className="error">{project.error.message}</p>;

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/" className="muted small">
            ← Your sites
          </Link>
          <h1>{project.data.name}</h1>
        </div>
        <nav className="tabs">
          <button
            type="button"
            className={tab === "inbox" ? "active" : ""}
            onClick={() => setParams({})}
          >
            Inbox
          </button>
          <button
            type="button"
            className={tab === "setup" ? "active" : ""}
            onClick={() => setParams({ tab: "setup" })}
          >
            Setup
          </button>
        </nav>
      </div>
      {tab === "inbox" ? (
        <Inbox projectId={projectId} allowedOrigins={project.data.allowedOrigins} />
      ) : (
        <Setup project={project.data} />
      )}
    </>
  );
}

type FeedbackPages = InfiniteData<Paginated<Feedback>, string | undefined>;

function Inbox({ projectId, allowedOrigins }: { projectId: string; allowedOrigins: string[] }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<FeedbackStatus | undefined>("new");
  const queryKey = keys.feedback(projectId, status);

  // Infinite query + the API's cursors = "Load more" with no offset math.
  const feedback = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => api.listFeedback(projectId, { status, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  // Optimistic update: change the card immediately, roll back if the server
  // says no, and resync with the server either way.
  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: FeedbackStatus }) =>
      api.updateFeedback(id, status),
    onMutate: async ({ id, status: next }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<FeedbackPages>(queryKey);
      queryClient.setQueryData<FeedbackPages>(
        queryKey,
        (data) =>
          data && {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              data: page.data.map((f) => (f.id === id ? { ...f, status: next } : f)),
            })),
          },
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["feedback", projectId] }),
  });

  const items = feedback.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <>
      <div className="filters">
        <button
          type="button"
          className={status === undefined ? "chip active" : "chip"}
          onClick={() => setStatus(undefined)}
        >
          all
        </button>
        {FEEDBACK_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className={status === s ? "chip active" : "chip"}
            onClick={() => setStatus(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {feedback.isPending && <p className="muted">Loading…</p>}
      {feedback.isError && <p className="error">{feedback.error.message}</p>}
      {feedback.isSuccess && items.length === 0 && (
        <div className="empty">
          <p>Nothing here yet.</p>
          <p className="muted small">Notes from your visitors will show up here.</p>
        </div>
      )}

      <div className="feed">
        {items.map((item) => (
          <FeedbackCard
            key={item.id}
            feedback={item}
            allowedOrigins={allowedOrigins}
            onStatus={(next) => updateStatus.mutate({ id: item.id, status: next })}
          />
        ))}
      </div>

      {feedback.hasNextPage && (
        <button
          type="button"
          className="btn ghost load-more"
          onClick={() => feedback.fetchNextPage()}
          disabled={feedback.isFetchingNextPage}
        >
          {feedback.isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      )}
    </>
  );
}

function Setup({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const [origins, setOrigins] = useState(project.allowedOrigins.join("\n"));
  const save = useMutation({
    mutationFn: (allowedOrigins: string[]) => api.updateProject(project.id, { allowedOrigins }),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.project(project.id), updated);
      queryClient.invalidateQueries({ queryKey: keys.projects });
      setOrigins(updated.allowedOrigins.join("\n"));
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate(origins.split(/\s+/).filter(Boolean));
  }

  // The portal, API and SDK bundle are all served from this same origin.
  const snippet = `<script
  src="${window.location.origin}/sdk/flooper.js"
  data-project-key="${project.publicKey}"
  data-api-url="${window.location.origin}"
  defer
></script>`;

  return (
    <div className="setup">
      <section className="card">
        <h2>1. Add the widget</h2>
        <p className="muted small">Paste this before the closing &lt;/body&gt; tag on your site.</p>
        <pre className="code">{snippet}</pre>
        <button
          type="button"
          className="btn ghost"
          onClick={() => navigator.clipboard.writeText(snippet)}
        >
          Copy
        </button>
      </section>

      <form className="card" onSubmit={onSubmit}>
        <h2>2. Allow your site's origin</h2>
        <p className="muted small">
          The widget only works on these origins, one per line (e.g. https://mysite.com). This stops
          other sites from using your project key.
        </p>
        <textarea rows={4} value={origins} onChange={(e) => setOrigins(e.target.value)} />
        <FieldErrors error={save.error} />
        <div className="row">
          <button type="submit" className="btn primary" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </button>
          {save.isSuccess && <span className="muted small">Saved ✓</span>}
        </div>
      </form>

      <section className="card">
        <h2>Project key</h2>
        <p className="muted small">
          Public by design: it identifies your project, like a Stripe publishable key. It isn't a
          password.
        </p>
        <code>{project.publicKey}</code>
      </section>
    </div>
  );
}
