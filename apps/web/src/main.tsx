import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./styles.css";
import "./styles/interface-polish.css";

const chunkReloadKey = "patrol360:chunk-reload";

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();

  try {
    const lastReloadAt = Number(window.sessionStorage.getItem(chunkReloadKey) ?? "0");
    if (Date.now() - lastReloadAt < 30_000) {
      return;
    }

    window.sessionStorage.setItem(chunkReloadKey, String(Date.now()));
  } catch {
    // A disabled storage policy must not prevent recovery from a stale chunk.
  }

  window.location.reload();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
