import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { CrashPage } from "./components/CrashPage";
import { Layout } from "./components/Layout";
import { SettingsPage } from "./pages/SettingsPage";
import { SitePage } from "./pages/SitePage";
import { SitesPage } from "./pages/SitesPage";
import { createQueryClient } from "./queryClient";
import "./styles.css";

const queryClient = createQueryClient();

const router = createBrowserRouter([
  {
    element: <Layout />,
    errorElement: <CrashPage />,
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
