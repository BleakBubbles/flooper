import {
  FEEDBACK_STATUSES,
  type FeedbackCounts,
  type FeedbackStatus,
  type Paginated,
} from "@flooper/shared";
import type { Feedback, Project } from "@flooper/shared/schemas";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { api, keys } from "../api";
import { ErrorState } from "../components/ErrorState";
import { FeedbackDetail } from "../components/FeedbackDetail";
import { FeedbackRow } from "../components/FeedbackRow";
import { CloseIcon } from "../components/icons";

type Filter = FeedbackStatus | "all";
const FILTERS: { value: Filter; label: string }[] = [
  ...FEEDBACK_STATUSES.map((s) => ({ value: s, label: s[0]?.toUpperCase() + s.slice(1) })),
  { value: "all", label: "All" },
];

const EMPTY: Record<Filter, string> = {
  new: "Nothing new. You're all caught up.",
  seen: "No notes marked as seen.",
  done: "Nothing done yet.",
  archived: "Nothing archived.",
  all: "No notes yet.",
};

/** For "Couldn't ___ that note": what each status change was trying to do. */
const STATUS_ACTION: Record<FeedbackStatus, string> = {
  new: "reopen",
  seen: "mark",
  done: "mark done",
  archived: "archive",
};

/** Wide enough for the list and the selected note side by side. Matches the CSS. */
const SPLIT_QUERY = "(min-width: 900px)";

type FeedbackPages = InfiniteData<Paginated<Feedback>, string | undefined>;

/**
 * A split view, like a mail app: the list on the left, the selected note on
 * the right. The filter (?show=) and the selected note (?note=) live in the
 * URL, so reloads, links and the back button all keep your place. On narrow
 * screens it's one column at a time: the list, or the note with a back link.
 */
export function InboxPage({ project, counts }: { project: Project; counts: FeedbackCounts }) {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const filter = (FILTERS.find((f) => f.value === params.get("show"))?.value ?? "new") as Filter;
  const status = filter === "all" ? undefined : filter;
  const noteId = params.get("note");
  const queryKey = keys.feedback(project.id, status);
  /** Set when a status change fails, so the note popping back isn't a mystery. */
  const [statusError, setStatusError] = useState<string | null>(null);

  // Infinite query + the API's cursors = "Load more" with no offset math.
  const feedback = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => api.listFeedback(project.id, { status, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = feedback.data?.pages.flatMap((p) => p.data) ?? [];

  // The selected note is usually already in the list; a link to one from
  // another filter (or further down) is fetched on its own.
  const inList = items.find((f) => f.id === noteId);
  const single = useQuery({
    queryKey: keys.note(project.id, noteId ?? ""),
    queryFn: () => api.getFeedback(noteId ?? ""),
    enabled: !!noteId && !inList && feedback.isSuccess,
  });
  const selected = inList ?? single.data;

  /** The current URL with some parameters changed (null removes one). */
  const hrefWith = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    const qs = next.toString();
    return qs ? `?${qs}` : "?";
  };

  // On wide screens, open the first note so the right side is never blank.
  const firstId = items[0]?.id;
  useEffect(() => {
    if (!noteId && firstId && window.matchMedia(SPLIT_QUERY).matches) {
      const next = new URLSearchParams(params);
      next.set("note", firstId);
      setParams(next, { replace: true });
    }
  }, [noteId, firstId, params, setParams]);

  // Optimistic update: the note leaves (or changes in) the list immediately,
  // rolls back if the server says no, and everything resyncs either way.
  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: FeedbackStatus }) =>
      api.updateFeedback(id, status),
    onMutate: async ({ id, status: next }) => {
      setStatusError(null);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<FeedbackPages>(queryKey);
      queryClient.setQueryData<FeedbackPages>(
        queryKey,
        (data) =>
          data && {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              data:
                filter === "all" || filter === next
                  ? page.data.map((f) => (f.id === id ? { ...f, status: next } : f))
                  : page.data.filter((f) => f.id !== id),
            })),
          },
      );
      return { previous };
    },
    onError: (_err, { status: next }, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      setStatusError(`Couldn't ${STATUS_ACTION[next]} that note, so nothing changed. Try again?`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["feedback", project.id] }),
  });

  /**
   * Change a note's status. If that takes it out of the current list and it
   * was the open one, move to its neighbor, so triage is one click per note.
   */
  function changeStatus(id: string, next: FeedbackStatus) {
    const leaves = filter !== "all" && filter !== next;
    if (leaves && id === noteId) {
      const index = items.findIndex((f) => f.id === id);
      const neighbor = items[index + 1] ?? items[index - 1];
      setParams(new URLSearchParams(hrefWith({ note: neighbor?.id ?? null }).slice(1)), {
        replace: true,
      });
    }
    updateStatus.mutate({ id, status: next });
  }

  const countFor = (f: Filter) => (f === "all" ? counts.total : counts[f]);
  const isEmpty = feedback.isSuccess && items.length === 0;

  return (
    <main className="page wide">
      <section className="panel" aria-labelledby="inbox-heading">
        <div className="toolbar">
          <h1 id="inbox-heading">
            Inbox {counts.new > 0 && <span className="badge">{counts.new} new</span>}
          </h1>
          <div className="segmented" role="tablist" aria-label="Show">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="tab"
                aria-selected={f.value === filter}
                onClick={() => setParams(f.value === "new" ? {} : { show: f.value })}
              >
                {f.label}
                {countFor(f.value) > 0 && <span className="count">{countFor(f.value)}</span>}
              </button>
            ))}
          </div>
        </div>

        {statusError && (
          <div className="alert" role="alert">
            <span>{statusError}</span>
            <button
              type="button"
              className="icon-button"
              aria-label="Dismiss"
              data-tooltip="Dismiss"
              onClick={() => setStatusError(null)}
            >
              <CloseIcon />
            </button>
          </div>
        )}
        {feedback.isPending && <p className="panel-empty muted">Loading…</p>}
        {/* Only when nothing loaded: a failed "Load more" is reported at the bottom. */}
        {feedback.isError && !feedback.data && (
          <div className="panel-empty">
            <ErrorState error={feedback.error} onRetry={() => feedback.refetch()} />
          </div>
        )}
        {isEmpty && <p className="panel-empty muted">{EMPTY[filter]}</p>}

        {items.length > 0 && (
          <div className={selected ? "split has-selection" : "split"}>
            <div className="split-list">
              <ul className="rows">
                {items.map((item) => (
                  <FeedbackRow
                    key={item.id}
                    feedback={item}
                    href={hrefWith({ note: item.id })}
                    selected={item.id === noteId}
                    onStatus={(next) => changeStatus(item.id, next)}
                  />
                ))}
              </ul>
              {feedback.hasNextPage && (
                <div className="panel-footer">
                  {feedback.isFetchNextPageError && !feedback.isFetchingNextPage && (
                    <span className="error small" role="alert">
                      Couldn't load more.
                    </span>
                  )}
                  <button
                    type="button"
                    className="btn"
                    onClick={() => feedback.fetchNextPage()}
                    disabled={feedback.isFetchingNextPage}
                  >
                    {feedback.isFetchingNextPage
                      ? "Loading…"
                      : feedback.isFetchNextPageError
                        ? "Try again"
                        : "Load more"}
                  </button>
                </div>
              )}
            </div>
            <div className="split-detail">
              {selected && (
                <FeedbackDetail
                  key={selected.id}
                  feedback={selected}
                  allowedOrigins={project.allowedOrigins}
                  backHref={hrefWith({ note: null })}
                  onStatus={(next) => changeStatus(selected.id, next)}
                />
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
