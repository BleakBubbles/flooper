import type { Project } from "@flooper/shared/schemas";
import { useState } from "react";

/**
 * A site's own favicon, loaded straight from its first public allowed address
 * (the visitor's browser asks the site itself, no third-party service). If
 * there's no such address, or no favicon there, it's a tile with the site's
 * first letter.
 */
export function SiteIcon({ site }: { site: Pick<Project, "name" | "allowedOrigins"> }) {
  const origin = site.allowedOrigins.find((o) => !isLocalAddress(o));
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

/**
 * Whether an address is on this machine or a private network: localhost,
 * loopback, link-local, .local names and the private IP ranges. A page on
 * flooper.app loading anything from those makes the browser ask "wants to
 * access other apps and services on this device", so their favicons are never
 * fetched. Anything unparsable counts as local, to be safe.
 */
export function isLocalAddress(origin: string): boolean {
  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return true;
  }
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;

  // IPv6 hosts come bracketed: [::1], [fe80::...], [fd12::...].
  if (host.startsWith("[")) {
    const ip = host.slice(1, -1);
    return ip === "::1" || ip === "::" || /^(fe[89ab]|f[cd])/.test(ip);
  }

  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false; // An ordinary name, like example.com.
  }
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 0 || // "this network"
    a === 10 ||
    a === 127 || // loopback
    (a === 169 && b === 254) || // link-local
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) // carrier-grade NAT, e.g. Tailscale
  );
}
