import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { api, keys } from "../api";
import { ErrorState } from "../components/ErrorState";
import { FieldErrors } from "../components/FieldErrors";
import { usePageTitle } from "../usePageTitle";

export function SitesPage() {
  usePageTitle("Your sites");
  const projects = useQuery({ queryKey: keys.projects, queryFn: api.listProjects });
  const [params] = useSearchParams();
  const sites = projects.data?.data ?? [];

  return (
    <main className="page">
      <div className="page-title">
        <h1>Your sites</h1>
      </div>

      {projects.isPending && <p className="muted">Loading…</p>}
      {projects.isError && <ErrorState error={projects.error} onRetry={() => projects.refetch()} />}
      {sites.length > 0 && (
        <ul className="panel rows site-list">
          {sites.map((p) => (
            <li key={p.id}>
              <Link to={`/app/projects/${p.id}`}>
                <span className="site-name">{p.name}</span>
                <span className="mono small muted">
                  {p.allowedOrigins.map((o) => new URL(o).host).join(", ") || "Not set up yet"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {projects.isSuccess && (
        <NewSite autoFocus={params.has("new") || sites.length === 0} first={sites.length === 0} />
      )}
    </main>
  );
}

function NewSite({ autoFocus, first }: { autoFocus: boolean; first: boolean }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: api.createProject,
    // A new site has no notes yet, so its page opens on Setup.
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: keys.projects });
      navigate(`/app/projects/${project.id}`);
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    create.mutate({ name, allowedOrigins: [] });
  }

  return (
    <form className="panel panel-body" onSubmit={onSubmit}>
      <h2 className="site-name">{first ? "Add your first site" : "Add a site"}</h2>
      <div className="row-inline">
        <label htmlFor="site-name" className="sr-only">
          Site name
        </label>
        <input
          id="site-name"
          placeholder="Name, e.g. My blog"
          value={name}
          onChange={(e) => setName(e.target.value)}
          // biome-ignore lint/a11y/noAutofocus: only when the visitor asked to add a site.
          autoFocus={autoFocus}
          required
          style={{ flex: "1 1 240px", width: "auto" }}
        />
        <button type="submit" className="btn primary" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create"}
        </button>
      </div>
      <FieldErrors error={create.error} />
    </form>
  );
}
