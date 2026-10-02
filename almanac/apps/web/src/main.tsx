import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "./styles.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initToken } from "./data/api";
import { queryClient } from "./data/hooks";
import { stream } from "./data/stream";
import { App } from "./shell/App";

initToken();

// Test and debugging hook: lets end-to-end tests drive synthetic ticks.
(window as unknown as { __almanac: unknown }).__almanac = { stream, queryClient };

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
