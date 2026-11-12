import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router";
import { api, keys } from "./api";
import { CrashPage } from "./components/CrashPage";
import { Layout } from "./components/Layout";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { SitesPage } from "./pages/SitesPage";
import { createQueryClient } from "./queryClient";
import { hasSignedInHint } from "./signedIn";
import "./styles.css";

const queryClient = createQueryClient();

const router = createBrowserRouter([
  // flooper.app/ is the app once you're signed in, and the landing page before.
  {
    path: "/",
    element: <AppOrLanding />,
    errorElement: <CrashPage />,
    children: [{ index: true, element: <SitesPage /> }],
  },
  // The landing page stays reachable when you're signed in (signed out, it's /).
  { path: "about", element: <AboutRoute />, errorElement: <CrashPage /> },
  { path: "login", element: <LoginRoute />, errorElement: <CrashPage /> },

  // Old addresses. The app lived at /app (and before that at the root, with
  // pages of its own for each site's setup and settings). Keep every old link
  // working, including ?site= and ?note=.
  { path: "app", element: <MovedHome /> },
  { path: "app/projects/:projectId", element: <SiteMovedHome /> },
  { path: "app/projects/:projectId/settings", element: <SiteMovedHome settings /> },
  { path: "projects/:projectId", element: <SiteMovedHome /> },
  { path: "projects/:projectId/settings", element: <SiteMovedHome settings /> },
]);

/**
 * The app if this browser is signed in, the landing page if not. The cookie
 * hint answers at once (no flash of the wrong page); /me backs it up for
 * anyone signed in before the hint existed. A tab in review mode gets the
 * landing page either way: it's the page visitors leave notes on, at the
 * same address, so the overlay finds them.
 */
function AppOrLanding() {
  const reviewing = inReviewMode();
  const signedIn = hasSignedInHint();
  const me = useQuery({
    queryKey: keys.me,
    queryFn: api.me,
    enabled: !signedIn && !reviewing,
  });
  if (reviewing) return <LandingPage />;
  return signedIn || me.isSuccess ? <Layout /> : <LandingPage />;
}

/**
 * Whether this tab is reviewing Flooper's own site: opened from a review link
 * (#flooper-review=…), or since then, which the widget keeps in the tab's
 * sessionStorage under "flooper-review" until Exit (packages/sdk/src/index.ts,
 * startReview).
 */
function inReviewMode(): boolean {
  try {
    return (
      location.hash.includes("flooper-review=") || sessionStorage.getItem("flooper-review") !== null
    );
  } catch {
    return false;
  }
}

/**
 * The landing page for signed-in people, whose / is the app. Signed out, / is
 * the landing page, so /about sends you there: each person only ever sees the
 * page at one address.
 */
function AboutRoute() {
  const hinted = hasSignedInHint();
  const me = useQuery({ queryKey: keys.me, queryFn: api.me, enabled: !hinted });
  if (hinted || me.isSuccess) return <LandingPage />;
  if (me.isPending) return null;
  return <Navigate to="/" replace />;
}

/** The login page, or home if you're already signed in (or just signed in). */
function LoginRoute() {
  const me = useQuery({ queryKey: keys.me, queryFn: api.me });
  if (me.isSuccess) return <Navigate to="/" replace />;
  if (me.isPending) return null;
  return <LoginPage />;
}

function MovedHome() {
  const { search } = useLocation();
  return <Navigate to={`/${search}`} replace />;
}

function SiteMovedHome({ settings = false }: { settings?: boolean }) {
  const { projectId = "" } = useParams();
  const [params] = useSearchParams();
  const next = new URLSearchParams({ site: projectId });
  if (settings) next.set("view", "settings");
  const note = params.get("note");
  if (note) next.set("note", note);
  return <Navigate to={`/?${next}`} replace />;
}

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
