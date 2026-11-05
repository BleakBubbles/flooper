import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { ApiRequestError } from "./api";
import { Layout } from "./components/Layout";
import { SettingsPage } from "./pages/SettingsPage";
import { SitePage } from "./pages/SitePage";
import { SitesPage } from "./pages/SitesPage";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't retry 4xx errors (e.g. 401 or 404): they won't fix themselves.
      retry: (count, error) =>
        !(error instanceof ApiRequestError && error.status < 500) && count < 2,
      staleTime: 10_000,
    },
  },
});

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <SitesPage /> },
      { path: "projects/:projectId", element: <SitePage /> },
      { path: "projects/:projectId/settings", element: <SettingsPage /> },
    ],
  },
]);

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
