"""Confere o índice Git contra a seleção pública; não acessa banco ou rede."""
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def conferir():
    permitidos = json.loads((ROOT / 'publicacao/arquivos.json').read_text())
    assert len(permitidos) == len(set(permitidos)), 'Lista duplicada'
    indice = subprocess.check_output(['git', 'ls-files', '-s', '-z'], cwd=ROOT).split(b'\0')
    arquivos = {}
    for entrada in filter(None, indice):
        meta, nome = entrada.split(b'\t', 1)
        modo, objeto, estagio = meta.decode().split()
        nome = nome.decode()
        assert modo in ('100644', '100755') and estagio == '0', 'Modo ou estágio não permitido'
        arquivos[nome] = subprocess.check_output(['git', 'cat-file', 'blob', objeto], cwd=ROOT)
    assert set(arquivos) == set(permitidos), 'Índice difere da lista pública'
    padroes = [
        r'gh[pousr]_[A-Za-z0-9_]{20,}', r'github_pat_[A-Za-z0-9_]{20,}',
        r'AKIA[0-9A-Z]{16}', r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
        r'(?:postgres(?:ql)?|https?)://[^\s/:]+:[^\s/@]+@',
        r'\b\d{3}\.\d{3}\.\d{3}-\d{2}\b', r'/' + r'Users/[^/\s]+/',
        r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',
    ]
    for nome, bruto in arquivos.items():
        assert not (ROOT / nome).is_symlink(), 'Atalho local não permitido'
        assert (ROOT / nome).read_bytes() == bruto, 'Índice desatualizado: ' + nome
        texto = bruto.decode('utf-8')
        for padrao in padroes:
            assert not re.search(padrao, texto), 'Revisar padrão sensível em: ' + nome
    d = json.loads(arquivos['web/publico/estatico/dados/observatorio.json'])
    assert set(d) == {'formato','politica','cobertura','selecao','bases','beneficiarios','pagamentos','opcoes','snapshot_sha256'}
    assert d['formato'] == 'observatorio-publico-v1'
    assert d['politica'] == 'selecao-estatistica-conservadora-v1'
    assert set(d['cobertura']) == {'inicio','fim','snapshot_em','fonte','fonte_url','observacao','fonte_adquirida_em','publicado_em'}
    assert set(d['selecao']) == {'importados','incluidos','excluidos','centavos_excluidos','motivos_sobrepostos'}
    assert set(d['opcoes']) == {'macrorregioes','empresas','municipios','regioes'}
    for opcoes in d['opcoes'].values():
        for opcao in opcoes:
            assert set(opcao) in ({'id','nome'}, {'cnpj','nome'})
    territorio = {'cod_ibge','municipio_ibge','uf','uf_origem','regiao_id','regiao','macro_id','macro','situacao_geografica'}
    for b in d['bases']:
        assert set(b) == {'cnpj','nome','municipio','territorio','primeiro_ato'}
        assert set(b['territorio']) == territorio
    for b in d['beneficiarios']:
        assert set(b) == {'cnpj','nome'}
    for b in d['bases'] + d['beneficiarios'] + d['pagamentos']:
        assert re.fullmatch(r'\d{14}', b['cnpj']), 'CNPJ fora do formato'
    chaves = []
    for p in d['pagamentos']:
        assert set(p) == {'cnpj','ano','centavos','n'}
        assert type(p['ano']) is int and 2019 <= p['ano'] <= 2026
        assert type(p['centavos']) is int and p['centavos'] >= 0
        assert type(p['n']) is int and p['n'] > 0
        chaves.append((p['cnpj'], p['ano']))
    assert len(chaves) == len(set(chaves)), 'Agregado duplicado'
    assert sum(p['n'] for p in d['pagamentos']) == d['selecao']['incluidos']
    print(json.dumps({'resultado':'aprovado','arquivos':len(arquivos),'bases':len(d['bases']),
        'agregados':len(d['pagamentos']),'pagamentos_selecionados':sum(p['n'] for p in d['pagamentos']),
        'centavos':sum(p['centavos'] for p in d['pagamentos']),
        'manifesto_sha256':hashlib.sha256(arquivos['publicacao/arquivos.json']).hexdigest()}, ensure_ascii=False))


if __name__ == '__main__':
    conferir()
