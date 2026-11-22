import { useCallback, useEffect, useRef, useState } from "react";

export const BASE_API = "/api";
/** Build público estático (Cloudflare Pages): sem API; malhas e dados vêm de /dados/. */
export const MODO_PUBLICO = import.meta.env.VITE_PUBLICO === "1";

function resolver(caminho: string): string {
  if (!MODO_PUBLICO) return BASE_API + caminho;
  const malha = /^\/painel\/referencia\/malha\/([a-z]+)$/.exec(caminho);
  if (malha) return `/dados/malha_${malha[1]}.geojson`;
  if (caminho.startsWith("/dados/")) return caminho;
  throw new ErroApi(404, "Recurso indisponível na versão pública.");
}

export class ErroApi extends Error {
  constructor(public status: number, public detalhe: string) {
    super(detalhe);
  }
}

function mensagemErro(status: number, corpo: unknown): string {
  if (corpo && typeof corpo === "object" && "detail" in corpo) {
    const d = (corpo as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return "Parâmetro fora do formato esperado.";
  }
  if (status === 503) return "Banco de dados indisponível.";
  if (status === 0) return "Sem resposta da API (servidor desligado ou rede indisponível).";
  return `Erro ${status} na API.`;
}

export async function buscarJson<T>(caminho: string, sinal?: AbortSignal): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(resolver(caminho), { signal: sinal, headers: { Accept: "application/json" } });
  } catch (erro) {
    if ((erro as Error).name === "AbortError") throw erro;
    throw new ErroApi(0, mensagemErro(0, null));
  }
  let corpo: unknown = null;
  try {
    corpo = await resposta.json();
  } catch {
    corpo = null;
  }
  if (!resposta.ok) throw new ErroApi(resposta.status, mensagemErro(resposta.status, corpo));
  return corpo as T;
}

/** Monta a query string sem parâmetros vazios. */
export function consulta(parametros: Record<string, string | number | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(parametros)) {
    if (v !== null && v !== undefined && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

// Cache simples para referências estáticas (malhas, regionalização, cobertura).
const cache = new Map<string, Promise<unknown>>();
export function buscarReferencia<T>(caminho: string): Promise<T> {
  if (!cache.has(caminho)) {
    const p = buscarJson<T>(caminho).catch((e) => {
      cache.delete(caminho);
      throw e;
    });
    cache.set(caminho, p);
  }
  return cache.get(caminho) as Promise<T>;
}
export function limparCacheReferencia() {
  cache.clear();
}

export type Recurso<T> =
  | { estado: "carregando"; dados?: T; erro?: undefined }
  | { estado: "ok"; dados: T; erro?: undefined }
  | { estado: "erro"; dados?: T; erro: ErroApi };

/** Carrega `caminho` (null = não carregar). Cancela a requisição anterior ao mudar. */
export function useRecurso<T>(caminho: string | null, referencia = false): Recurso<T> & { recarregar: () => void } {
  const [r, setR] = useState<Recurso<T>>({ estado: "carregando" });
  const [versao, setVersao] = useState(0);
  const ultimo = useRef<T | undefined>(undefined);

  useEffect(() => {
    if (caminho === null) {
      // Sem recurso pedido: não manter dados de um pedido anterior (ex.: áreas de outro recorte).
      ultimo.current = undefined;
      setR({ estado: "carregando" });
      return;
    }
    const controle = new AbortController();
    setR({ estado: "carregando", dados: ultimo.current });
    const promessa = referencia ? buscarReferencia<T>(caminho) : buscarJson<T>(caminho, controle.signal);
    promessa
      .then((dados) => {
        if (controle.signal.aborted) return;
        ultimo.current = dados;
        setR({ estado: "ok", dados });
      })
      .catch((erro) => {
        if (controle.signal.aborted || (erro as Error).name === "AbortError") return;
        setR({ estado: "erro", erro: erro instanceof ErroApi ? erro : new ErroApi(0, String(erro)) });
      });
    return () => controle.abort();
  }, [caminho, referencia, versao]);

  const recarregar = useCallback(() => {
    if (referencia && caminho) cache.delete(caminho);
    setVersao((v) => v + 1);
  }, [caminho, referencia]);
  return { ...r, recarregar };
}
