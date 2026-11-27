import type { BasePublica, DadosPublicos } from "../agregar";
export interface FiltrosBI {
  ano: number | null;
  macro: string | null;
  empresa: string | null;
  cidade: string | null;
}
export const INICIAL: FiltrosBI = {
  ano: null,
  macro: null,
  empresa: null,
  cidade: null,
};
export const raiz = (cnpj: string) => cnpj.slice(0, 8);
export const nomeCurto = (nome: string) =>
  nome
    .replace(/\s*-\s*(me|epp)$/i, "")
    .replace(/\s+(ltda|eireli|s\/s|s\/a|s\.a\.|me|epp)\.?$/i, "")
    .replace(/\s+(ltda|eireli|s\/s)\.?$/i, "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) =>
      ["uti", "sos"].includes(w)
        ? w.toUpperCase()
        : i && ["de", "da", "do", "das", "dos", "e", "em"].includes(w)
          ? w
          : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(" ")
    .replace(/,(\S)/g, ", $1");
/** Nome fantasia revisado; sem ele, a razão social encurtada. */
export const nomeBase = (b: { nome: string; nome_exibicao?: string }) =>
  b.nome_exibicao || nomeCurto(b.nome);
export const moeda = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const moedaCurta = (c: number) =>
  c >= 1e8
    ? `R$ ${(c / 1e8).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`
    : c >= 1e5
      ? `R$ ${(c / 1e5).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`
      : moeda(c);
export const cnpjFormatado = (c: string) =>
  c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
export function pagamentoBase(
  d: DadosPublicos,
  cnpj: string,
  ano: number | null,
) {
  return d.pagamentos
    .filter((p) => p.cnpj === cnpj && (!ano || p.ano === ano))
    .reduce((r, p) => ({ centavos: r.centavos + p.centavos, n: r.n + p.n }), {
      centavos: 0,
      n: 0,
    });
}
/** Única seleção para mapa, números, lista e detalhes: recebimento por CNPJ completo. */
export function basesDoRecorte(d: DadosPublicos, f: FiltrosBI) {
  const pagas = f.ano
    ? new Set(d.pagamentos.filter((p) => p.ano === f.ano).map((p) => p.cnpj))
    : null;
  return d.bases.filter(
    (b) =>
      (!pagas || pagas.has(b.cnpj)) &&
      (!f.macro ||
        b.territorio.macro_id === f.macro ||
        (f.macro === "fora_da_bahia" &&
          b.territorio.situacao_geografica === "fora_da_bahia")) &&
      (!f.cidade ||
        (b.territorio.cod_ibge || "sem-localizacao") === f.cidade) &&
      (!f.empresa || raiz(b.cnpj) === f.empresa),
  );
}
export function porCidade(bases: BasePublica[]) {
  const grupos = new Map<string, BasePublica[]>();
  for (const b of bases) {
    const k = b.territorio.cod_ibge || "sem-localizacao";
    grupos.set(k, [...(grupos.get(k) || []), b]);
  }
  return [...grupos]
    .map(([id, bases]) => ({
      id,
      nome:
        bases[0].territorio.municipio_ibge ||
        bases[0].municipio ||
        "Localização não informada",
      uf: bases[0].territorio.uf,
      macro:
        bases[0].territorio.macro ||
        (bases[0].territorio.situacao_geografica === "fora_da_bahia"
          ? "Fora da Bahia"
          : "Localização não informada"),
      bases,
    }))
    .sort(
      (a, b) => b.bases.length - a.bases.length || a.nome.localeCompare(b.nome),
    );
}
export function ranking(d: DadosPublicos, f: FiltrosBI) {
  const nomes = new Map(
    ((d.opcoes.empresas as { cnpj: string; nome: string }[]) || []).map((e) => [
      e.cnpj,
      e.nome,
    ]),
  );
  const grupos = new Map<
    string,
    { raiz: string; nome: string; bases: number; centavos: number; n: number }
  >();
  for (const b of basesDoRecorte(d, { ...f, empresa: null })) {
    const k = raiz(b.cnpj),
      p = pagamentoBase(d, b.cnpj, f.ano);
    const r = grupos.get(k) || {
      raiz: k,
      nome: b.nome_exibicao || nomeCurto(nomes.get(k) || b.nome),
      bases: 0,
      centavos: 0,
      n: 0,
    };
    r.bases++;
    r.centavos += p.centavos;
    r.n += p.n;
    grupos.set(k, r);
  }
  return [...grupos.values()].sort(
    (a, b) =>
      b.centavos - a.centavos ||
      b.bases - a.bases ||
      a.nome.localeCompare(b.nome),
  );
}
export function numeros(d: DadosPublicos, f: FiltrosBI) {
  const bs = basesDoRecorte(d, f);
  return {
    bases: bs.length,
    municipios: new Set(bs.map((b) => b.territorio.cod_ibge).filter(Boolean))
      .size,
    empresas: new Set(bs.map((b) => raiz(b.cnpj))).size,
    ...bs.reduce(
      (r, b) => {
        const p = pagamentoBase(d, b.cnpj, f.ano);
        return { centavos: r.centavos + p.centavos, n: r.n + p.n };
      },
      { centavos: 0, n: 0 },
    ),
  };
}
