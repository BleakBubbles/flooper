import { QueryClientProvider } from "@tanstack/react-query";
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
import { CrashPage } from "./components/CrashPage";
import { Layout } from "./components/Layout";
import { LandingPage } from "./pages/LandingPage";
import { SitesPage } from "./pages/SitesPage";
import { createQueryClient } from "./queryClient";
import "./styles.css";

const queryClient = createQueryClient();

const router = createBrowserRouter([
  { index: true, element: <LandingPage />, errorElement: <CrashPage /> },
  {
    path: "app",
    element: <Layout />,
    errorElement: <CrashPage />,
    children: [
      { index: true, element: <SitesPage /> },
      // A site's setup and settings used to be pages of their own; they're
      // on home now. Keep old links (and ?note= links) working.
      { path: "projects/:projectId", element: <SiteMovedHome /> },
      { path: "projects/:projectId/settings", element: <SiteMovedHome settings /> },
    ],
  },
  // The app used to live at the root. Keep old bookmarks working.
  { path: "projects/*", element: <MovedToApp /> },
]);

function SiteMovedHome({ settings = false }: { settings?: boolean }) {
  const { projectId = "" } = useParams();
  const [params] = useSearchParams();
  const next = new URLSearchParams({ site: projectId });
  if (settings) next.set("view", "settings");
  const note = params.get("note");
  if (note) next.set("note", note);
  return <Navigate to={`/app?${next}`} replace />;
}

function MovedToApp() {
  const { pathname, search } = useLocation();
  return <Navigate to={`/app${pathname}${search}`} replace />;
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
