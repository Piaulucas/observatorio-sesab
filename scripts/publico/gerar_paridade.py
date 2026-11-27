"""Gera respostas esperadas da API (api.estatistica_local.agregar) para comparar com o build público."""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]; sys.path.insert(0, str(ROOT))
from api.estatistica_local import agregar
sys.path.insert(0, str(Path(__file__).resolve().parent))
from exportar_publico import ANO_FINAL, ANO_INICIAL, recortar
dados = recortar(json.loads((Path(sys.argv[1]) / 'dados.json').read_text()))
casos = []
anos = [(a, b) for a in range(ANO_INICIAL, ANO_FINAL + 1) for b in range(a, ANO_FINAL + 1)]
for a, b in anos: casos.append({'ano_inicial': a, 'ano_final': b})
macros = sorted({x['territorio']['macro_id'] for x in dados['bases'] if x['territorio']['macro_id']}) + ['fora_da_bahia', 'inexistente']
for m in macros:
    for a, b in [(ANO_INICIAL, ANO_FINAL), (2025, 2025), (2026, 2026)]: casos.append({'ano_inicial': a, 'ano_final': b, 'macro': m})
for c in sorted({x['territorio']['cod_ibge'] for x in dados['bases'] if x['territorio']['cod_ibge']}): casos.append({'ano_inicial': ANO_INICIAL, 'ano_final': ANO_FINAL, 'municipio': c})
for r in sorted({x['territorio']['regiao_id'] for x in dados['bases'] if x['territorio']['regiao_id']}): casos.append({'ano_inicial': ANO_INICIAL, 'ano_final': 2026, 'regiao': r})
raizes = sorted({x['cnpj'][:8] for x in dados['bases']})
for e in raizes: casos.append({'ano_inicial': ANO_INICIAL, 'ano_final': ANO_FINAL, 'empresa': e}); casos.append({'ano_inicial': 2024, 'ano_final': 2025, 'empresa': e})
for x in dados['bases']: casos.append({'ano_inicial': ANO_INICIAL, 'ano_final': ANO_FINAL, 'empresa': x['cnpj']})
for m in macros[:4]:
    for e in raizes[:12]: casos.append({'ano_inicial': ANO_INICIAL, 'ano_final': 2026, 'macro': m, 'empresa': e})
saida = []
for c in casos:
    r = agregar(dados, c['ano_inicial'], c['ano_final'], c.get('municipio'), c.get('regiao'), c.get('empresa'), c.get('macro'))
    for k in ('cobertura', 'politica', 'selecao'): r.pop(k)
    saida.append({'filtro': c, 'resposta': r})
Path(sys.argv[2]).write_text(json.dumps(saida, ensure_ascii=False))
print(len(saida))
