"""Guarda do build público: recusa publicar se algo administrativo, privado ou fora da lista sair no pacote."""
import json, re, struct, sys, zlib
from pathlib import Path

PROIBIDOS = [r'admin-api', r'/admin/', r'AdminApp', r'Central de Pend', r'estatistica-local', r'127\.0\.0\.1', r'localhost',
             r'postgres', r'psycopg', r'5432', r'5433', r'senha', r'\.pgpass', r'rastro_selecao',
             r'numero_pagamento', r'arquivo_origem', r'cpf', r'orca/', r'/Users/']
PERMITIDOS = {'index.html', '_headers', 'robots.txt', 'dados/observatorio.json', 'dados/malha_macrorregioes.geojson',
              'dados/malha_regioes.geojson', 'dados/malha_municipios.geojson', 'dados/malha_contorno.geojson',
              'og-observatorio.png'}
CHAVES_DADOS = {'formato', 'politica', 'cobertura', 'selecao', 'bases', 'beneficiarios', 'pagamentos', 'opcoes', 'snapshot_sha256'}


BLOCOS_PNG = {b'IHDR', b'PLTE', b'IDAT', b'IEND', b'tRNS', b'gAMA', b'cHRM', b'sRGB', b'sBIT', b'pHYs'}


def erro_png(bruto):
    """Imagem é binária: busca de texto nos pixels dá falso positivo. Confere a estrutura: só blocos de imagem (sem
    metadados), CRCs corretos, nada depois do fim e nenhum byte sobrando dentro dos pixels. None = aprovada."""
    if bruto[:8] != b'\x89PNG\r\n\x1a\n' or len(bruto) > 2_000_000:
        return 'não é PNG ou é grande demais'
    i, tipos, pixels, cabecalho = 8, [], b'', b''
    while i + 12 <= len(bruto):
        tamanho, tipo = struct.unpack('>I4s', bruto[i:i + 8])
        corpo, fim = bruto[i + 8:i + 8 + tamanho], i + 12 + tamanho
        if tipo not in BLOCOS_PNG or fim > len(bruto) or zlib.crc32(tipo + corpo) != struct.unpack('>I', bruto[fim - 4:fim])[0]:
            return f'bloco não permitido ou corrompido: {tipo!r}'
        tipos.append(tipo)
        cabecalho = corpo if tipo == b'IHDR' else cabecalho
        pixels += corpo if tipo == b'IDAT' else b''
        i = fim
        if tipo == b'IEND':
            break
    if i != len(bruto) or tipos[:1] != [b'IHDR'] or tipos[-1:] != [b'IEND'] or tipos.count(b'IHDR') != 1 or len(cabecalho) != 13:
        return 'estrutura inválida ou conteúdo depois do fim'
    largura, altura, bits, cor, _, _, entrelacado = struct.unpack('>IIBBBBB', cabecalho)
    canais = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}.get(cor)
    if not canais or entrelacado or not 0 < largura <= 4000 or not 0 < altura <= 4000:
        return 'formato de imagem não aceito'
    esperado = altura * (1 + (largura * canais * bits + 7) // 8)
    fluxo = zlib.decompressobj()
    try:
        dados = fluxo.decompress(pixels, esperado + 1)
    except zlib.error:
        return 'pixels corrompidos'
    if not fluxo.eof or fluxo.unused_data or fluxo.unconsumed_tail or len(dados) != esperado:
        return 'bytes sobrando ou faltando nos pixels'
    return None


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
        if rel.endswith('.png'):
            motivo = erro_png(p.read_bytes())
            if motivo:
                erros.append(f'{rel}: {motivo}')
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
