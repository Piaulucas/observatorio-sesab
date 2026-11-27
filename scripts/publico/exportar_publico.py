"""Exporta o JSON público estático do Observatório a partir do snapshot privado de pagamentos APROVADOS
(scripts/gerar_snapshot_aprovados.py). Qualquer outro snapshot é recusado.

Não acessa banco. Copia somente campos de uma lista permitida (CNPJ de pessoa jurídica, nome empresarial do
cadastro, município/território, data do primeiro termo, ano e centavos somados). Pagamentos individuais, números de
pagamento, processos, credores pessoas físicas, rastro de seleção e hashes internos não saem daqui.

Uso: .venv/bin/python scripts/publico/exportar_publico.py <pasta_snapshot> <pasta_saida_estatico>
"""
import collections
import datetime as dt
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from api.estatistica_local import agregar  # noqa: E402
from api.nomes import exibicao  # noqa: E402

FORMATO = 'observatorio-publico-v1'
POLITICA = 'aprovados-validacao-v1'
# Recorte do observatório (decisão do responsável, 26/11/2026): 2023–2026, como o Painel de Pagamentos do Portal da
# Transparência. O snapshot e o banco continuam com todo o histórico; só a publicação é recortada.
ANO_INICIAL, ANO_FINAL = 2023, 2026
OBSERVACAO = ('Somente pagamentos aprovados de remoção do Credenciamento 002/2013 em 2023–2026 (2026 parcial); os que aguardam '
              'revisão não entram. O valor é menor que o total por recebedor no portal, que não separa credenciamento. Não '
              'representa todos os pagamentos SESAB.')
CAMPOS_BASE = ('cnpj', 'nome', 'municipio', 'territorio', 'primeiro_ato')
CAMPOS_TERRITORIO = ('cod_ibge', 'municipio_ibge', 'uf', 'uf_origem', 'regiao_id', 'regiao', 'macro_id', 'macro', 'situacao_geografica')
CAMPOS_COBERTURA = ('inicio', 'fim', 'snapshot_em', 'fonte', 'fonte_url', 'observacao')
CAMPOS_SELECAO = ('importados', 'incluidos', 'incluidos_no_periodo', 'excluidos', 'centavos_excluidos', 'motivos_sobrepostos')
MALHAS = {'macrorregioes': 'malha_macrorregioes.geojson', 'regioes': 'malha_regioes.geojson',
          'municipios': 'malha_municipios.geojson', 'contorno': 'contorno_ba.geojson'}
# Data de aquisição dos CSVs oficiais usados na importação (cópia preservada; ver DIAGNOSTICO_FINANCEIRO.md).
FONTE_ADQUIRIDA_EM = '2026-11-06'


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def carregar_snapshot(pasta):
    pasta = Path(pasta)
    bruto = (pasta / 'dados.json').read_bytes()
    manifesto = json.loads((pasta / 'manifesto.json').read_text())
    if hashlib.sha256(bruto).hexdigest() != manifesto['snapshot_sha256']:
        raise SystemExit('Snapshot não confere com o manifesto.')
    dados = json.loads(bruto)
    if dados['politica'] != POLITICA:
        raise SystemExit('Só o snapshot de pagamentos aprovados pode ser publicado.')
    return dados, manifesto


def recortar(dados):
    """Snapshot só com o período. Sai a base que só tem pagamentos (de qualquer situação) fora dele; base sem pagamento
    nenhum, ou com pagamentos do período ainda não aprovados, continua (aparece como "Sem pagamento aprovado")."""
    no_periodo = lambda ano: ANO_INICIAL <= ano <= ANO_FINAL
    pagos = [p for p in dados['pagamentos'] if no_periodo(p['ano'])]
    bases = [b for b in dados['bases']
             if not b['anos_com_pagamento'] or any(no_periodo(a) for a in b['anos_com_pagamento'])]
    cobertura = {**dados['cobertura'], 'inicio': max(dados['cobertura']['inicio'], f'{ANO_INICIAL}-01-01'),
                 'observacao': OBSERVACAO}
    selecao = {**dados['selecao'], 'incluidos_no_periodo': len(pagos)}
    return {**dados, 'bases': bases, 'pagamentos': pagos, 'cobertura': cobertura, 'selecao': selecao}


def exportar(dados, manifesto):
    dados = recortar(dados)
    bases = [{k: b[k] for k in CAMPOS_BASE} for b in dados['bases']]
    for b in bases:
        b['territorio'] = {k: b['territorio'].get(k) for k in CAMPOS_TERRITORIO}
        assert re.fullmatch(r'\d{14}', b['cnpj'])
        b['nome_exibicao'] = exibicao(b['cnpj'], b['nome'])  # nome fantasia revisado; `nome` = razão social
    nome_base = {b['cnpj']: b['nome'] for b in bases}
    ordem, ultimo_nome = [], {}
    soma = collections.defaultdict(lambda: [0, 0])
    for p in dados['pagamentos']:
        assert re.fullmatch(r'\d{14}', p['cnpj']), 'Beneficiário sem CNPJ de pessoa jurídica'
        if p['cnpj'] not in ultimo_nome:
            ordem.append(p['cnpj'])
        ultimo_nome[p['cnpj']] = p['nome']
        s = soma[(p['cnpj'], p['ano'])]
        s[0] += p['centavos']
        s[1] += 1
    sem_base = [c for c in ordem if c not in nome_base]
    if sem_base:
        # O nome do credor na fonte pode ser de pessoa física (empresário individual). Sem base cadastrada não há
        # nome empresarial verificado para publicar: interrompe em vez de expor o nome do credor.
        raise SystemExit(f'Beneficiários sem base cadastrada: {len(sem_base)}. Revisar antes de publicar.')
    # Na interface o nome da base sempre substitui o do credor (ver agregar); publicar só o nome do cadastro.
    beneficiarios = [{'cnpj': c, 'nome': nome_base[c]} for c in ordem]
    pagamentos = [{'cnpj': c, 'ano': a, 'centavos': v[0], 'n': v[1]} for (c, a), v in sorted(soma.items())]
    opcoes = agregar(dados, ANO_INICIAL, ANO_FINAL)['opcoes']
    agora = dt.datetime.now().astimezone()
    return {
        'formato': FORMATO,
        'politica': POLITICA,
        'cobertura': {**{k: dados['cobertura'][k] for k in CAMPOS_COBERTURA}, 'fonte_adquirida_em': FONTE_ADQUIRIDA_EM,
                      'publicado_em': agora.isoformat(timespec='seconds')},
        'selecao': {k: dados['selecao'][k] for k in CAMPOS_SELECAO},
        'bases': bases,
        'beneficiarios': beneficiarios,
        'pagamentos': pagamentos,
        'opcoes': opcoes,
        'snapshot_sha256': manifesto['snapshot_sha256'],
    }


def conferir(publico, dados):
    """Totais do público = totais do snapshot no período, em centavos, por ano e por CNPJ."""
    dados = recortar(dados)
    def por(chave, itens, peso):
        r = collections.Counter()
        for x in itens:
            r[chave(x)] += peso(x)
        return r
    assert por(lambda p: (p['cnpj'], p['ano']), dados['pagamentos'], lambda p: p['centavos']) == \
        por(lambda p: (p['cnpj'], p['ano']), publico['pagamentos'], lambda p: p['centavos'])
    assert sum(p['n'] for p in publico['pagamentos']) == len(dados['pagamentos']) == publico['selecao']['incluidos_no_periodo']
    assert len(publico['bases']) == len(dados['bases'])
    assert all(ANO_INICIAL <= p['ano'] <= ANO_FINAL for p in publico['pagamentos'])
    total = sum(p['centavos'] for p in publico['pagamentos'])
    return {'pagamentos': len(dados['pagamentos']), 'centavos': total, 'bases': len(publico['bases']),
            'raizes': len({b['cnpj'][:8] for b in publico['bases']}), 'beneficiarios': len(publico['beneficiarios'])}


def main(pasta_snapshot, pasta_saida):
    dados, manifesto = carregar_snapshot(pasta_snapshot)
    publico = exportar(dados, manifesto)
    resumo = conferir(publico, dados)
    saida = Path(pasta_saida)
    (saida / 'dados').mkdir(parents=True, exist_ok=True)
    destino = saida / 'dados' / 'observatorio.json'
    destino.write_text(json.dumps(publico, ensure_ascii=False, separators=(',', ':')))
    ref = ROOT / 'api' / 'dados_referencia'
    for nivel, arquivo in MALHAS.items():
        shutil.copyfile(ref / arquivo, saida / 'dados' / f'malha_{nivel}.geojson')
    print(json.dumps({**resumo, 'arquivo': str(destino), 'sha256': sha(destino)}, ensure_ascii=False))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
