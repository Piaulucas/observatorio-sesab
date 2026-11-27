import { useMemo, useState } from "react";
import type { FeatureCollection } from "../../api/tipos";
import type { BasePublica } from "../agregar";
import { caminhoSvg, projetor, caixaDe } from "../../mapa/geo";
import { porCidade, type FiltrosBI } from "./modelo";
export function MapaBI({
  municipios,
  macros,
  bases,
  filtros,
  selecionar,
  voltar,
}: {
  municipios: FeatureCollection;
  macros: FeatureCollection;
  bases: BasePublica[];
  filtros: FiltrosBI;
  selecionar: (id: string) => void;
  voltar: () => void;
}) {
  const [dica, setDica] = useState<string | null>(null);
  const mapa = useMemo(() => {
    const caixa = caixaDe(municipios.features);
    if (!caixa) return null;
    const altura =
      (600 * (caixa[3] - caixa[1])) /
      ((caixa[2] - caixa[0]) *
        Math.cos((((caixa[1] + caixa[3]) / 2) * Math.PI) / 180));
    const proj = projetor(caixa, 600, altura, 20);
    return {
      altura,
      proj,
      cidades: municipios.features.map((f) => ({ f, d: caminhoSvg(f, proj) })),
      macros: macros.features.map((f) => ({ f, d: caminhoSvg(f, proj) })),
    };
  }, [municipios, macros]);
  if (!mapa)
    return (
      <p className="vazio" role="status">
        Mapa indisponível: malha territorial sem geometria.
      </p>
    );
  const grupos = porCidade(bases),
    ids = new Set(grupos.map((g) => g.id));
  const rotulos: { x: number; y: number; w: number }[] = [];
  return (
    <div className="mapa-caixa" onClick={voltar}>
      <svg
        className="mapa"
        viewBox={`-12 -12 624 ${mapa.altura + 24}`}
        aria-label="Mapa da Bahia com bases credenciadas por município"
      >
        {mapa.cidades.map(({ f, d }) => (
          <path
            key={String(f.properties.id)}
            d={d}
            className={`m ${ids.has(String(f.properties.id)) ? "tem" : ""} ${filtros.macro && f.properties.macro_id !== filtros.macro ? "apagado" : ""} ${filtros.cidade === f.properties.id ? "sel" : ""}`}
          >
            <title>{String(f.properties.nome)}</title>
          </path>
        ))}
        {mapa.macros.map(({ f, d }) => (
          <path
            key={String(f.properties.id)}
            d={d}
            className={`macro-borda ${filtros.macro === f.properties.id ? "sel" : ""}`}
          />
        ))}
        {grupos
          .slice()
          .reverse()
          .map((g) => {
            const f = municipios.features.find((f) => f.properties.id === g.id);
            if (!f?.properties.lbl) return null;
            const [x, y] = mapa.proj(...f.properties.lbl),
              n = g.bases.length;
            return (
              <g
                key={g.id}
                className={`bolha ${filtros.cidade === g.id ? "sel" : ""}`}
                role="button"
                tabIndex={0}
                aria-label={`${g.nome}: ${n} ${n === 1 ? "base" : "bases"}`}
                aria-pressed={filtros.cidade === g.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setDica(null);
                  selecionar(g.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selecionar(g.id);
                  }
                }}
                onMouseEnter={() => setDica(g.id)}
                onMouseLeave={() => setDica(null)}
                onFocus={() => setDica(g.id)}
                onBlur={() => setDica(null)}
              >
                <circle cx={x} cy={y} r={7 + Math.sqrt(n) * 5.5} />
                {n > 1 && (
                  <text x={x} y={y} dy=".35em">
                    {n}
                  </text>
                )}
                <title>
                  {g.nome} · {n} {n === 1 ? "base" : "bases"}
                </title>
              </g>
            );
          })}
        {grupos.map((g) => {
          const f = municipios.features.find((f) => f.properties.id === g.id);
          if (!f?.properties.lbl) return null;
          const [x, y] = mapa.proj(...f.properties.lbl),
            lx = x + 11 + Math.sqrt(g.bases.length) * 5.5,
            w = g.nome.length * 7;
          if (
            !(
              g.bases.length >= 2 ||
              filtros.cidade === g.id ||
              filtros.empresa
            ) ||
            lx + w > 608 ||
            rotulos.some(
              (r) => Math.abs(r.y - y) < 15 && lx < r.x + r.w && r.x < lx + w,
            )
          )
            return null;
          rotulos.push({ x: lx, y, w });
          return (
            <text key={g.id} className="rot" x={lx} y={y} dy=".35em">
              {g.nome}
            </text>
          );
        })}
      </svg>
      {dica && grupos.some((g) => g.id === dica) && (
        <div className="dica-mapa" role="tooltip">
          {grupos.find((g) => g.id === dica)!.nome} ·{" "}
          {grupos.find((g) => g.id === dica)!.bases.length}{" "}
          {grupos.find((g) => g.id === dica)!.bases.length === 1
            ? "base"
            : "bases"}
        </div>
      )}
      {!bases.length && (
        <p className="vazio sobre">
          Nenhuma base neste recorte. Limpe um filtro.
        </p>
      )}
    </div>
  );
}
