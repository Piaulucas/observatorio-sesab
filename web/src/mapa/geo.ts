import type { Feature, FeatureCollection, NivelMapa, Territorios } from "../api/tipos";
import { FORA_DA_BAHIA, type Filtros } from "../estado/filtros";

/** Rampa azul sequencial do Sprint 02 (quantidade de bases). */
export const RAMPA = ["#cde2fb", "#86b6ef", "#2a78d6", "#1c5cab"];
export const COR_SEM_BASE = "#ffffff";
export const COR_FORA = "#B7791F";
/** Contagem indisponível (erro ou carregando): cinza neutro, nunca o branco de "sem bases". */
export const COR_INDISPONIVEL = "#d5dbe3";

/** Classes por nível (Sprint 02.1): limite inferior de cada classe. */
export const CLASSES: Record<NivelMapa, { min: number; rotulo: string }[]> = {
  macrorregioes: [
    { min: 1, rotulo: "1–2" },
    { min: 3, rotulo: "3–5" },
    { min: 6, rotulo: "6–9" },
    { min: 10, rotulo: "10+" },
  ],
  regioes: [
    { min: 1, rotulo: "1" },
    { min: 2, rotulo: "2–3" },
    { min: 4, rotulo: "4–6" },
    { min: 7, rotulo: "7+" },
  ],
  municipios: [
    { min: 1, rotulo: "1" },
    { min: 2, rotulo: "2" },
    { min: 3, rotulo: "3" },
    { min: 4, rotulo: "4+" },
  ],
};

export function corPara(nivel: NivelMapa, n: number): string {
  if (n <= 0) return COR_SEM_BASE;
  const classes = CLASSES[nivel];
  let i = 0;
  for (let k = 0; k < classes.length; k++) if (n >= classes[k].min) i = k;
  return RAMPA[i];
}

export interface Malhas {
  macrorregioes: FeatureCollection;
  regioes: FeatureCollection;
  municipios: FeatureCollection;
  contorno: FeatureCollection;
}

type Sel = Pick<Filtros, "macro" | "regiao" | "municipio">;

/** A área pertence ao recorte selecionado? (o que fica fora é esmaecido) */
export function dentroDoRecorte(nivel: NivelMapa, p: Feature["properties"], sel: Sel): boolean {
  const fora = p.fora === true;
  if (!sel.macro && !sel.regiao && !sel.municipio) return true;
  if (sel.macro === FORA_DA_BAHIA) return fora;
  if (fora) return false;
  if (nivel === "macrorregioes") return !sel.macro || p.id === sel.macro;
  if (nivel === "regioes") {
    if (sel.regiao) return p.id === sel.regiao;
    return !sel.macro || p.macro_id === sel.macro;
  }
  if (sel.municipio) return p.id === sel.municipio;
  if (sel.regiao) return p.regiao_id === sel.regiao;
  return !sel.macro || p.macro_id === sel.macro;
}

export function selecionada(nivel: NivelMapa, p: Feature["properties"], sel: Sel): boolean {
  if (nivel === "macrorregioes") return Boolean(sel.macro) && p.id === sel.macro;
  if (nivel === "regioes") return Boolean(sel.regiao) && p.id === sel.regiao;
  return Boolean(sel.municipio) && p.id === sel.municipio;
}

export function colecaoDoNivel(m: Malhas, nivel: NivelMapa): FeatureCollection {
  return nivel === "macrorregioes" ? m.macrorregioes : nivel === "regioes" ? m.regioes : m.municipios;
}

/** Feições do nível com cor, contagem e estado de seleção; inclui Petrolina (fora da BA) em todos os níveis. */
export function prepararFeicoes(m: Malhas, nivel: NivelMapa, cont: Territorios | undefined, sel: Sel): FeatureCollection {
  // Contagem ausente ou de outro nível (troca de nível em andamento) não pode virar "0 bases".
  const conhecida = cont !== undefined && cont.nivel === nivel;
  const porId = new Map<string, number>();
  if (conhecida) for (const a of cont.areas) porId.set(a.id, a.bases);
  const nFora = conhecida ? cont.fora_da_bahia.bases : null;
  const base = colecaoDoNivel(m, nivel).features.filter((f) => f.properties.fora !== true);
  const fora = m.municipios.features.filter((f) => f.properties.fora === true);
  const feicoes = [...base, ...fora].map((f) => {
    const ehFora = f.properties.fora === true;
    const n: number | null = !conhecida ? null : ehFora ? nFora : porId.get(String(f.properties.id)) ?? 0;
    const props = { ...f.properties, fora: ehFora };
    return {
      ...f,
      properties: {
        ...props,
        n,
        cor: n === null ? COR_INDISPONIVEL : ehFora ? (n > 0 ? COR_FORA : COR_SEM_BASE) : corPara(nivel, n),
        tem: n !== null && n > 0 ? 1 : 0,
        dentro: dentroDoRecorte(nivel, props, sel) ? 1 : 0,
        sel: !ehFora && selecionada(nivel, props, sel) ? 1 : sel.macro === FORA_DA_BAHIA && ehFora ? 1 : 0,
      },
    } as Feature;
  });
  return { type: "FeatureCollection", features: feicoes };
}

/** Pontos de rótulo: nome + contagem (macro/região) ou só a contagem (municípios com base). */
export function prepararRotulos(fc: FeatureCollection, nivel: NivelMapa): FeatureCollection {
  const feats: Feature[] = [];
  for (const f of fc.features) {
    const p = f.properties as Feature["properties"] & { n: number | null; fora: boolean };
    if (!p.lbl) continue;
    if (nivel === "municipios" && (p.n === null || p.n <= 0)) continue;
    const texto = nivel === "municipios" ? String(p.n) : p.fora ? `Fora da Bahia${p.n ? ` · ${p.n}` : ""}` : `${p.nome}${p.n ? `\n${p.n}` : ""}`;
    feats.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: p.lbl } as unknown as Feature["geometry"],
      properties: { id: p.id, texto, n: p.n, fora: p.fora ? 1 : 0, dentro: (p as { dentro?: number }).dentro ?? 1 },
    });
  }
  return { type: "FeatureCollection", features: feats };
}

export type Caixa = [number, number, number, number];

export function caixaDe(feats: Feature[]): Caixa | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of feats) {
    const b = f.properties.bbox;
    if (!b) continue;
    x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]);
  }
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : null;
}

export const CAIXA_BAHIA: Caixa = [-46.8, -18.4, -37.2, -8.4];

/** Caixa do recorte selecionado (para aproximar o mapa). */
export function caixaDoRecorte(m: Malhas, sel: Sel): Caixa {
  if (sel.macro === FORA_DA_BAHIA) {
    const c = caixaDe(m.municipios.features.filter((f) => f.properties.fora === true));
    if (c) return [c[0] - 0.6, c[1] - 0.6, c[2] + 0.6, c[3] + 0.6];
  }
  if (sel.municipio) {
    const c = caixaDe(m.municipios.features.filter((f) => f.properties.id === sel.municipio));
    if (c) return c;
  }
  if (sel.regiao) {
    const c = caixaDe(m.regioes.features.filter((f) => f.properties.id === sel.regiao));
    if (c) return c;
  }
  if (sel.macro) {
    const c = caixaDe(m.macrorregioes.features.filter((f) => f.properties.id === sel.macro));
    if (c) return c;
  }
  return CAIXA_BAHIA;
}

// ---------- Projeção simples para o SVG de fallback (equirretangular corrigida pela latitude) ----------

export function projetor(caixa: Caixa, largura: number, altura: number, margem = 10) {
  const latMedia = ((caixa[1] + caixa[3]) / 2) * (Math.PI / 180);
  const k = Math.cos(latMedia);
  const w = (caixa[2] - caixa[0]) * k;
  const h = caixa[3] - caixa[1];
  const escala = Math.min((largura - 2 * margem) / w, (altura - 2 * margem) / h);
  const dx = (largura - w * escala) / 2;
  const dy = (altura - h * escala) / 2;
  return (lon: number, lat: number): [number, number] => [
    dx + (lon - caixa[0]) * k * escala,
    dy + (caixa[3] - lat) * escala,
  ];
}

export function caminhoSvg(f: Feature, proj: (lon: number, lat: number) => [number, number]): string {
  const g = f.geometry;
  const poligonos = (g.type === "MultiPolygon" ? g.coordinates : [g.coordinates]) as number[][][][];
  let d = "";
  for (const pol of poligonos) {
    for (const anel of pol) {
      anel.forEach((p, i) => {
        const [x, y] = proj(p[0], p[1]);
        d += `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
      });
      d += "Z";
    }
  }
  return d;
}
