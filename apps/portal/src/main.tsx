import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider, useLocation } from "react-router";
import { CrashPage } from "./components/CrashPage";
import { Layout } from "./components/Layout";
import { LandingPage } from "./pages/LandingPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SitePage } from "./pages/SitePage";
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
      { path: "projects/:projectId", element: <SitePage /> },
      { path: "projects/:projectId/settings", element: <SettingsPage /> },
    ],
  },
  // The app used to live at the root. Keep old bookmarks working.
  { path: "projects/*", element: <MovedToApp /> },
]);

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
