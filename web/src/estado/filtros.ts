import type { NivelMapa, Regionalizacao } from "../api/tipos";

export const ANO_MIN = 2013;
export const ANO_MAX = 2026;
export const FORA_DA_BAHIA = "fora_da_bahia";

export type Visao = "base" | "empresa";
export type Fonte = "validados" | "demonstracao";

export interface Filtros {
  anoIni: number;
  anoFim: number;
  empresa: string | null; // raiz do CNPJ
  macro: string | null; // id ou "fora_da_bahia"
  regiao: string | null;
  municipio: string | null; // código IBGE
  visao: Visao;
  fonte: Fonte;
  nivel: NivelMapa;
}

export const FILTROS_INICIAIS: Filtros = {
  anoIni: ANO_MIN,
  anoFim: ANO_MAX,
  empresa: null,
  macro: null,
  regiao: null,
  municipio: null,
  visao: "base",
  fonte: "validados",
  nivel: "macrorregioes",
};

export type Acao =
  | { tipo: "anos"; ini: number; fim: number }
  | { tipo: "ano_unico"; ano: number | null }
  | { tipo: "empresa"; raiz: string | null }
  | { tipo: "macro"; id: string | null }
  | { tipo: "regiao"; id: string | null; ref: Regionalizacao | null }
  | { tipo: "municipio"; cod: string | null; ref: Regionalizacao | null }
  | { tipo: "visao"; visao: Visao }
  | { tipo: "fonte"; fonte: Fonte }
  | { tipo: "nivel"; nivel: NivelMapa }
  | { tipo: "limpar" }
  | { tipo: "normalizar"; ref: Regionalizacao }
  | { tipo: "substituir"; filtros: Filtros };

function limitarAno(a: number) {
  return Math.min(ANO_MAX, Math.max(ANO_MIN, Math.round(a)));
}

/** Regras do Sprint 02.1: escolher um nível define os de cima; remover um nível remove os de baixo. */
export function reduzirFiltros(f: Filtros, a: Acao): Filtros {
  switch (a.tipo) {
    case "anos": {
      const ini = limitarAno(Math.min(a.ini, a.fim));
      const fim = limitarAno(Math.max(a.ini, a.fim));
      return { ...f, anoIni: ini, anoFim: fim };
    }
    case "ano_unico":
      return a.ano === null ? { ...f, anoIni: ANO_MIN, anoFim: ANO_MAX } : { ...f, anoIni: limitarAno(a.ano), anoFim: limitarAno(a.ano) };
    case "empresa":
      return { ...f, empresa: a.raiz };
    case "macro":
      if (a.id === null) return { ...f, macro: null, regiao: null, municipio: null, nivel: "macrorregioes" };
      if (a.id === f.macro) return f;
      return { ...f, macro: a.id, regiao: null, municipio: null };
    case "regiao": {
      if (a.id === null) return { ...f, regiao: null, municipio: null, nivel: f.nivel === "municipios" ? "regioes" : f.nivel };
      const reg = a.ref?.regioes.find((r) => r.id === a.id);
      return {
        ...f,
        macro: reg?.macro_id ?? f.macro,
        regiao: a.id,
        municipio: null,
        nivel: f.nivel === "macrorregioes" ? "regioes" : f.nivel,
      };
    }
    case "municipio": {
      if (a.cod === null) return { ...f, municipio: null };
      const ba = a.ref?.municipios.find((m) => m.cod_ibge === a.cod);
      if (ba) return { ...f, municipio: a.cod, regiao: ba.regiao_id ?? null, macro: ba.macro_id ?? null, nivel: "municipios" };
      const fora = a.ref?.fora_da_bahia.find((m) => m.cod_ibge === a.cod);
      if (fora) return { ...f, municipio: a.cod, regiao: null, macro: FORA_DA_BAHIA, nivel: "municipios" };
      return f;
    }
    case "visao":
      return { ...f, visao: a.visao };
    case "fonte":
      return { ...f, fonte: a.fonte };
    case "nivel":
      return { ...f, nivel: a.nivel };
    case "limpar":
      return { ...FILTROS_INICIAIS, visao: f.visao, fonte: f.fonte };
    case "substituir":
      return a.filtros;
    case "normalizar":
      return normalizarTerritorio(f, a.ref);
  }
}

/** Refaz o encadeamento a partir do nível mais baixo e descarta ids desconhecidos (URL editada à mão). */
export function normalizarTerritorio(f: Filtros, ref: Regionalizacao): Filtros {
  if (f.municipio) {
    const conhecido = ref.municipios.some((m) => m.cod_ibge === f.municipio) || ref.fora_da_bahia.some((m) => m.cod_ibge === f.municipio);
    if (conhecido) return reduzirFiltros({ ...f, municipio: null }, { tipo: "municipio", cod: f.municipio, ref });
    f = { ...f, municipio: null };
  }
  if (f.regiao) {
    const reg = ref.regioes.find((r) => r.id === f.regiao);
    if (reg) return { ...f, macro: reg.macro_id };
    f = { ...f, regiao: null };
  }
  if (f.macro && f.macro !== FORA_DA_BAHIA && !ref.macrorregioes.some((m) => m.id === f.macro)) f = { ...f, macro: null };
  if (f.macro === FORA_DA_BAHIA) f = { ...f, regiao: null };
  return f;
}

const PADRAO_ID = /^[a-z_-]{2,60}$/;

/** Lê os filtros da query string (valores fora do formato são ignorados). */
export function filtrosDaUrl(busca: string): Filtros {
  const p = new URLSearchParams(busca);
  const f = { ...FILTROS_INICIAIS };
  const ini = Number(p.get("ano_ini"));
  const fim = Number(p.get("ano_fim"));
  if (Number.isInteger(ini) && ini >= ANO_MIN && ini <= ANO_MAX) f.anoIni = ini;
  if (Number.isInteger(fim) && fim >= ANO_MIN && fim <= ANO_MAX) f.anoFim = fim;
  if (f.anoIni > f.anoFim) [f.anoIni, f.anoFim] = [f.anoFim, f.anoIni];
  const empresa = p.get("empresa");
  if (empresa && /^\d{8}$/.test(empresa)) f.empresa = empresa;
  const macro = p.get("macro");
  if (macro && PADRAO_ID.test(macro)) f.macro = macro;
  const regiao = p.get("regiao");
  if (regiao && PADRAO_ID.test(regiao)) f.regiao = regiao;
  const municipio = p.get("municipio");
  if (municipio && /^\d{7}$/.test(municipio)) f.municipio = municipio;
  if (p.get("visao") === "empresa") f.visao = "empresa";
  if (p.get("fonte") === "demonstracao") f.fonte = "demonstracao";
  const nivel = p.get("nivel");
  if (nivel === "regioes" || nivel === "municipios") f.nivel = nivel;
  return f;
}

export function filtrosParaUrl(f: Filtros): string {
  const p = new URLSearchParams();
  if (f.anoIni !== ANO_MIN) p.set("ano_ini", String(f.anoIni));
  if (f.anoFim !== ANO_MAX) p.set("ano_fim", String(f.anoFim));
  if (f.empresa) p.set("empresa", f.empresa);
  if (f.macro) p.set("macro", f.macro);
  if (f.regiao) p.set("regiao", f.regiao);
  if (f.municipio) p.set("municipio", f.municipio);
  if (f.visao !== "base") p.set("visao", f.visao);
  if (f.fonte !== "validados") p.set("fonte", f.fonte);
  if (f.nivel !== "macrorregioes") p.set("nivel", f.nivel);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Parâmetros de recorte cadastral aceitos pelas rotas /painel. */
export function parametrosCadastrais(f: Filtros) {
  return { macro: f.macro, regiao: f.regiao, municipio: f.municipio, empresa: f.empresa };
}

export function temRecorteTerritorial(f: Filtros) {
  return Boolean(f.macro || f.regiao || f.municipio);
}
