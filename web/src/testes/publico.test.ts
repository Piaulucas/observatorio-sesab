import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { agregar, type DadosPublicos } from "../publico/agregar";

// Paridade build público × API local. Os casos esperados vêm de scripts/publico/gerar_paridade.py e não ficam no
// repositório (derivam do snapshot privado). Sem as variáveis, o teste é pulado.
const ESPERADO = process.env.PARIDADE_ESPERADO;
const PUBLICO = process.env.PARIDADE_PUBLICO;
const ativo = Boolean(ESPERADO && PUBLICO && existsSync(ESPERADO) && existsSync(PUBLICO));

describe.skipIf(!ativo)("paridade do build público com a API", () => {
  it("todas as combinações de filtro dão a mesma resposta", () => {
    const dados = JSON.parse(readFileSync(PUBLICO!, "utf8")) as DadosPublicos;
    const casos = JSON.parse(readFileSync(ESPERADO!, "utf8")) as { filtro: never; resposta: Record<string, unknown> }[];
    let ok = 0;
    for (const c of casos) {
      const r = agregar(dados, c.filtro) as Record<string, unknown>;
      delete r.cobertura; delete r.politica; delete r.selecao;
      expect(r, JSON.stringify(c.filtro)).toEqual(c.resposta);
      ok++;
    }
    expect(ok).toBe(casos.length);
    console.log(`paridade: ${ok}/${casos.length}`);
  });
});

describe("agregar (sintético)", () => {
  const dados: DadosPublicos = {
    formato: "observatorio-publico-v1", politica: "x", cobertura: { inicio: "2019-01-01", fim: "2026-10-01" }, selecao: {}, opcoes: {},
    bases: [
      { cnpj: "11111111000101", nome: "A", municipio: "Salvador", primeiro_ato: "2018-01-01", territorio: { cod_ibge: "2927408", uf: "BA", uf_origem: "registrada", regiao_id: "salvador", regiao: "Salvador", macro_id: "leste", macro: "Leste", situacao_geografica: "bahia" } },
      { cnpj: "22222222000101", nome: "B", municipio: "Petrolina", primeiro_ato: null, territorio: { cod_ibge: "2611101", uf: "PE", uf_origem: "registrada", regiao_id: null, regiao: null, macro_id: null, macro: null, situacao_geografica: "fora_da_bahia" } },
    ],
    beneficiarios: [{ cnpj: "11111111000101", nome: "A" }, { cnpj: "22222222000101", nome: "B" }],
    pagamentos: [
      { cnpj: "11111111000101", ano: 2025, centavos: 1000, n: 2 },
      { cnpj: "22222222000101", ano: 2025, centavos: 500, n: 1 },
    ],
  };
  it("fora da Bahia entra no total geral e é separado no mapa", () => {
    const r = agregar(dados, { ano_inicial: 2019, ano_final: 2026 });
    expect(r.financeiro.centavos).toBe(1500);
    expect(r.financeiro.pagamentos).toBe(3);
    expect(r.mapa.fora_da_bahia.centavos).toBe(500);
    expect(r.mapa.areas[0].centavos).toBe(1000);
    const f = agregar(dados, { ano_inicial: 2019, ano_final: 2026, macro: "fora_da_bahia" });
    expect(f.financeiro.centavos).toBe(500);
  });
  it("período inválido é recusado", () => {
    expect(() => agregar(dados, { ano_inicial: 2026, ano_final: 2019 })).toThrow();
  });
});
