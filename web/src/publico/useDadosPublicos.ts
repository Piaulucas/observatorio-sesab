import { useMemo } from "react";
import { ErroApi, useRecurso, type Recurso } from "../api/cliente";
import { agregar, ErroFiltro, type DadosPublicos } from "./agregar";

export const ARQUIVO_DADOS = "/dados/observatorio.json";

/** Mesmo contrato de useRecurso, mas calcula a resposta no navegador a partir do JSON público. */
export function useDadosPublicos<T>(params: URLSearchParams): Recurso<T> & { recarregar: () => void } {
  const r = useRecurso<DadosPublicos>(ARQUIVO_DADOS, true);
  const chave = params.toString();
  return useMemo(() => {
    if (r.estado !== "ok") return r as unknown as Recurso<T> & { recarregar: () => void };
    if (r.dados.formato !== "observatorio-publico-v1") {
      return { estado: "erro", erro: new ErroApi(0, "Formato de dados público desconhecido."), recarregar: r.recarregar };
    }
    const p = new URLSearchParams(chave);
    const ano = (k: string, padrao: number) => {
      const n = Number(p.get(k) ?? padrao);
      return Number.isInteger(n) && n >= 2019 && n <= 2026 ? n : padrao;
    };
    const texto = (k: string, re: RegExp) => { const v = p.get(k); return v && re.test(v) ? v : undefined; };
    try {
      const dados = agregar(r.dados, {
        ano_inicial: ano("ano_inicial", 2019), ano_final: ano("ano_final", 2026),
        municipio: texto("municipio", /^\d{7}$/), regiao: texto("regiao", /^[\w-]{1,80}$/),
        empresa: texto("empresa", /^(?:\d{8}|\d{14})$/), macro: texto("macro", /^[\w-]{1,80}$/),
      });
      return { estado: "ok", dados: dados as unknown as T, recarregar: r.recarregar };
    } catch (e) {
      const msg = e instanceof ErroFiltro ? e.message : "Não foi possível calcular os indicadores.";
      return { estado: "erro", erro: new ErroApi(422, msg), recarregar: r.recarregar };
    }
  }, [r, chave]);
}
