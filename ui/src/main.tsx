import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { startPassportHandshakeWatch } from "./integration/passport";
import "./index.css";

// Embedded Passport posts its handshake unprompted as soon as the frame loads
// and stops re-broadcasting once anything answers, so the listener has to be
// running before React mounts — not when the user presses "connect".
startPassportHandshakeWatch(
  import.meta.env.VITE_PASSPORT_ORIGIN?.trim() || "https://midnightpassport.com",
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
