import { exports } from "cloudflare:workers";

export const BASE = "http://flooper.test";
export const SITE = "https://my-site.example";

/** Send a request through the Worker's real fetch handler. */
export function request(path: string, init: RequestInit = {}): Promise<Response> {
  return exports.default.fetch(new Request(`${BASE}${path}`, init));
}

export function json(
  method: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return request(path, {
    method,
    headers: { "Content-Type": "application/json", Origin: BASE, ...headers },
    body: JSON.stringify(body),
  });
}

/** Log in as the dev user and return the session cookie header. */
export async function loginAsDev(): Promise<string> {
  const res = await request("/api/auth/dev-login", { method: "POST", headers: { Origin: BASE } });
  const cookie = res.headers.get("Set-Cookie");
  if (res.status !== 204 || !cookie) throw new Error(`dev login failed: ${res.status}`);
  return cookie.split(";")[0] as string;
}

/** Create a project through the API and return it. */
export async function createProject(cookie: string, allowedOrigins = [SITE]) {
  const res = await json(
    "POST",
    "/api/v1/projects",
    { name: "Test site", allowedOrigins },
    { Cookie: cookie },
  );
  if (res.status !== 201) throw new Error(`create project failed: ${res.status}`);
  return (await res.json()) as { id: string; publicKey: string };
}

export function submission(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: crypto.randomUUID(),
    reaction: "love",
    message: "cool site!",
    context: {
      url: `${SITE}/about`,
      path: "/about",
      viewport: { width: 1280, height: 800 },
      sdkVersion: "0.0.0",
    },
    ...overrides,
  };
}
