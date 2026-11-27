import { useEffect, useMemo, useRef, useState } from "react";
import { Simbolos } from "../../componentes/Simbolos";
import type { FeatureCollection } from "../../api/tipos";
import type { BasePublica, DadosPublicos } from "../agregar";
import { MapaBI } from "./MapaBI";
import {
  INICIAL,
  basesDoRecorte,
  cnpjFormatado,
  moeda,
  moedaCurta,
  nomeBase,
  numeros,
  pagamentoBase,
  porCidade,
  raiz,
  ranking,
  type FiltrosBI,
} from "./modelo";
import "./painel-bi.css";
interface Recursos {
  dados: DadosPublicos;
  municipios: FeatureCollection;
  macros: FeatureCollection;
}
export function PainelBI() {
  const [recurso, setRecurso] = useState<Recursos | null>(null),
    [erro, setErro] = useState(false),
    [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    const controle = new AbortController();
    setErro(false);
    Promise.all(
      [
        "observatorio.json",
        "malha_municipios.geojson",
        "malha_macrorregioes.geojson",
      ].map(async (nome) => {
        const r = await fetch(`/dados/${nome}`, { signal: controle.signal });
        if (!r.ok) throw new Error("Falha ao carregar");
        return r.json();
      }),
    )
      .then(([dados, municipios, macros]) => {
        if (
          dados.formato !== "observatorio-publico-v1" ||
          !Array.isArray(dados.bases) ||
          !Array.isArray(dados.pagamentos) ||
          !dados.cobertura ||
          typeof dados.cobertura.inicio !== "string" ||
          typeof dados.cobertura.fim !== "string" ||
          [municipios, macros].some(
            (m) =>
              m?.type !== "FeatureCollection" ||
              !Array.isArray(m.features) ||
              !m.features.length ||
              m.features.some(
                (f: {
                  properties?: { bbox?: number[] };
                  geometry?: { type: string; coordinates?: unknown[] };
                }) =>
                  !f.properties?.bbox ||
                  f.properties.bbox.length !== 4 ||
                  !f.properties.bbox.every(Number.isFinite) ||
                  !f.geometry ||
                  !["Polygon", "MultiPolygon"].includes(f.geometry.type) ||
                  !Array.isArray(f.geometry.coordinates),
              ),
          )
        )
          throw new Error("Formato desconhecido");
        if (!controle.signal.aborted) setRecurso({ dados, municipios, macros });
      })
      .catch(() => {
        if (!controle.signal.aborted) setErro(true);
      });
    return () => controle.abort();
  }, [tentativa]);
  if (erro)
    return (
      <main className="estado">
        <h1>Não foi possível carregar o painel</h1>
        <p>Verifique a conexão e tente novamente.</p>
        <button onClick={() => setTentativa((t) => t + 1)}>
          Tentar novamente
        </button>
      </main>
    );
  if (!recurso)
    return (
      <main className="estado" role="status">
        Carregando dados e mapa…
      </main>
    );
  return <PainelCarregado {...recurso} />;
}
export function PainelCarregado({ dados, municipios, macros }: Recursos) {
  const detalheAberto = useRef<HTMLLIElement | null>(null);
  const [f, setF] = useState<FiltrosBI>(INICIAL),
    [modo, setModo] = useState<"ranking" | "lista">("ranking"),
    [todas, setTodas] = useState(false);
  const anos = useMemo(
    () => [...new Set(dados.pagamentos.map((p) => p.ano))].sort(),
    [dados],
  );
  const periodoCompleto = anos.length
    ? `${anos[0]}–${anos.at(-1)}`
    : "Sem pagamentos no recorte";
  const periodo = f.ano ? String(f.ano) : periodoCompleto;
  const opcoesEmpresas = ranking(dados, { ...f, empresa: null });
  const bases = basesDoRecorte(dados, f),
    ns = numeros(dados, f),
    cidades = porCidade(bases);
  const empresas = ranking(dados, f),
    selecionada = opcoesEmpresas.find((e) => e.raiz === f.empresa);
  useEffect(() => {
    detalheAberto.current?.scrollIntoView?.({ block: "nearest" });
  }, [f.empresa, f.ano, f.macro, f.cidade]);
  const voltar = () => {
    setF((a) => ({ ...a, empresa: null, cidade: null }));
    setModo("ranking");
  };
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setF((a) => ({ ...a, empresa: null, cidade: null }));
        setModo("ranking");
      }
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, []);
  function filtrar(proximo: FiltrosBI) {
    if (
      proximo.empresa &&
      !ranking(dados, { ...proximo, empresa: null }).some(
        (e) => e.raiz === proximo.empresa && e.n > 0,
      )
    )
      proximo.empresa = null;
    setF(proximo);
  }
  const escolherCidade = (id: string) => {
    if (f.cidade === id) {
      voltar();
      return;
    }
    setF({ ...f, cidade: id, macro: null });
  };
  const escolherEmpresa = (id: string) => {
    setF({ ...f, empresa: f.empresa === id ? null : id });
    setModo("ranking");
  };
  function detalheBase(b: BasePublica, completo = false) {
    const p = pagamentoBase(dados, b.cnpj, f.ano),
      visivel = bases.some((v) => v.cnpj === b.cnpj);
    return (
      <div key={b.cnpj} className={`base-detalhe ${!visivel ? "fora" : ""}`}>
        <div className="base-titulo">
          {completo ? (
            <button
              onClick={() =>
                escolherCidade(b.territorio.cod_ibge || "sem-localizacao")
              }
            >
              {b.territorio.municipio_ibge ||
                b.municipio ||
                "Localização não informada"}
              {b.territorio.uf && b.territorio.uf !== "BA"
                ? ` (${b.territorio.uf})`
                : ""}
            </button>
          ) : (
            <button onClick={() => escolherEmpresa(raiz(b.cnpj))}>
              {nomeBase(b)}
            </button>
          )}
          <b title={moeda(p.centavos)}>
            {p.n ? moedaCurta(p.centavos) : "Sem pagamento aprovado"}
          </b>
        </div>
        <small>
          {b.territorio.macro
            ? `Macro ${b.territorio.macro}`
            : b.territorio.situacao_geografica === "fora_da_bahia"
              ? "Fora da Bahia"
              : "Localização não informada"}{" "}
          · CNPJ {cnpjFormatado(b.cnpj)}
        </small>
        <small>Razão social: {b.nome}</small>
        <small>
          {b.primeiro_ato
            ? `Credenciada desde ${b.primeiro_ato.split("-").reverse().join("/")}`
            : "Data de credenciamento não informada"}{" "}
          · {p.n} pagamentos aprovados em {periodo}
        </small>
        {b.territorio.uf_origem.startsWith("inferida") && (
          <small>UF inferida pelo município cadastral.</small>
        )}
        {!visivel && (
          <small>
            {f.ano && !p.n
              ? `Sem pagamento aprovado em ${f.ano}`
              : "Fora do filtro atual"}
          </small>
        )}
      </div>
    );
  }
  function listaRanking() {
    const lista =
      todas || f.empresa || f.cidade ? empresas : empresas.slice(0, 10);
    return (
      <>
        <ol className="ranking">
          {lista.map((e, i) => (
            <li
              key={e.raiz}
              ref={f.empresa === e.raiz ? detalheAberto : undefined}
              className={`${f.empresa === e.raiz ? "sel" : ""} ${f.empresa && f.empresa !== e.raiz ? "atenuado" : ""}`}
            >
              <button
                className="empresa-linha"
                onClick={() => escolherEmpresa(e.raiz)}
                aria-expanded={f.empresa === e.raiz}
              >
                <span className="pos">{i + 1}</span>
                <span className="nome">
                  {e.nome}
                  <small>
                    {e.bases} {e.bases === 1 ? "base" : "bases"} · {e.n}{" "}
                    pagamentos
                  </small>
                </span>
                <span className="val" title={moeda(e.centavos)}>
                  {e.n ? moedaCurta(e.centavos) : "Sem pagamento aprovado"}
                </span>
                <span className="barra">
                  <i
                    style={{
                      width: `${(e.centavos / (empresas[0]?.centavos || 1)) * 100}%`,
                    }}
                  />
                </span>
              </button>
              {f.empresa === e.raiz && (
                <div className="det">
                  {dados.bases
                    .filter((b) => raiz(b.cnpj) === e.raiz)
                    .sort(
                      (a, b) =>
                        Number(bases.includes(b)) - Number(bases.includes(a)) ||
                        (a.municipio || "").localeCompare(b.municipio || ""),
                    )
                    .map((b) => detalheBase(b, true))}
                  <button
                    className="fechar"
                    onClick={() => setF({ ...f, empresa: null })}
                  >
                    Fechar detalhe
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
        {!empresas.length && (
          <p className="vazio">
            Nenhuma empresa neste recorte. Limpe um filtro.
          </p>
        )}
        {!todas && !f.empresa && !f.cidade && empresas.length > 10 && (
          <button className="mais" onClick={() => setTodas(true)}>
            Ver as {empresas.length} empresas
          </button>
        )}
      </>
    );
  }
  const nomeCidade = f.cidade
    ? municipios.features.find((m) => m.properties.id === f.cidade)?.properties
        .nome ||
      cidades[0]?.nome ||
      "Localização não informada"
    : null;
  return (
    <main className="painel-bi">
      <Simbolos />
      <header className="topo">
        <h1 className="marca-bi">
          <span className="marca-icone" aria-hidden="true">
            <svg>
              <use href="#ambulancia" />
            </svg>
          </span>
          <span>
            Observatório das remoções · SESAB
            <small>
              <svg className="bandeira" role="img" aria-label="Bandeira da Bahia">
                <use href="#bandeira-ba" />
              </svg>
              Credenciamento 002/2013
            </small>
          </span>
        </h1>
        <div className="filtros">
          <label>
            Ano
            <select
              aria-label="Ano"
              value={f.ano || ""}
              onChange={(e) =>
                filtrar({ ...f, ano: Number(e.target.value) || null })
              }
            >
              <option value="">{periodoCompleto}</option>
              {anos.map((a) => (
                <option key={a} value={a}>
                  {a}
                  {a === anos.at(-1) ? " (parcial)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Macrorregião
            <select
              aria-label="Macrorregião"
              value={f.macro || ""}
              onChange={(e) =>
                filtrar({ ...f, macro: e.target.value || null, cidade: null })
              }
            >
              <option value="">Todas</option>
              {macros.features.map((m) => (
                <option
                  key={String(m.properties.id)}
                  value={String(m.properties.id)}
                >
                  {String(m.properties.nome)}
                </option>
              ))}
              <option value="fora_da_bahia">Fora da Bahia</option>
            </select>
          </label>
          <label className="filtro-empresa">
            Empresa
            <select
              aria-label="Empresa"
              value={f.empresa || ""}
              onChange={(e) => {
                filtrar({ ...f, empresa: e.target.value || null });
                setModo("ranking");
              }}
            >
              <option value="">
                Todas ({opcoesEmpresas.filter((e) => e.n > 0).length})
              </option>
              {opcoesEmpresas
                .filter((e) => e.n > 0)
                .sort((a, b) => a.nome.localeCompare(b.nome))
                .map((e) => (
                  <option key={e.raiz} value={e.raiz}>
                    {e.nome}
                  </option>
                ))}
            </select>
          </label>
          {(f.ano || f.macro || f.empresa || f.cidade) && (
            <button
              className="limpar"
              onClick={() => {
                setF(INICIAL);
                setModo("ranking");
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>
      </header>
      <div className="app-bi">
        <section className="palco" aria-label="Distribuição das bases">
          <div className="flutua" aria-live="polite">
            <span className="indicador-titulo">Bases credenciadas</span>
            <strong className="numero-bases">{ns.bases}</strong>
            <small>
              {selecionada
                ? `de ${selecionada.nome}`
                : f.ano
                  ? `que receberam em ${f.ano}`
                  : "no cadastro atual"}
            </small>
            <div className="resumo">
              <div>
                <b>{ns.municipios}</b>
                <small>municípios</small>
              </div>
              <div>
                <b>{ns.empresas}</b>
                <small>empresas</small>
              </div>
            </div>
            <div className="total-pago">
              <b title={moeda(ns.centavos)}>{moedaCurta(ns.centavos)}</b>
              <small>
                pago em {periodo} · {ns.n.toLocaleString("pt-BR")} pagamentos aprovados
              </small>
              <small className="aviso-recorte">
                Só aprovados de remoção do 002/2013
              </small>
            </div>
          </div>
          <MapaBI
            municipios={municipios}
            macros={macros}
            bases={bases}
            filtros={f}
            selecionar={escolherCidade}
            voltar={voltar}
          />
          {(f.cidade || f.empresa) && (
            <button className="voltar-mapa" onClick={voltar}>
              ← Ver toda a Bahia
            </button>
          )}
          <p className="legenda">
            Malha IBGE · PDR 2026. Tamanho da bolha = nº de bases no município.
            Clique para ver as bases.
            <br />
            Clique fora, de novo na bolha, ou pressione Esc para voltar.
          </p>
        </section>
        <aside className="lado" aria-label="Empresas e bases">
          <div className="lado-cabecalho">
            {f.cidade ? (
              <>
                <button className="voltar" onClick={voltar}>
                  ← Ver toda a Bahia
                </button>
                <h2>{String(nomeCidade)}</h2>
                <p className="sub">
                  {ns.bases} bases credenciadas · {periodo}
                </p>
              </>
            ) : (
              <>
                <div className="alterna">
                  <button
                    aria-pressed={modo === "ranking"}
                    onClick={() => setModo("ranking")}
                  >
                    Ranking de empresas
                  </button>
                  <button
                    aria-pressed={modo === "lista"}
                    onClick={() => setModo("lista")}
                  >
                    Todas as bases
                  </button>
                </div>
                <h2>
                  {modo === "ranking"
                    ? "Empresas que mais receberam"
                    : "Bases por cidade"}
                </h2>
                <p className="sub">
                  {periodo}
                  {f.macro
                    ? ` · ${f.macro === "fora_da_bahia" ? "Fora da Bahia" : macros.features.find((m) => m.properties.id === f.macro)?.properties.nome}`
                    : ""}{" "}
                  ·{" "}
                  {modo === "ranking"
                    ? "Clique na empresa para ver as bases."
                    : `${ns.bases} bases em ${ns.municipios} municípios.`}
                </p>
              </>
            )}
          </div>
          <div
            className="lado-conteudo"
            key={`${f.ano}-${f.macro}-${f.cidade}-${modo}`}
          >
            {f.cidade ? (
              <>
                {bases.map((b) => detalheBase(b))}
                {!bases.length && (
                  <p className="vazio">Nenhuma base neste recorte.</p>
                )}
                <h3>Quem mais recebeu aqui</h3>
                {listaRanking()}
              </>
            ) : modo === "ranking" ? (
              listaRanking()
            ) : (
              <>
                {cidades.map((g) => (
                  <section className="cidade" key={g.id}>
                    <button
                      className="cidade-cab"
                      onClick={() => escolherCidade(g.id)}
                    >
                      <strong>
                        {g.nome}
                        {g.uf !== "BA"
                          ? ` (${g.uf || "UF não informada"})`
                          : ""}
                        <small>{g.macro}</small>
                      </strong>
                      <b>{g.bases.length}</b>
                    </button>
                    {cidades.length <= 3 && g.bases.map((b) => detalheBase(b))}
                  </section>
                ))}
                {!cidades.length && (
                  <p className="vazio">Nenhuma base neste recorte.</p>
                )}
              </>
            )}
          </div>
          <footer className="fonte">
            Fonte: {dados.cobertura.fonte}. Pagamentos{" "}
            {dados.cobertura.inicio.split("-").reverse().join("/")}–
            {dados.cobertura.fim.split("-").reverse().join("/")}{" "}
            {anos.length
              ? `(${anos.at(-1)} parcial).`
              : "(sem pagamentos no recorte)."}{" "}
            Município = cadastro do CNPJ da base. Cadastro atual não representa bases ativas ao longo do tempo.
            <strong className="aviso-valor">
              O observatório cobre 2023–2026, como o Painel de Pagamentos do Portal da Transparência. Somam só os
              pagamentos aprovados de remoção do Credenciamento 002/2013; os que aguardam revisão não entram. Por isso o
              valor é menor que o total por recebedor no portal.
            </strong>
          </footer>
        </aside>
      </div>
    </main>
  );
}
