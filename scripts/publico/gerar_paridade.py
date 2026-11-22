"""Gera respostas esperadas da API (api.estatistica_local.agregar) para comparar com o build público."""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]; sys.path.insert(0, str(ROOT))
from api.estatistica_local import agregar
dados = json.loads((Path(sys.argv[1]) / 'dados.json').read_text())
casos = []
anos = [(a, b) for a in range(2019, 2027) for b in range(a, 2027)]
for a, b in anos: casos.append({'ano_inicial': a, 'ano_final': b})
macros = sorted({x['territorio']['macro_id'] for x in dados['bases'] if x['territorio']['macro_id']}) + ['fora_da_bahia', 'inexistente']
for m in macros:
    for a, b in [(2019, 2026), (2025, 2025), (2026, 2026)]: casos.append({'ano_inicial': a, 'ano_final': b, 'macro': m})
for c in sorted({x['territorio']['cod_ibge'] for x in dados['bases'] if x['territorio']['cod_ibge']}): casos.append({'ano_inicial': 2019, 'ano_final': 2026, 'municipio': c})
for r in sorted({x['territorio']['regiao_id'] for x in dados['bases'] if x['territorio']['regiao_id']}): casos.append({'ano_inicial': 2022, 'ano_final': 2026, 'regiao': r})
raizes = sorted({x['cnpj'][:8] for x in dados['bases']})
for e in raizes: casos.append({'ano_inicial': 2019, 'ano_final': 2026, 'empresa': e}); casos.append({'ano_inicial': 2024, 'ano_final': 2025, 'empresa': e})
for x in dados['bases']: casos.append({'ano_inicial': 2019, 'ano_final': 2026, 'empresa': x['cnpj']})
for m in macros[:4]:
    for e in raizes[:12]: casos.append({'ano_inicial': 2020, 'ano_final': 2026, 'macro': m, 'empresa': e})
saida = []
for c in casos:
    r = agregar(dados, c['ano_inicial'], c['ano_final'], c.get('municipio'), c.get('regiao'), c.get('empresa'), c.get('macro'))
    for k in ('cobertura', 'politica', 'selecao'): r.pop(k)
    saida.append({'filtro': c, 'resposta': r})
Path(sys.argv[2]).write_text(json.dumps(saida, ensure_ascii=False))
print(len(saida))
