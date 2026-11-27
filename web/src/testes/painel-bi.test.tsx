import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from "@testing-library/react";
import type { DadosPublicos } from "../publico/agregar";
import type { FeatureCollection } from "../api/tipos";
import {
  INICIAL,
  basesDoRecorte,
  numeros,
  pagamentoBase,
  porCidade,
  ranking,
} from "../publico/bi/modelo";
import { PainelBI, PainelCarregado } from "../publico/bi/PainelBI";
const carregar = (nome: string) =>
  JSON.parse(readFileSync(`publico/estatico/dados/${nome}`, "utf8"));
const dados = carregar("observatorio.json") as DadosPublicos;
const municipios = carregar("malha_municipios.geojson") as FeatureCollection;
const macros = carregar("malha_macrorregioes.geojson") as FeatureCollection;
const anos = [...new Set(dados.pagamentos.map((p) => p.ano))].sort();
const raizes = [...new Set(dados.bases.map((b) => b.cnpj.slice(0, 8)))];
const macroIds = [
  ...new Set(dados.bases.map((b) => b.territorio.macro_id || "fora_da_bahia")),
];
const cidades = [...new Set(dados.bases.map((b) => b.territorio.cod_ibge))];
describe("Painel BI — dados públicos reais", () => {
  it("totais gerais e bases por ano conferem com o recorte aprovado", () => {
    expect(numeros(dados, INICIAL)).toEqual({
      bases: 50,
      municipios: 26,
      empresas: 41,
      centavos: 28275819674,
      n: 1114,
    });
    expect(
      anos.map((ano) => basesDoRecorte(dados, { ...INICIAL, ano }).length),
    ).toEqual([14, 18, 27, 41]);
    expect(anos).toEqual([2023, 2024, 2025, 2026]);
    for (const ano of anos)
      expect(numeros(dados, { ...INICIAL, ano }).centavos).toBe(
        dados.pagamentos
          .filter((p) => p.ano === ano)
          .reduce((s, p) => s + p.centavos, 0),
      );
  });
  it("mapa × cidade: todas as combinações ano × macro × empresa × cidade, inclusive vazias", () => {
    let casos = 0;
    for (const ano of [null, ...anos])
      for (const macro of [null, ...macroIds])
        for (const empresa of [null, ...raizes]) {
          const f = { ...INICIAL, ano, macro, empresa };
          const bs = basesDoRecorte(dados, f),
            grupos = porCidade(bs);
          const esperadas = dados.bases.filter(
            (b) =>
              (!macro ||
                (b.territorio.macro_id || "fora_da_bahia") === macro) &&
              (!empresa || b.cnpj.slice(0, 8) === empresa) &&
              (!ano ||
                dados.pagamentos.some(
                  (p) => p.cnpj === b.cnpj && p.ano === ano,
                )),
          );
          expect(bs.map((b) => b.cnpj)).toEqual(esperadas.map((b) => b.cnpj));
          expect(grupos.flatMap((g) => g.bases).length).toBe(bs.length);
          for (const cidade of cidades) {
            const local = { ...f, cidade };
            const detalhe = basesDoRecorte(dados, local);
            expect(detalhe.map((b) => b.cnpj)).toEqual(
              (grupos.find((g) => g.id === cidade)?.bases || []).map(
                (b) => b.cnpj,
              ),
            );
            const esperado = dados.pagamentos.filter(
              (p) =>
                (!ano || p.ano === ano) &&
                esperadas.some(
                  (b) => b.cnpj === p.cnpj && b.territorio.cod_ibge === cidade,
                ),
            );
            const ns = numeros(dados, local);
            expect(ns.bases).toBe(detalhe.length);
            expect(ns.centavos).toBe(
              esperado.reduce((s, p) => s + p.centavos, 0),
            );
            expect(
              ranking(dados, local)
                .filter((e) => !empresa || e.raiz === empresa)
                .reduce((s, e) => s + e.centavos, 0),
            ).toBe(ns.centavos);
            casos++;
          }
        }
    expect(casos).toBeGreaterThan(554);
    console.log(`BI consistência: ${casos} combinações, 0 falhas`);
  }, 120000);
  it("nome de exibição no ranking, razão social no cadastro", () => {
    for (const b of dados.bases) expect(b.nome_exibicao).toBeTruthy();
    expect(ranking(dados, INICIAL).map((e) => e.nome)).toContain("Zelar Vidas");
  });
  it("Vimedi em 2023 não acende bases irmãs sem pagamento", () => {
    const bs = basesDoRecorte(dados, {
      ...INICIAL,
      ano: 2023,
      empresa: "32788063",
    });
    expect(bs.length).toBeGreaterThan(0);
    for (const b of bs)
      expect(pagamentoBase(dados, b.cnpj, 2023).n).toBeGreaterThan(0);
    expect(
      bs.some((b) =>
        ["Juazeiro", "Feira de Santana"].includes(b.municipio || ""),
      ),
    ).toBe(false);
  });
});
describe("Painel BI — interações", () => {
  it("filtros, detalhe embaixo do nome, cidade, voltar, lista e Esc", () => {
    render(
      <PainelCarregado dados={dados} municipios={municipios} macros={macros} />,
    );
    expect(screen.queryByText("NÃO validados")).toBeNull();   // aviso retirado a pedido do responsável (26/11/2026)
    expect(screen.getByRole("img", { name: "Bandeira da Bahia" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Ano"), {
      target: { value: "2024" },
    });
    expect(document.querySelector(".numero-bases")).toHaveTextContent("18");
    expect(screen.getByText(/menor que o total por recebedor no portal/)).toBeInTheDocument();
    expect(screen.getByText(/Ainda há remoções em análise/)).toBeInTheDocument();
    expect(screen.getByText("Só aprovados de remoção do 002/2013")).toBeInTheDocument();
    expect(screen.getByText(/Projeto independente, sem vínculo.*Criado por Lucas Almeida Piau Santana/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Código no GitHub" })).toHaveAttribute("href", "https://github.com/Piaulucas/observatorio-sesab");
    fireEvent.change(screen.getByLabelText("Empresa"), {
      target: { value: "32788063" },
    });
    const aberto = document.querySelector(".ranking li.sel")!;
    expect(
      within(aberto as HTMLElement).getByRole("button", {
        name: "Fechar detalhe",
      }),
    ).toBeInTheDocument();
    expect(aberto.querySelectorAll(".base-detalhe").length).toBeGreaterThan(1);
    expect(document.querySelectorAll(".bolha")).toHaveLength(
      porCidade(
        basesDoRecorte(dados, { ...INICIAL, ano: 2024, empresa: "32788063" }),
      ).length,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByLabelText("Empresa")).toHaveValue("");
    fireEvent.keyDown(document.querySelector(".bolha")!, { key: "Enter" });
    expect(
      screen.getByRole("heading", { name: "Quem mais recebeu aqui" }),
    ).toBeInTheDocument();
    fireEvent.click(document.querySelector(".bolha.sel")!);
    expect(
      screen.getByRole("heading", { name: "Empresas que mais receberam" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Todas as bases" }));
    expect(
      screen.getByRole("heading", { name: "Bases por cidade" }),
    ).toBeInTheDocument();
    fireEvent.click(document.querySelector(".cidade-cab")!);
    fireEvent.click(document.querySelector(".mapa-caixa")!);
    expect(
      screen.getByRole("heading", { name: "Empresas que mais receberam" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(document.querySelector(".numero-bases")).toHaveTextContent("50");
  });
  it("recorte vazio e fora da Bahia preservam a semântica", () => {
    render(
      <PainelCarregado dados={dados} municipios={municipios} macros={macros} />,
    );
    fireEvent.change(screen.getByLabelText("Ano"), {
      target: { value: "2023" },
    });
    fireEvent.change(screen.getByLabelText("Macrorregião"), {
      target: { value: "norte" },
    });
    expect(document.querySelector(".numero-bases")).toHaveTextContent("0");
    expect(
      screen.getByText("Nenhuma empresa neste recorte. Limpe um filtro."),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Ano"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Macrorregião"), {
      target: { value: "fora_da_bahia" },
    });
    expect(document.querySelectorAll(".bolha")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: /Petrolina: / }),
    ).toBeInTheDocument();
  });
});

describe("Painel BI — carregamento público", () => {
  it("carrega três arquivos estáticos e mostra dados só após o conjunto completo", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async (entrada) =>
          ({
            ok: true,
            json: async () =>
              String(entrada).endsWith("observatorio.json")
                ? dados
                : String(entrada).includes("municipios")
                  ? municipios
                  : macros,
          }) as Response,
      );
    try {
      render(<PainelBI />);
      expect(screen.getByRole("status")).toHaveTextContent("Carregando");
      await waitFor(() =>
        expect(document.querySelector(".numero-bases")).toHaveTextContent("50"),
      );
      expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
        "/dados/observatorio.json",
        "/dados/malha_municipios.geojson",
        "/dados/malha_macrorregioes.geojson",
      ]);
    } finally {
      fetchMock.mockRestore();
    }
  });
  it("falha de rede não exibe zero e permite tentar novamente", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("offline"));
    try {
      render(<PainelBI />);
      await screen.findByRole("heading", {
        name: "Não foi possível carregar o painel",
      });
      expect(document.querySelector(".numero-bases")).toBeNull();
      fetchMock.mockImplementation(
        async (entrada) =>
          ({
            ok: true,
            json: async () =>
              String(entrada).endsWith("observatorio.json")
                ? dados
                : String(entrada).includes("municipios")
                  ? municipios
                  : macros,
          }) as Response,
      );
      fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
      await waitFor(() =>
        expect(document.querySelector(".numero-bases")).toHaveTextContent("50"),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });
  it("formato desconhecido não calcula indicadores", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({ formato: "invalido" }),
      } as Response);
    try {
      render(<PainelBI />);
      await screen.findByRole("heading", {
        name: "Não foi possível carregar o painel",
      });
      expect(document.querySelector(".numero-bases")).toBeNull();
    } finally {
      fetchMock.mockRestore();
    }
  });
});

describe("Painel BI — regressões da revisão independente", () => {
  it("snapshot sem pagamentos usa período explícito, sem undefined", () => {
    render(
      <PainelCarregado
        dados={{ ...dados, bases: [], pagamentos: [] }}
        municipios={municipios}
        macros={macros}
      />,
    );
    expect(document.body).not.toHaveTextContent("undefined");
    expect(document.querySelector(".numero-bases")).toHaveTextContent("0");
    expect(
      screen.getAllByText(/Sem pagamentos no recorte/).length,
    ).toBeGreaterThan(0);
  });
  it("malha vazia resulta em erro recuperável, sem renderizar mapa", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async (entrada) =>
          ({
            ok: true,
            json: async () =>
              String(entrada).endsWith("observatorio.json")
                ? dados
                : { type: "FeatureCollection", features: [] },
          }) as Response,
      );
    try {
      render(<PainelBI />);
      await screen.findByRole("heading", {
        name: "Não foi possível carregar o painel",
      });
      expect(
        screen.getByRole("button", { name: "Tentar novamente" }),
      ).toBeInTheDocument();
      expect(document.querySelector(".mapa")).toBeNull();
    } finally {
      fetchMock.mockRestore();
    }
  });
  it("renderização direta de malha vazia também não derruba o restante do painel", () => {
    render(
      <PainelCarregado
        dados={dados}
        municipios={{ type: "FeatureCollection", features: [] }}
        macros={macros}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Mapa indisponível");
    expect(document.querySelector(".numero-bases")).toHaveTextContent("50");
  });
});
