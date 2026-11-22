import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PainelSimples } from "../PainelSimples";
import "../estilos.css";

// Entrada exclusiva do build público: só o painel simplificado. Nada de App/Central/admin.
createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <PainelSimples />
  </StrictMode>,
);
