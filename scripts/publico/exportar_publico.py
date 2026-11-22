"""Exporta o JSON público estático do Observatório a partir de um snapshot estatístico privado.

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

FORMATO = 'observatorio-publico-v1'
CAMPOS_BASE = ('cnpj', 'nome', 'municipio', 'territorio', 'primeiro_ato')
CAMPOS_TERRITORIO = ('cod_ibge', 'municipio_ibge', 'uf', 'uf_origem', 'regiao_id', 'regiao', 'macro_id', 'macro', 'situacao_geografica')
CAMPOS_COBERTURA = ('inicio', 'fim', 'snapshot_em', 'fonte', 'fonte_url', 'observacao')
CAMPOS_SELECAO = ('importados', 'incluidos', 'excluidos', 'centavos_excluidos', 'motivos_sobrepostos')
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
    if dados['politica'] != 'estatistica-local-v1':
        raise SystemExit('Política do snapshot inesperada.')
    return dados, manifesto


def exportar(dados, manifesto):
    bases = [{k: b[k] for k in CAMPOS_BASE} for b in dados['bases']]
    for b in bases:
        b['territorio'] = {k: b['territorio'].get(k) for k in CAMPOS_TERRITORIO}
        assert re.fullmatch(r'\d{14}', b['cnpj'])
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
    opcoes = agregar(dados, 2019, 2026)['opcoes']
    agora = dt.datetime.now().astimezone()
    return {
        'formato': FORMATO,
        'politica': 'selecao-estatistica-conservadora-v1',  # mesma regra do snapshot estatistica-local-v1
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
    """Totais do público = totais do snapshot, em centavos, por ano e por CNPJ."""
    def por(chave, itens, peso):
        r = collections.Counter()
        for x in itens:
            r[chave(x)] += peso(x)
        return r
    assert por(lambda p: (p['cnpj'], p['ano']), dados['pagamentos'], lambda p: p['centavos']) == \
        por(lambda p: (p['cnpj'], p['ano']), publico['pagamentos'], lambda p: p['centavos'])
    assert sum(p['n'] for p in publico['pagamentos']) == len(dados['pagamentos']) == publico['selecao']['incluidos']
    assert len(publico['bases']) == len(dados['bases'])
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
