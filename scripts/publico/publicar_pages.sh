#!/bin/zsh
# Publica web/dist-publico/ num projeto JÁ EXISTENTE do Cloudflare Pages (plano gratuito, upload direto).
# Pré-requisitos: `npx wrangler@4 login` feito pelo responsável; build gerado e aprovado pela guarda.
# Uso: scripts/publico/publicar_pages.sh <nome-do-projeto>
set -euo pipefail
RAIZ="${0:A:h:h:h}"
PROJETO="${1:?informe o nome do projeto Pages}"
DIST="$RAIZ/web/dist-publico"
"$RAIZ/.venv/bin/python" "$RAIZ/scripts/publico/guarda_publico.py" "$DIST"
# Não cria projeto: só publica se ele já existir na conta autenticada.
npx --yes wrangler@4 pages project list | grep -qw -- "$PROJETO" || { echo "Projeto $PROJETO não encontrado na conta."; exit 1; }
npx --yes wrangler@4 pages deploy "$DIST" --project-name "$PROJETO" --branch main --commit-dirty=true
