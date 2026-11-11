import type { Project } from "@flooper/shared/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, keys } from "../api";
import { ReplyIcon } from "./icons";

/**
 * Asks once, for sites from before replies existed, whether the widget
 * should ask visitors if they want to hear back. Either answer is kept on the
 * site (so it's asked once, on every device), and Site settings can change it
 * later. New sites start with it on and never see this.
 */
export function RepliesPrompt({ sites }: { sites: Project[] }) {
  const queryClient = useQueryClient();
  const site = sites.find((s) => s.replyPrompt);
  const answer = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) =>
      api.updateProject(id, { replyRequests: on }),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.project(updated.id), updated);
      void queryClient.invalidateQueries({ queryKey: keys.projects });
    },
  });
  if (!site) return null;

  return (
    <section className="digest-prompt" aria-label="Replies">
      <ReplyIcon />
      <span className="digest-prompt-text">
        <b>New: </b>Allow your visitors to request a reply by leaving their email?{" "}
        <span className="muted">Flooper will help you get back to them about their notes.</span>
      </span>
      <span className="digest-prompt-actions">
        <button
          type="button"
          className="btn primary small"
          onClick={() => answer.mutate({ id: site.id, on: true })}
          disabled={answer.isPending}
        >
          Turn on
        </button>
        <button
          type="button"
          className="btn quiet small"
          onClick={() => answer.mutate({ id: site.id, on: false })}
          disabled={answer.isPending}
        >
          Not now
        </button>
      </span>
    </section>
  );
}
