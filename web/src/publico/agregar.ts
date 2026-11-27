// Porta fiel de api/estatistica_local.py::agregar para o build público estático.
// Entrada: o JSON público exportado por scripts/publico/exportar_publico.py (só campos permitidos,
// pagamentos já somados por CNPJ completo e ano). A paridade com a API é testada em
// web/src/testes/publico.test.ts contra saídas geradas pela própria função Python.

export interface Territorio {
  cod_ibge: string | null;
  municipio_ibge?: string | null;
  uf: string | null;
  uf_origem: string;
  regiao_id: string | null;
  regiao: string | null;
  macro_id: string | null;
  macro: string | null;
  situacao_geografica?: string | null;
}
export interface BasePublica { cnpj: string; nome: string; nome_exibicao?: string; municipio: string | null; territorio: Territorio; primeiro_ato: string | null }
export interface PagamentoAnual { cnpj: string; ano: number; centavos: number; n: number }
export interface DadosPublicos {
  formato: "observatorio-publico-v1";
  politica: string;
  cobertura: Record<string, string> & { inicio: string; fim: string };
  selecao: Record<string, unknown>;
  bases: BasePublica[];
  /** Beneficiários na ordem da primeira ocorrência na fonte; `nome` é o último nome observado. */
  beneficiarios: { cnpj: string; nome: string }[];
  pagamentos: PagamentoAnual[];
  opcoes: Record<string, unknown>;
  indicadores_omitidos?: { id: string; motivo: string }[];
}
export interface Filtro { ano_inicial: number; ano_final: number; municipio?: string; regiao?: string; empresa?: string; macro?: string }

export class ErroFiltro extends Error {}

const soma = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
/** round(x, 1) do Python (meio para par sobre o valor binário); suficiente para percentuais. */
function arred1(x: number): number {
  const r = Math.round(x * 10) / 10;
  const diff = Math.abs(x * 10 - Math.trunc(x * 10));
  if (Math.abs(diff - 0.5) < 1e-9) {
    const baixo = Math.trunc(x * 10);
    return (baixo % 2 === 0 ? baixo : baixo + 1) / 10;
  }
  return r;
}

export function agregar(data: DadosPublicos, f: Filtro) {
  const ini = f.ano_inicial, fim = f.ano_final;
  if (ini > fim) throw new ErroFiltro("Período inicial posterior ao final.");
  const { municipio, regiao, empresa, macro } = f;
  const bases = data.bases;
  const porCnpj = new Map(bases.map((b) => [b.cnpj, b]));
  const doFiltroEmpresa = (c: string) => !empresa || c === empresa || c.slice(0, 8) === empresa;
  const casa = (b: BasePublica) => {
    const t = b.territorio;
    return (!municipio || t.cod_ibge === municipio) && (!regiao || t.regiao_id === regiao)
      && (!macro || (macro === "fora_da_bahia" ? t.situacao_geografica === "fora_da_bahia" : t.macro_id === macro))
      && doFiltroEmpresa(b.cnpj);
  };
  const selecionadas = bases.filter(casa);
  const chaves = new Set(selecionadas.map((b) => b.cnpj));
  const geo = Boolean(municipio || regiao || macro);
  const nomeBenef = new Map(data.beneficiarios.map((b) => [b.cnpj, b.nome]));
  const todos = data.pagamentos.filter((p) => doFiltroEmpresa(p.cnpj) && (!geo || chaves.has(p.cnpj)));
  const pagos = todos.filter((p) => ini <= p.ano && p.ano <= fim);
  const total = soma(pagos.map((p) => p.centavos));
  const recebedores = new Set(pagos.map((p) => p.cnpj));
  const unidades = new Map<string, string>();
  for (const b of data.beneficiarios) if (doFiltroEmpresa(b.cnpj) && (!geo || chaves.has(b.cnpj))) unidades.set(b.cnpj, b.nome);
  for (const b of selecionadas) unidades.set(b.cnpj, b.nome);
  void nomeBenef;
  const anos = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
  const parcialFim = Number(String(data.cobertura.fim ?? "2026").slice(0, 4));

  const anual = anos(ini, fim).map((ano) => {
    const sub = pagos.filter((p) => p.ano === ano);
    const documentadas = selecionadas.filter((b) => b.primeiro_ato && b.primeiro_ato.slice(0, 4) <= String(ano));
    const porRaiz = new Map<string, number>();
    for (const p of sub) porRaiz.set(p.cnpj.slice(0, 8), (porRaiz.get(p.cnpj.slice(0, 8)) ?? 0) + p.centavos);
    const anoTotal = soma([...porRaiz.values()]);
    const top5 = soma([...porRaiz.values()].sort((a, b) => b - a).slice(0, 5));
    return {
      ano, centavos: anoTotal, beneficiarios: new Set(sub.map((p) => p.cnpj)).size, empresas: porRaiz.size,
      participacao_top5: anoTotal ? arred1((100 * top5) / anoTotal) : 0,
      bases_documentadas: documentadas.length, raizes_documentadas: new Set(documentadas.map((b) => b.cnpj.slice(0, 8))).size,
      parcial: ano === parcialFim,
    };
  });

  const linhas = [...unidades.entries()].map(([cnpj, nome]) => {
    const sub = pagos.filter((p) => p.cnpj === cnpj);
    const valor = soma(sub.map((p) => p.centavos));
    const b = porCnpj.get(cnpj);
    return {
      cnpj, nome, raiz_cnpj: cnpj.slice(0, 8), bases: b ? 1 : 0, municipio: b ? b.municipio : null, centavos: valor,
      pagamentos: soma(sub.map((p) => p.n)), participacao: total ? (100 * valor) / total : 0,
      anual: anos(ini, fim).map((y) => ({ ano: y, centavos: soma(sub.filter((p) => p.ano === y).map((p) => p.centavos)) })),
    };
  });

  const datas = bases.filter((b) => b.primeiro_ato).map((b) => Number(b.primeiro_ato!.slice(0, 4)));
  const anosPag = data.pagamentos.map((p) => p.ano);
  const primeiro = Math.min(...anosPag, ...datas);
  const ultimo = Math.max(...anosPag);
  const inicioCob = Number(String(data.cobertura.inicio ?? "2019").slice(0, 4));
  const historico = anos(primeiro, ultimo).map((y) => {
    const doc = new Set(selecionadas.filter((b) => b.primeiro_ato && Number(b.primeiro_ato.slice(0, 4)) <= y).map((b) => b.cnpj.slice(0, 8)));
    return {
      ano: y, raizes_documentadas: doc.size,
      centavos: y >= inicioCob ? soma(todos.filter((p) => p.ano === y).map((p) => p.centavos)) : null,
      parcial: y === parcialFim,
    };
  });

  const raizes = [...new Set([...unidades.keys()].map((c) => c.slice(0, 8)))].sort();
  const empresas = raizes.map((raiz) => {
    const membros = linhas.filter((r) => r.cnpj.slice(0, 8) === raiz);
    const bs = selecionadas.filter((b) => b.cnpj.slice(0, 8) === raiz);
    const ps = todos.filter((p) => p.cnpj.slice(0, 8) === raiz);
    const valor = soma(membros.map((r) => r.centavos));
    const municipios = [...new Set(bs.map((b) => b.municipio).filter((m): m is string => Boolean(m)))].sort(cmpPy);
    return {
      cnpj: raiz, nome: membros[0].nome, cnpjs: membros.map((r) => r.cnpj), bases: bs.length,
      municipio: municipios.join(", ") || null,
      localizacoes: bs.map((b) => ({ cnpj: b.cnpj, municipio: b.municipio, uf: b.territorio.uf ?? null, uf_origem: b.territorio.uf_origem ?? null, primeiro_ato: b.primeiro_ato ?? null })),
      centavos: valor, pagamentos: soma(membros.map((r) => r.pagamentos)), participacao: total ? (100 * valor) / total : 0,
      anual: anos(inicioCob, ultimo).map((y) => ({ ano: y, centavos: soma(ps.filter((p) => p.ano === y).map((p) => p.centavos)) })),
    };
  });
  const ordem = (a: { centavos: number; cnpj: string }, b: { centavos: number; cnpj: string }) => b.centavos - a.centavos || cmpPy(a.cnpj, b.cnpj);
  empresas.sort(ordem);
  linhas.sort(ordem);

  const grupos = new Map<string, BasePublica[]>();
  const fora: BasePublica[] = [];
  let desconhecidas = 0;
  for (const b of selecionadas) {
    const t = b.territorio;
    if (t.macro_id) grupos.set(t.macro_id, [...(grupos.get(t.macro_id) ?? []), b]);
    else if (t.situacao_geografica === "fora_da_bahia") fora.push(b);
    else desconhecidas++;
  }
  const area = (id: string, nome: string | null, bs: BasePublica[]) => {
    const cs = new Set(bs.map((b) => b.cnpj));
    return {
      id, nome, centavos: soma(pagos.filter((p) => cs.has(p.cnpj)).map((p) => p.centavos)), bases: bs.length,
      empresas: new Set(bs.map((b) => b.cnpj.slice(0, 8))).size,
      municipios_com_base: new Set(bs.map((b) => b.territorio.cod_ibge).filter(Boolean)).size,
    };
  };
  return {
    cobertura: data.cobertura, politica: data.politica, selecao: data.selecao,
    cadastro: {
      bases: selecionadas.length, raizes_cnpj: new Set(selecionadas.map((b) => b.cnpj.slice(0, 8))).size,
      municipios: new Set(selecionadas.map((b) => b.territorio.cod_ibge).filter(Boolean)).size,
      bases_sem_data_documental: selecionadas.filter((b) => !b.primeiro_ato).length,
    },
    financeiro: {
      centavos: total, pagamentos: soma(pagos.map((p) => p.n)), beneficiarios: recebedores.size,
      empresas: new Set([...recebedores].map((c) => c.slice(0, 8))).size,
      pagamentos_sem_base_associada: soma(pagos.filter((p) => !porCnpj.has(p.cnpj)).map((p) => p.n)),
    },
    anual, historico, empresas, beneficiarios: linhas,
    mapa: {
      nivel: "macrorregioes",
      areas: [...grupos.entries()].sort(([a], [b]) => cmpPy(a, b)).map(([k, bs]) => area(k, bs[0].territorio.macro, bs)),
      fora_da_bahia: area("fora_da_bahia", "Fora da Bahia", fora),
      sem_informacao_geografica: desconhecidas,
    },
    opcoes: data.opcoes,
  };
}

/** Comparação de strings por ponto de código (igual ao sorted() do Python). */
export function cmpPy(a: string, b: string): number {
  const x = [...a], y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i].codePointAt(0)! - y[i].codePointAt(0)!;
    if (d) return d;
  }
  return x.length - y.length;
}
