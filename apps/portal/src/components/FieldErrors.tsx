import { ApiRequestError } from "../api";

/** Shows an API error, including per-field validation messages when present. */
export function FieldErrors({ error }: { error: Error | null }) {
  if (!error) return null;
  const details = error instanceof ApiRequestError ? error.details : undefined;
  return (
    <div className="error small">
      {details
        ? Object.entries(details).map(([field, messages]) => (
            <div key={field}>
              {field}: {messages.join(", ")}
            </div>
          ))
        : error.message}
    </div>
  );
}
