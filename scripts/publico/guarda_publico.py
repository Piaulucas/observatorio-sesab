"""Guarda do build público: recusa publicar se algo administrativo, privado ou fora da lista sair no pacote."""
import json, re, sys
from pathlib import Path

PROIBIDOS = [r'admin-api', r'/admin/', r'AdminApp', r'Central de Pend', r'estatistica-local', r'127\.0\.0\.1', r'localhost',
             r'postgres', r'psycopg', r'5432', r'5433', r'senha', r'\.pgpass', r'rastro_selecao',
             r'numero_pagamento', r'arquivo_origem', r'cpf', r'orca/', r'/Users/']
PERMITIDOS = {'index.html', '_headers', 'robots.txt', 'dados/observatorio.json', 'dados/malha_macrorregioes.geojson',
              'dados/malha_regioes.geojson', 'dados/malha_municipios.geojson', 'dados/malha_contorno.geojson',
              'og-observatorio.png'}
CHAVES_DADOS = {'formato', 'politica', 'cobertura', 'selecao', 'bases', 'beneficiarios', 'pagamentos', 'opcoes', 'snapshot_sha256'}


def main(pasta):
    pasta = Path(pasta)
    erros = []
    arquivos = sorted(p for p in pasta.rglob('*') if p.is_file())
    for p in arquivos:
        rel = p.relative_to(pasta).as_posix()
        if rel not in PERMITIDOS and not re.fullmatch(r'assets/[\w.-]+\.(js|css)', rel):
            erros.append(f'arquivo fora da lista: {rel}')
        if rel.endswith('.geojson'):
            continue
        texto = p.read_text(errors='ignore')
        for padrao in PROIBIDOS:
            # maplibre traz "localhost" em mensagens internas; só falha fora da biblioteca.
            for m in re.finditer(padrao, texto, re.I):
                trecho = texto[max(0, m.start() - 60):m.end() + 60]
                if padrao == 'localhost' and 'maplibre' in texto[:2000].lower():
                    continue
                erros.append(f'{rel}: padrão proibido {padrao!r} em …{trecho!r}…')
                break
    dados = json.loads((pasta / 'dados/observatorio.json').read_text())
    if set(dados) != CHAVES_DADOS:
        erros.append(f'chaves inesperadas no JSON: {set(dados) ^ CHAVES_DADOS}')
    for p in dados['pagamentos']:
        if set(p) != {'cnpj', 'ano', 'centavos', 'n'} or not re.fullmatch(r'\d{14}', p['cnpj']):
            erros.append('pagamento fora do formato agregado'); break
    if erros:
        print('\n'.join(erros)); raise SystemExit('GUARDA REPROVOU: não publicar.')
    print(json.dumps({'guarda': 'aprovada', 'arquivos': len(arquivos), 'tamanho_kb': round(sum(p.stat().st_size for p in arquivos) / 1024)}))


if __name__ == '__main__':
    main(sys.argv[1])
