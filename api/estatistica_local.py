"""Análise estatística opt-in, somente loopback e snapshot privado. Não lê pagamentos no banco."""
import hashlib
import json
import os
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Query, Request

router = APIRouter(prefix='/painel/estatistica-local', tags=['Estatística local'])


def proteger(request: Request):
    host = urlsplit('http://' + request.headers.get('host', '')).hostname
    origin = request.headers.get('origin')
    if (os.environ.get('OBSERVATORIO_ESTATISTICA_LOCAL') != '1'
        or not request.client or request.client.host not in ('127.0.0.1', '::1')
        or host not in ('127.0.0.1', 'localhost', '::1')
        or (origin and urlsplit(origin).hostname not in ('127.0.0.1', 'localhost', '::1'))
        or request.headers.get('sec-fetch-site') == 'cross-site'):
        raise HTTPException(404, 'Recurso local indisponível.')


def carregar():
    try:
        path = Path(os.environ['OBSERVATORIO_ESTATISTICA_ARQUIVO'])
        raw = path.read_bytes()
        manifest = json.loads(path.with_name('manifesto.json').read_text())
        if hashlib.sha256(raw).hexdigest() != manifest['snapshot_sha256']:
            raise ValueError('integridade')
        data = json.loads(raw)
        if data['politica'] != 'estatistica-local-v1':
            raise ValueError('politica')
        return data
    except (KeyError, OSError, ValueError):
        raise HTTPException(503, 'Snapshot estatístico local ausente ou inválido. Gere-o novamente.')


def agregar(data, ini, fim, municipio=None, regiao=None, empresa=None, macro=None):
    if ini > fim:
        raise HTTPException(422, 'Período inicial posterior ao final.')
    bases = data['bases']
    by_cnpj = {b['cnpj']: b for b in bases}

    def matches(b):
        t = b['territorio']
        return (not municipio or t['cod_ibge'] == municipio) and (not regiao or t['regiao_id'] == regiao) and (not macro or (t.get('situacao_geografica') == 'fora_da_bahia' if macro == 'fora_da_bahia' else t['macro_id'] == macro)) and (not empresa or (b['cnpj'] == empresa or b['cnpj'][:8] == empresa))

    selected = [b for b in bases if matches(b)]
    keys = {b['cnpj'] for b in selected}
    geo = bool(municipio or regiao or macro)
    payments = [p for p in data['pagamentos'] if ini <= p['ano'] <= fim and (not empresa or (p['cnpj'] == empresa or p['cnpj'][:8] == empresa)) and (not geo or p['cnpj'] in keys)]
    total = sum(p['centavos'] for p in payments)
    receivers = {p['cnpj'] for p in payments}
    units = {p['cnpj']: p['nome'] for p in data['pagamentos'] if (not empresa or (p['cnpj'] == empresa or p['cnpj'][:8] == empresa)) and (not geo or p['cnpj'] in keys)}
    units.update({b['cnpj']: b['nome'] for b in selected})
    annual = []
    for year in range(ini, fim + 1):
        subset = [p for p in payments if p['ano'] == year]
        documented = [b for b in selected if b.get('primeiro_ato') and b['primeiro_ato'][:4] <= str(year)]
        por_raiz = {}
        for p in subset:
            por_raiz[p['cnpj'][:8]] = por_raiz.get(p['cnpj'][:8], 0) + p['centavos']
        ano_total = sum(por_raiz.values())
        top5 = sum(sorted(por_raiz.values(), reverse=True)[:5])
        annual.append({'ano': year, 'centavos': ano_total, 'beneficiarios': len({p['cnpj'] for p in subset}), 'empresas': len(por_raiz), 'participacao_top5': round(100 * top5 / ano_total, 1) if ano_total else 0, 'bases_documentadas': len(documented), 'raizes_documentadas': len({b['cnpj'][:8] for b in documented}), 'parcial': year == 2026})
    rows = []
    for cnpj, name in units.items():
        subset = [p for p in payments if p['cnpj'] == cnpj]
        value = sum(p['centavos'] for p in subset)
        b = by_cnpj.get(cnpj)
        rows.append({'cnpj': cnpj, 'nome': name, 'raiz_cnpj': cnpj[:8], 'bases': 1 if b else 0, 'municipio': b['municipio'] if b else None, 'centavos': value, 'pagamentos': len(subset), 'participacao': (100 * value / total) if total else 0, 'anual': [{'ano': y, 'centavos': sum(p['centavos'] for p in subset if p['ano'] == y)} for y in range(ini, fim + 1)]})
    # Histórico completo sob os mesmos filtros cadastrais; período só recorta indicadores/ranking.
    all_payments = [p for p in data['pagamentos'] if (not empresa or p['cnpj'] == empresa or p['cnpj'][:8] == empresa) and (not geo or p['cnpj'] in keys)]
    dates = [int(b['primeiro_ato'][:4]) for b in bases if b.get('primeiro_ato')]
    first = min([p['ano'] for p in data['pagamentos']] + dates)
    last = max(p['ano'] for p in data['pagamentos'])
    historico = []
    for y in range(first, last + 1):
        documented = {b['cnpj'][:8] for b in selected if b.get('primeiro_ato') and int(b['primeiro_ato'][:4]) <= y}
        historico.append({'ano': y, 'raizes_documentadas': len(documented),
                          'centavos': sum(p['centavos'] for p in all_payments if p['ano'] == y) if y >= int(data['cobertura'].get('inicio', '2019')[:4]) else None,
                          'parcial': y == int(data['cobertura'].get('fim', '2026')[:4])})
    companies = []
    for root in sorted({c[:8] for c in units}):
        members = [r for r in rows if r['cnpj'][:8] == root]
        bs = [b for b in selected if b['cnpj'][:8] == root]
        ps = [p for p in all_payments if p['cnpj'][:8] == root]
        value = sum(r['centavos'] for r in members)
        companies.append({'cnpj': root, 'nome': members[0]['nome'], 'cnpjs': [r['cnpj'] for r in members],
                          'bases': len(bs), 'municipio': ', '.join(sorted({b['municipio'] for b in bs if b.get('municipio')})) or None,
                          'localizacoes': [{'cnpj': b['cnpj'], 'municipio': b['municipio'], 'uf': b['territorio'].get('uf'), 'uf_origem': b['territorio'].get('uf_origem'), 'primeiro_ato': b.get('primeiro_ato')} for b in bs],
                          'centavos': value, 'pagamentos': sum(r['pagamentos'] for r in members), 'participacao': 100 * value / total if total else 0,
                          'anual': [{'ano': y, 'centavos': sum(p['centavos'] for p in ps if p['ano'] == y)} for y in range(int(data['cobertura'].get('inicio', '2019')[:4]), last + 1)]})
    companies.sort(key=lambda r: (-r['centavos'], r['cnpj']))
    rows.sort(key=lambda r: (-r['centavos'], r['cnpj']))
    groups = {}
    outside = []
    unknown = []
    for b in selected:
        t = b['territorio']
        if t['macro_id']:
            groups.setdefault(t['macro_id'], []).append(b)
        elif t.get('situacao_geografica') == 'fora_da_bahia':
            outside.append(b)
        else:
            unknown.append(b)
    def area(key, name, bs):
        return {'id': key, 'nome': name, 'centavos': sum(p['centavos'] for p in payments if p['cnpj'] in {b['cnpj'] for b in bs}), 'bases': len(bs), 'empresas': len({b['cnpj'][:8] for b in bs}), 'municipios_com_base': len({b['territorio']['cod_ibge'] for b in bs if b['territorio']['cod_ibge']})}
    return {
        'cobertura': data['cobertura'], 'politica': data['politica'], 'selecao': data['selecao'],
        'cadastro': {'bases': len(selected), 'raizes_cnpj': len({b['cnpj'][:8] for b in selected}), 'municipios': len({b['territorio']['cod_ibge'] for b in selected if b['territorio']['cod_ibge']}), 'bases_sem_data_documental': sum(not b.get('primeiro_ato') for b in selected)},
        'financeiro': {'centavos': total, 'pagamentos': len(payments), 'beneficiarios': len(receivers), 'empresas': len({c[:8] for c in receivers}), 'pagamentos_sem_base_associada': sum(p['cnpj'] not in by_cnpj for p in payments)},
        'anual': annual, 'historico': historico, 'empresas': companies, 'beneficiarios': rows,
        'mapa': {'nivel': 'macrorregioes', 'areas': [area(k, bs[0]['territorio']['macro'], bs) for k, bs in sorted(groups.items())], 'fora_da_bahia': area('fora_da_bahia', 'Fora da Bahia', outside), 'sem_informacao_geografica': len(unknown)},
        'opcoes': {'macrorregioes': [{'id': k, 'nome': v} for k, v in sorted({b['territorio']['macro_id']: b['territorio']['macro'] for b in bases if b['territorio']['macro_id']}.items())], 'empresas': [{'cnpj': k, 'nome': v} for k, v in sorted({**{p['cnpj'][:8]: p['nome'] for p in data['pagamentos']}, **{b['cnpj'][:8]: b['nome'] for b in bases}}.items(), key=lambda x: x[1])], 'municipios': [{'id': k, 'nome': v} for k, v in sorted({b['territorio']['cod_ibge']: b['municipio'] for b in bases if b['territorio']['cod_ibge']}.items(), key=lambda x: x[1])], 'regioes': [{'id': k, 'nome': v} for k, v in sorted({b['territorio']['regiao_id']: b['territorio']['regiao'] for b in bases if b['territorio']['regiao_id']}.items(), key=lambda x: x[1])]},
    }


@router.get('')
def consultar(request: Request, ano_inicial: int = Query(2019, ge=2019, le=2026), ano_final: int = Query(2026, ge=2019, le=2026), municipio: str | None = Query(None, pattern=r'^\d{7}$'), regiao: str | None = Query(None, max_length=80), empresa: str | None = Query(None, pattern=r'^(?:\d{8}|\d{14})$'), macro: str | None = Query(None, max_length=80)):
    proteger(request)
    return agregar(carregar(), ano_inicial, ano_final, municipio, regiao, empresa, macro)
