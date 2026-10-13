import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AccountProvider } from "./account";
import "./styles.css";

// Pede ao navegador para não apagar os dados locais (materiais e áudios) sob pressão de espaço.
void navigator.storage?.persist?.();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AccountProvider>
      <App />
    </AccountProvider>
  </StrictMode>,
);
