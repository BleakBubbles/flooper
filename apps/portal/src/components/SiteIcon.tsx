import type { Project } from "@flooper/shared/schemas";
import { useState } from "react";

/**
 * A site's own favicon, loaded straight from its first allowed address (the
 * visitor's browser asks the site itself, no third-party service). If there's
 * no address yet, or no favicon there, it's a tile with the site's first letter.
 */
export function SiteIcon({ site }: { site: Pick<Project, "name" | "allowedOrigins"> }) {
  const origin = site.allowedOrigins[0];
  // Remember a failure per address, so changing the address tries again.
  const [failedFor, setFailedFor] = useState<string | null>(null);

  if (!origin || failedFor === origin) {
    return (
      <span className="site-icon letter" aria-hidden="true">
        {site.name.trim()[0]?.toUpperCase() ?? "?"}
      </span>
    );
  }
  return (
    <img
      className="site-icon"
      src={`${origin}/favicon.ico`}
      alt=""
      width={18}
      height={18}
      onError={() => setFailedFor(origin)}
    />
  );
}
