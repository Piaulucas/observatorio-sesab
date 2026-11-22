import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapaGL, GeoJSONSource, MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { buscarReferencia, useRecurso } from "../api/cliente";
import type { FeatureCollection, NivelMapa, Territorios } from "../api/tipos";
import type { Filtros } from "../estado/filtros";
import {
  CAIXA_BAHIA,
  CLASSES,
  RAMPA,
  caixaDoRecorte,
  caminhoSvg,
  prepararFeicoes,
  prepararRotulos,
  projetor,
  type Malhas,
} from "./geo";
import { ErroCartao, Carregando } from "../componentes/basicos";

export const ESTILO_MAPA_BASE = "https://tiles.openfreemap.org/styles/positron";
export const ATRIBUICAO_DADOS = "Malha municipal: IBGE · Regionalização: SESAB, PDR 2026";
const LIMITE_MS = 10_000;

async function carregarMalhas(): Promise<Malhas> {
  const [macrorregioes, regioes, municipios, contorno] = await Promise.all(
    (["macrorregioes", "regioes", "municipios", "contorno"] as const).map((n) =>
      buscarReferencia<FeatureCollection>(`/painel/referencia/malha/${n}`),
    ),
  );
  return { macrorregioes, regioes, municipios, contorno };
}

export interface SelecaoMapa {
  nivel: NivelMapa;
  id: string;
  fora: boolean;
}

interface Props {
  pagamentos?: Record<string, number>;
  filtros: Filtros;
  contagens: Territorios | undefined;
  onSelecionar: (s: SelecaoMapa) => void;
  alto?: boolean;
  /** Gancho de teste: força o fallback SVG (também via ?falha_mapa=1). */
  forcarFalha?: boolean;
  somenteLocal?: boolean;
}

interface Dica {
  x: number;
  y: number;
  nome: string;
  n: number | null;
  fora: boolean;
}

function falhaPelaUrl() {
  try {
    return new URLSearchParams(window.location.search).get("falha_mapa") === "1";
  } catch {
    return false;
  }
}

export function MapaTerritorial({ filtros, contagens, onSelecionar, alto, forcarFalha, somenteLocal, pagamentos }: Props) {
  const [malhas, setMalhas] = useState<Malhas | null>(null);
  const [erroMalha, setErroMalha] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [modoSvg, setModoSvg] = useState<string | null>(somenteLocal ? "Malha local" : forcarFalha || falhaPelaUrl() ? "Teste de falha: mapa base desativado." : null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const [dica, setDica] = useState<Dica | null>(null);
  const contRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<MapaGL | null>(null);
  const selRef = useRef(onSelecionar);
  selRef.current = onSelecionar;
  const nivel = filtros.nivel;
  const nivelRef = useRef(nivel);
  nivelRef.current = nivel;
  const sel = useMemo(
    () => ({ macro: filtros.macro, regiao: filtros.regiao, municipio: filtros.municipio }),
    [filtros.macro, filtros.regiao, filtros.municipio],
  );

  useEffect(() => {
    let vivo = true;
    setErroMalha(null);
    carregarMalhas()
      .then((m) => vivo && setMalhas(m))
      .catch((e) => vivo && setErroMalha(e?.detalhe ?? "Malha territorial indisponível."));
    return () => {
      vivo = false;
    };
  }, [tentativa]);

  const feicoes = useMemo(() => {
    if (!malhas) return null;
    const fc = prepararFeicoes(malhas, nivel, contagens, sel);
    if (!pagamentos) return fc;
    return {...fc, features: fc.features.map(f => {
      const n = pagamentos[f.properties.fora ? 'fora_da_bahia' : String(f.properties.id)] ?? 0;
      const cor = n <= 0 ? '#ffffff' : RAMPA[n < 1e8 ? 0 : n < 1e9 ? 1 : n < 5e9 ? 2 : 3];
      return {...f, properties: {...f.properties, n, cor, tem: n > 0 ? 1 : 0}};
    })};
  }, [malhas, nivel, contagens, sel, pagamentos]);
  const rotulos = useMemo(() => {
    if (!feicoes) return null;
    const fc = prepararRotulos(feicoes, nivel);
    return !pagamentos ? fc : {...fc, features: fc.features.map(f => ({...f, properties: {...f.properties, texto: `R$ ${((Number(f.properties.n) || 0) / 1e8).toLocaleString('pt-BR', {maximumFractionDigits: 1})} mi`}}))};
  }, [feicoes, nivel, pagamentos]);

  // ---------- MapLibre: cria uma vez quando a malha chega ----------
  useEffect(() => {
    if (!malhas || modoSvg || !contRef.current) return;
    let cancelado = false;
    let mapa: MapaGL | null = null;
    let limite: ReturnType<typeof setTimeout> | undefined;
    let carregou = false;
    let errosTile = 0;
    import("maplibre-gl")
      .then((ml) => {
        if (cancelado || !contRef.current) return;
        try {
          mapa = new ml.Map({
            container: contRef.current,
            style: ESTILO_MAPA_BASE,
            bounds: CAIXA_BAHIA as [number, number, number, number],
            fitBoundsOptions: { padding: 16 },
            attributionControl: false,
            maxZoom: 11,
            minZoom: 4,
          });
        } catch {
          setModoSvg("O navegador não iniciou o mapa (WebGL indisponível).");
          return;
        }
        mapaRef.current = mapa;
        mapa.addControl(new ml.AttributionControl({ compact: false, customAttribution: ATRIBUICAO_DADOS }), "bottom-right");
        mapa.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        limite = setTimeout(() => {
          if (!carregou) setModoSvg("O mapa base demorou mais de 10 s para responder.");
        }, LIMITE_MS);
        mapa.on("error", (e) => {
          const msg = String((e as { error?: { message?: string } }).error?.message ?? "").slice(0, 80);
          if (!carregou) {
            setModoSvg(`O mapa base não carregou${msg ? ` (${msg})` : ""}.`);
            return;
          }
          errosTile += 1;
          if (errosTile === 3) setAviso("Parte do mapa base não carregou. Os polígonos do IBGE continuam válidos.");
        });
        mapa.on("load", () => {
          if (cancelado || !mapa) return;
          carregou = true;
          clearTimeout(limite);
          const vazio: FeatureCollection = { type: "FeatureCollection", features: [] };
          mapa.addSource("areas", { type: "geojson", data: vazio as never });
          mapa.addSource("rotulos", { type: "geojson", data: vazio as never });
          mapa.addSource("limreg", { type: "geojson", data: malhas.regioes as never });
          mapa.addSource("limmac", { type: "geojson", data: malhas.macrorregioes as never });
          mapa.addSource("uf", { type: "geojson", data: malhas.contorno as never });
          const opac = ["case", ["==", ["get", "dentro"], 0], 0.16, ["==", ["get", "tem"], 1], 0.84, 0.5];
          mapa.addLayer({ id: "areas-fill", type: "fill", source: "areas", paint: { "fill-color": ["get", "cor"], "fill-opacity": opac as never } });
          mapa.addLayer({ id: "areas-line", type: "line", source: "areas", filter: ["!=", ["get", "fora"], true], paint: { "line-color": "#9aa8b8", "line-width": 0.5, "line-opacity": 0.75 } });
          mapa.addLayer({ id: "limreg-line", type: "line", source: "limreg", paint: { "line-color": "#4a5d76", "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.7, 9, 1.4], "line-opacity": 0.9 } });
          mapa.addLayer({ id: "limmac-line", type: "line", source: "limmac", paint: { "line-color": "#0B2545", "line-width": 1.7, "line-opacity": 0.95 } });
          mapa.addLayer({ id: "uf-line", type: "line", source: "uf", paint: { "line-color": "#0B2545", "line-width": 1.6 } });
          mapa.addLayer({ id: "fora-line", type: "line", source: "areas", filter: ["==", ["get", "fora"], true], paint: { "line-color": "#B7791F", "line-width": 1.8, "line-dasharray": [2, 1.5] } });
          mapa.addLayer({ id: "sel-line", type: "line", source: "areas", filter: ["==", ["get", "sel"], 1], paint: { "line-color": "#0B2545", "line-width": 3.2 } });
          mapa.addLayer({ id: "pts-c", type: "circle", source: "rotulos", filter: ["==", ["get", "municipal"], 1], paint: { "circle-radius": 9, "circle-color": "#ffffff", "circle-stroke-color": "#0B2545", "circle-stroke-width": 1.2, "circle-opacity": 0.95 } });
          const corTexto = ["case", ["==", ["get", "fora"], 1], "#7a4f00", "#0B2545"];
          const opTexto = ["case", ["==", ["get", "dentro"], 0], 0.45, 1];
          mapa.addLayer({
            id: "rot-areas", type: "symbol", source: "rotulos", filter: ["!=", ["get", "municipal"], 1],
            layout: {
              "text-field": ["get", "texto"], "text-size": 11.5, "text-font": ["Noto Sans Bold"],
              "text-variable-anchor": ["center", "top", "bottom"], "text-radial-offset": 0.3,
              "symbol-sort-key": ["-", 0, ["get", "n"]],
            },
            paint: { "text-color": corTexto as never, "text-halo-color": "#ffffff", "text-halo-width": 1.4, "text-opacity": opTexto as never },
          });
          mapa.addLayer({
            id: "rot-mun", type: "symbol", source: "rotulos", filter: ["==", ["get", "municipal"], 1],
            layout: { "text-field": ["get", "texto"], "text-size": 11, "text-font": ["Noto Sans Bold"], "text-allow-overlap": true },
            paint: { "text-color": corTexto as never, "text-opacity": opTexto as never },
          });
          mapa.on("click", "areas-fill", (e: MapLayerMouseEvent) => {
            const p = e.features?.[0]?.properties as { id?: string; fora?: boolean | string } | undefined;
            if (!p?.id) return;
            const fora = p.fora === true || p.fora === "true";
            selRef.current({ nivel: fora ? "municipios" : nivelRef.current, id: String(p.id), fora });
          });
          mapa.on("mousemove", "areas-fill", (e: MapLayerMouseEvent) => {
            const p = e.features?.[0]?.properties as { nome?: string; n?: number; fora?: boolean | string } | undefined;
            if (!mapa) return;
            mapa.getCanvas().style.cursor = "pointer";
            if (p) setDica({ x: e.originalEvent.clientX, y: e.originalEvent.clientY, nome: String(p.nome ?? ""), n: p.n === null || p.n === undefined || (p.n as unknown) === "null" ? null : Number(p.n), fora: p.fora === true || p.fora === "true" });
          });
          mapa.on("mouseleave", "areas-fill", () => {
            if (mapa) mapa.getCanvas().style.cursor = "";
            setDica(null);
          });
          setPronto(true);
        });
      })
      .catch(() => setModoSvg("A biblioteca do mapa não carregou."));
    const obs = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => mapaRef.current?.resize()) : null;
    if (obs && contRef.current) obs.observe(contRef.current);
    return () => {
      cancelado = true;
      clearTimeout(limite);
      obs?.disconnect();
      mapa?.remove();
      mapaRef.current = null;
      setPronto(false);
    };
  }, [malhas, modoSvg]);

  // ---------- MapLibre: dados, nível e enquadramento ----------
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !pronto || !feicoes || !rotulos) return;
    (mapa.getSource("areas") as GeoJSONSource).setData(feicoes as never);
    const rot = { ...rotulos, features: rotulos.features.map((f) => ({ ...f, properties: { ...f.properties, municipal: nivel === "municipios" ? 1 : 0 } })) };
    (mapa.getSource("rotulos") as GeoJSONSource).setData(rot as never);
    mapa.setLayoutProperty("limreg-line", "visibility", nivel === "macrorregioes" ? "none" : "visible");
    mapa.setPaintProperty("limmac-line", "line-width", nivel === "macrorregioes" ? 1.7 : nivel === "regioes" ? 2 : 1.5);
  }, [pronto, feicoes, rotulos, nivel]);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !pronto || !malhas) return;
    const c = caixaDoRecorte(malhas, sel);
    mapa.fitBounds([[c[0], c[1]], [c[2], c[3]]], { padding: 30, duration: 600, maxZoom: sel.municipio ? 9 : 8 });
  }, [pronto, malhas, sel]);

  if (erroMalha) {
    return (
      <div className={`mapa-caixa${alto ? " alto" : ""}`} style={{ display: "grid", placeItems: "center", padding: 16 }}>
        <ErroCartao erro={{ status: 503, detalhe: erroMalha } as never} onTentar={() => setTentativa((t) => t + 1)} />
      </div>
    );
  }

  return (
    <div className={`mapa-caixa${alto ? " alto" : ""}`} data-modo={modoSvg ? "svg" : "maplibre"}>
      {!malhas && <div className="mapa-carregando"><Carregando texto="Carregando malha territorial…" /></div>}
      {malhas && !modoSvg && <div ref={contRef} className="mapa-gl" aria-label={pagamentos ? "Mapa interativo dos pagamentos associados às bases" : "Mapa interativo da distribuição das bases"} role="region" />}
      {malhas && !modoSvg && !pronto && <div className="mapa-carregando">Carregando mapa base…</div>}
      {malhas && modoSvg && feicoes && rotulos && (
        <MapaSvg malhas={malhas} feicoes={feicoes} rotulos={rotulos} nivel={nivel} sel={sel} onSelecionar={onSelecionar} onDica={setDica} financeiro={!!pagamentos} />
      )}
      {!somenteLocal && (modoSvg || aviso) && (
        <div className="mapa-aviso" role="status">
          {modoSvg ? <>{modoSvg} Exibindo a malha local do IBGE sem mapa de fundo; as contagens e a seleção continuam valendo.</> : aviso}
        </div>
      )}
      <Legenda nivel={nivel} financeiro={!!pagamentos} />
      {dica && (
        <div className="tt" style={{ left: dica.x + 14, top: dica.y + 14 }} role="tooltip">
          <b>{dica.fora ? `${dica.nome} (fora da Bahia)` : dica.nome}</b>
          <div>{dica.n === null ? "Contagem indisponível no momento" : pagamentos ? new Intl.NumberFormat("pt-BR", {style:"currency",currency:"BRL"}).format(dica.n / 100) : dica.n === 1 ? "1 base cadastrada" : `${dica.n} bases cadastradas`}</div>
          <div className="s">Pelo município cadastral; não é o local das remoções.</div>
        </div>
      )}
    </div>
  );
}

function Legenda({ nivel, financeiro = false }: { nivel: NivelMapa; financeiro?: boolean }) {
  const classes = financeiro ? [{rotulo:"< R$ 1 mi"},{rotulo:"1–10 mi"},{rotulo:"10–50 mi"},{rotulo:"50 mi+"}] : CLASSES[nivel];
  return (
    <div className="mapa-legenda" aria-label="Legenda do mapa">
      <b>{financeiro ? "Pagamentos associados às bases · período selecionado" : `Bases cadastradas por ${nivel === "macrorregioes" ? "macrorregião" : nivel === "regioes" ? "região de saúde" : "município"}`}</b>
      <div className="esc" aria-hidden="true">
        {RAMPA.map((c) => (
          <i key={c} style={{ background: c }} />
        ))}
      </div>
      <div className="esc-r">
        {classes.map((c) => (
          <span key={c.rotulo}>{c.rotulo}</span>
        ))}
      </div>
      <div className="itens">
        <div className="z-l"><i /> {financeiro ? "Sem pagamento no recorte" : "Sem bases"}</div>
        <div className="fora-l"><i /> Fora da Bahia</div>
        <div className="lim-l"><i /> Macrorregião</div>
        {nivel !== "macrorregioes" && <div className="lim-l"><i className="fino" /> Região de saúde</div>}
      </div>
      <div className="nota-c" style={{ marginTop: 4 }}>Município cadastral do CNPJ, não o local de operação.</div>
    </div>
  );
}

interface PropsSvg {
  financeiro?: boolean;
  malhas: Malhas;
  feicoes: FeatureCollection;
  rotulos: FeatureCollection;
  nivel: NivelMapa;
  sel: { macro: string | null; regiao: string | null; municipio: string | null };
  onSelecionar: (s: SelecaoMapa) => void;
  onDica: (d: Dica | null) => void;
}

/** Fallback sem mapa base: a mesma malha, as mesmas cores e os mesmos cliques. */
export function MapaSvg({ malhas, feicoes, rotulos, nivel, sel, onSelecionar, onDica, financeiro = false }: PropsSvg) {
  const L = 800, A = 640;
  const caixa = useMemo(() => {
    const c = caixaDoRecorte(malhas, sel);
    return c[2] - c[0] < 1.2 ? ([c[0] - 0.6, c[1] - 0.5, c[2] + 0.6, c[3] + 0.5] as typeof c) : c;
  }, [malhas, sel]);
  const proj = useMemo(() => projetor(caixa, L, A), [caixa]);
  return (
    <div className="mapa-svg">
      <svg viewBox={`0 0 ${L} ${A}`} role={financeiro ? "group" : "img"} aria-label="Malha territorial da Bahia (sem mapa de fundo)">
        {feicoes.features.map((f) => {
          const p = f.properties as { id: string; nome: string; n: number | null; cor: string; dentro: number; tem: number; fora: boolean; sel: number };
          return (
            <path
              key={`a-${p.id}`}
              className={`m${p.fora ? " fora" : ""}`}
              d={caminhoSvg(f, proj)}
              fill={p.cor}
              fillOpacity={p.dentro === 0 ? 0.16 : p.tem ? 0.84 : 0.5}
              data-id={p.id}
              role="button" tabIndex={0}
              aria-label={`${p.nome}: ${financeiro ? new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'}).format((p.n ?? 0)/100) : `${p.n ?? 0} bases`}`}
              onKeyDown={e => { if(e.key === 'Enter' || e.key === ' ') {e.preventDefault(); onSelecionar({nivel:p.fora?'municipios':nivel,id:p.id,fora:p.fora});} }}
              onClick={() => onSelecionar({ nivel: p.fora ? "municipios" : nivel, id: p.id, fora: p.fora })}
              onMouseMove={(e) => onDica({ x: e.clientX, y: e.clientY, nome: p.nome, n: p.n, fora: p.fora })}
              onMouseLeave={() => onDica(null)}
            />
          );
        })}
        {nivel !== "macrorregioes" &&
          malhas.regioes.features.map((f) => <path key={`r-${f.properties.id}`} className="lim-reg" d={caminhoSvg(f, proj)} />)}
        {malhas.macrorregioes.features.map((f) => (
          <path key={`m-${f.properties.id}`} className="lim-mac" d={caminhoSvg(f, proj)} />
        ))}
        {feicoes.features
          .filter((f) => (f.properties as { sel?: number }).sel === 1)
          .map((f) => <path key={`s-${f.properties.id}`} className="dest" d={caminhoSvg(f, proj)} />)}
        {rotulos.features.map((f) => {
          const c = (f.geometry as unknown as { coordinates: [number, number] }).coordinates;
          const [x, y] = proj(c[0], c[1]);
          const p = f.properties as { id: string; texto: string; n: number | null };
          if (nivel !== "municipios" && !p.n) return null;
          const linhas = String(p.texto).split("\n");
          return (
            <text key={`t-${p.id}`} x={x} y={y}>
              {nivel === "municipios" ? linhas[0] : linhas.length > 1 ? linhas[1] : linhas[0]}
            </text>
          );
        })}
      </svg>
      <div className="maplibregl-ctrl-attrib" style={{ position: "absolute", right: 6, bottom: 4, fontSize: 11, color: "#5B6B7F", background: "rgba(255,255,255,.85)", padding: "1px 6px", borderRadius: 4 }}>
        {ATRIBUICAO_DADOS}
      </div>
    </div>
  );
}

/** Contagens por área no nível atual (respeita o filtro de empresa). */
export function useContagens(nivel: NivelMapa, empresa: string | null) {
  return useRecurso<Territorios>(`/painel/territorios?nivel=${nivel}${empresa ? `&empresa=${empresa}` : ""}`);
}
