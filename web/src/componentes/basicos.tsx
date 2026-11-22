import type { ReactNode } from "react";
import type { ErroApi } from "../api/cliente";

export function Cartao(props: {
  titulo?: ReactNode;
  sub?: ReactNode;
  dica?: string;
  selo?: ReactNode;
  classe?: string;
  pe?: ReactNode;
  children: ReactNode;
  idTitulo?: string;
}) {
  return (
    <div className={`cartao ${props.classe ?? ""}`}>
      {(props.titulo || props.dica || props.selo) && (
        <div className="cartao-cab">
          <div>
            {props.titulo && <h3 id={props.idTitulo}>{props.titulo}</h3>}
            {props.sub && <div className="sub">{props.sub}</div>}
          </div>
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            {props.selo}
            {props.dica && <Dica texto={props.dica} />}
          </span>
        </div>
      )}
      <div className="cartao-corpo">{props.children}</div>
      {props.pe && <div className="cartao-pe">{props.pe}</div>}
    </div>
  );
}

export function Dica({ texto }: { texto: string }) {
  return (
    <span className="dica" tabIndex={0} data-dica={texto} aria-label={texto} role="note">
      ?
    </span>
  );
}

export type Origem = "real" | "sim" | "vazio";
export function SeloOrigem({ origem, texto }: { origem: Origem; texto?: string }) {
  const padrao = { real: "REAL", sim: "SIMULAÇÃO", vazio: "SEM DADOS" }[origem];
  return <span className={`orig ${origem}`}>{texto ?? padrao}</span>;
}

export function Vazio({ titulo, children, acao }: { titulo: string; children?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="vazio" role="status">
      <strong>{titulo}</strong>
      {children}
      {acao && <div className="acao">{acao}</div>}
    </div>
  );
}

export function ErroCartao({ erro, onTentar }: { erro: ErroApi; onTentar?: () => void }) {
  return (
    <div className="vazio erro" role="alert">
      <strong>Não foi possível carregar{erro.status ? ` (erro ${erro.status})` : ""}</strong>
      {erro.detalhe}
      {onTentar && (
        <div className="acao">
          <button className="btn-sec" onClick={onTentar}>
            Tentar de novo
          </button>
        </div>
      )}
    </div>
  );
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <div className="carregando" role="status" aria-live="polite">
      {texto}
    </div>
  );
}

export function Badge({ classe, children, titulo }: { classe: string; children: ReactNode; titulo?: string }) {
  return (
    <span className={`badge ${classe}`} title={titulo}>
      {children}
    </span>
  );
}
