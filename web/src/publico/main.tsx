import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PainelBI } from "./bi/PainelBI";

// Entrada exclusiva do build público: painel BI aprovado. Nada de App/Central/admin.
createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <PainelBI />
  </StrictMode>,
);
