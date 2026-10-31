import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, keys } from "../api";
import { FieldErrors } from "../components/FieldErrors";

export function ProjectsPage() {
  const projects = useQuery({ queryKey: keys.projects, queryFn: api.listProjects });

  return (
    <>
      <div className="page-head">
        <h1>Your sites</h1>
      </div>
      {projects.isPending && <p className="muted">Loading…</p>}
      {projects.isError && <p className="error">{projects.error.message}</p>}
      {projects.data && (
        <div className="grid">
          {projects.data.data.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="card project-card">
              <strong>{p.name}</strong>
              <span className="muted small">
                {p.allowedOrigins.length > 0 ? p.allowedOrigins.join(", ") : "No origins yet"}
              </span>
            </Link>
          ))}
          <NewProjectCard />
        </div>
      )}
    </>
  );
}

function NewProjectCard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState("");
  const create = useMutation({
    mutationFn: api.createProject,
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: keys.projects });
      navigate(`/projects/${project.id}?tab=setup`);
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    create.mutate({ name, allowedOrigins: origin ? [origin] : [] });
  }

  return (
    <form className="card new-project" onSubmit={onSubmit}>
      <strong>Add a site</strong>
      <input
        placeholder="Name, e.g. My blog"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        placeholder="https://mysite.com"
        value={origin}
        onChange={(e) => setOrigin(e.target.value)}
      />
      <FieldErrors error={create.error} />
      <button type="submit" className="btn primary" disabled={create.isPending}>
        {create.isPending ? "Creating…" : "Create"}
      </button>
    </form>
  );
}
