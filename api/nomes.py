"""Nome de exibição das bases (nome fantasia revisado pelo responsável em 26/11/2026).

Fonte única do painel público e da Central: api/dados_referencia/nomes_exibicao.csv (CNPJ de 14 dígitos). Sem entrada,
vale a razão social, que continua sendo o dado cadastral e aparece sempre no detalhe. Nada é gravado no banco.
"""
import csv
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

ARQUIVO = Path(__file__).resolve().parent / 'dados_referencia' / 'nomes_exibicao.csv'


def _digitos(s):
    return re.sub(r'\D', '', s or '')


def _normal(s):
    return ''.join(c for c in unicodedata.normalize('NFKD', s.casefold()) if not unicodedata.combining(c))


@lru_cache(maxsize=1)
def tabela() -> dict[str, str]:
    with ARQUIVO.open(encoding='utf-8', newline='') as fh:
        linhas = list(csv.DictReader(fh))
    nomes = {l['cnpj']: l['nome_proposto'].strip() for l in linhas}
    if len(nomes) != len(linhas) or any(not re.fullmatch(r'\d{14}', c) or not n for c, n in nomes.items()):
        raise ValueError('nomes_exibicao.csv: CNPJ repetido, inválido ou nome vazio')
    return nomes


def exibicao(cnpj: str | None, reserva: str | None = None) -> str | None:
    return tabela().get(_digitos(cnpj)) or reserva


def por_raiz(raiz: str | None, reserva: str | None = None) -> str | None:
    """Nome da empresa (raiz): o da matriz quando listada, senão o primeiro CNPJ da raiz."""
    cnpjs = sorted(c for c in tabela() if c[:8] == raiz)
    return tabela()[cnpjs[0]] if cnpjs else reserva


def buscar(texto: str) -> list[str]:
    """CNPJs (14 dígitos) cujo nome de exibição contém o texto, sem acento nem caixa."""
    alvo = _normal(texto.strip())
    return sorted(c for c, n in tabela().items() if alvo and alvo in _normal(n))
