// Tipos espelhados de api/modelos_painel.py (FastAPI). Valores monetários chegam como texto
// decimal ("1234.56") para não perder precisão.

export type SituacaoGeo = "bahia" | "fora_da_bahia" | "sem_informacao";
export type UfOrigem = "registrada" | "inferida_pelo_municipio" | "ausente";
export type SituacaoVinculo = "unica_base" | "verificado_receita" | "pendente_verificacao";
export type SituacaoCobertura = "sem_cobertura" | "completa_informada" | "parcial";

export interface Territorio {
  cod_ibge: string | null;
  municipio_ibge: string | null;
  uf: string | null;
  uf_origem: UfOrigem;
  regiao_id: string | null;
  regiao: string | null;
  macro_id: string | null;
  macro: string | null;
  situacao_geografica: SituacaoGeo;
}

export interface BasePainel {
  cnpj: string;
  cnpj_numeros: string;
  raiz_cnpj: string;
  razao_social: string;
  municipio_cnpj: string | null;
  matriz_filial: "matriz" | "filial" | null;
  situacao_cadastral: string | null;
  status_documental: string | null;
  fonte_cadastro: string | null;
  territorio: Territorio;
  localizacao: { tipo: "cadastral"; operacional_confirmada: boolean; descricao: string };
  termos: { total: number; vigentes: number };
  pendencias: string[];
}

export interface ListaBases {
  total: number;
  limite: number;
  deslocamento: number;
  bases: BasePainel[];
}

export interface Empresa {
  raiz_cnpj: string;
  nome: string;
  nomes_registrados: string[];
  n_bases: number;
  n_bases_no_recorte: number;
  bases: string[];
  municipios: string[];
  macrorregioes: string[];
  vinculo: { tipo: "raiz_cnpj"; situacao: SituacaoVinculo; motivo: string };
}

export interface ListaEmpresas {
  total: number;
  empresas: Empresa[];
  observacao: string;
}

export interface TermoBase {
  id: number;
  numero_termo: string;
  credenciamento: string | null;
  data_publicacao: string | null;
  situacao: string | null;
  status_documental: string | null;
}

export interface DetalheBase extends BasePainel {
  empresa: Empresa;
  lista_termos: TermoBase[];
}

export interface Area {
  id: string;
  nome: string;
  macro_id?: string | null;
  regiao_id?: string | null;
  bases: number;
  empresas: number;
  municipios_com_base: number;
}

export type NivelMapa = "macrorregioes" | "regioes" | "municipios";

export interface Territorios {
  nivel: NivelMapa;
  areas: Area[];
  fora_da_bahia: Area;
  sem_informacao_geografica: number;
}

export interface Resumo {
  bases: number;
  empresas: number;
  empresas_com_varias_bases: number;
  vinculos_pendentes: number;
  vinculos_verificados: number;
  municipios_com_base: number;
  regioes_com_base: number;
  macrorregioes_com_base: number;
  bases_fora_da_bahia: number;
  bases_sem_informacao_geografica: number;
  localizacao_operacional_confirmada: number;
  uf_inferida: number;
  status_documental: { valor: string | null; quantidade: number }[];
  matriz_filial: { valor: string | null; quantidade: number }[];
  bases_com_pendencia: number;
}

export interface Macro {
  id: string;
  nome: string;
  sede: string;
  n_regioes: number;
  n_municipios: number;
  populacao_2026: number;
}
export interface Regiao {
  id: string;
  nome: string;
  macro_id: string;
  n_municipios: number;
  populacao_2026: number;
}
export interface MunicipioRef {
  cod_ibge: string;
  nome: string;
  uf: string;
  regiao_id?: string;
  macro_id?: string;
}

export interface Regionalizacao {
  versao: string;
  fonte: Record<string, string>;
  macrorregioes: Macro[];
  regioes: Regiao[];
  municipios: MunicipioRef[];
  fora_da_bahia: MunicipioRef[];
}

export interface AnoCobertura {
  ano: number;
  situacao: SituacaoCobertura;
  ate: string | null;
}

export interface Cobertura {
  versao: string;
  fonte_financeira: string;
  data_referencia: string;
  origem_desta_declaracao: string;
  observacao: string;
  anos: AnoCobertura[];
}

export type Motivo = "permissao_pendente" | "view_inexistente" | null;

export interface PagamentosValidados {
  situacao: "fonte_indisponivel" | "sem_cobertura_no_periodo" | "sem_dados_aprovados" | "com_dados_aprovados";
  ano_inicial: number;
  ano_final: number;
  filtros_aplicados: boolean;
  total: {
    fonte: string;
    situacao: "disponivel" | "indisponivel";
    motivo: Motivo;
    pagamentos_aprovados: number | null;
    total_aprovado: string | null;
  };
  anual: {
    fonte: string;
    situacao: "disponivel" | "indisponivel";
    motivo: Motivo;
    anos: {
      ano: number;
      cobertura: SituacaoCobertura;
      pagamentos_aprovados: number;
      total_aprovado: string | null;
      bases_com_pagamento: number;
    }[];
    bases: {
      cnpj_numeros: string;
      pagamentos_aprovados: number;
      total_aprovado: string;
      anos_com_pagamento: number[];
      ultimo_ano_com_pagamento: number;
      ultima_data_pagamento: string | null;
    }[];
    macrorregioes: { id: string; nome: string; pagamentos_aprovados: number; total_aprovado: string }[];
    fora_da_bahia: { id: string; nome: string; pagamentos_aprovados: number; total_aprovado: string } | null;
  };
  observacao: string;
}

export interface Metadados {
  pendencias: Record<string, string>;
  observacao_empresas: string;
  observacao_financeiro: string;
  anos: { minimo: number; maximo: number };
}

// GeoJSON mínimo usado pelo mapa.
export interface Feature {
  type: "Feature";
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
  properties: Record<string, unknown> & { id?: string; nome?: string; lbl?: [number, number]; bbox?: [number, number, number, number] };
}
export interface FeatureCollection {
  type: "FeatureCollection";
  features: Feature[];
}
