# Política de publicação do código

Esta primeira publicação é uma seleção da versão estática do Observatório SESAB. A lista `publicacao/arquivos.json` define os arquivos admitidos; `.gitignore` recusa arquivos novos por padrão. Inclusões futuras precisam de revisão de conteúdo e atualização explícita da lista.

## Conteúdo admitido

Código da interface pública, tipos e utilitários necessários; testes sintéticos; código de agregação e exportação; malhas territoriais derivadas; JSON agregado já destinado ao site; dependências fixadas e documentação deste recorte.

O JSON admite nomes empresariais, CNPJs de pessoas jurídicas, município, território, primeiro ato documental, cobertura e totais anuais. Não contém CPF, endereço residencial, contato pessoal, identificador de lançamento, processo individual ou credencial. Publicar código não autoriza publicar novas extrações.

## Conteúdo excluído

Dados brutos, bancos e dumps, backups, snapshots privados, relatórios de trabalho, evidências internas e documentos de auditoria; diretórios históricos; cache da Cloudflare; ambientes virtuais; dependências instaladas; builds; configuração operacional e aplicação administrativa. O README técnico local e as instruções internas não são versionados.

A exclusão preserva os arquivos no computador. Não há reescrita nem remoção do acervo local. O histórico Git público começa nesta seleção, pois o diretório não possuía repositório Git.

## Verificação antes de cada envio

Execute `python3 scripts/publico/conferir_repositorio.py`. O verificador compara o índice Git com a lista permitida, rejeita arquivos extras, atalhos e padrões de credencial ou identificação pessoal; também valida o esquema do JSON agregado. Complete a revisão com um detector de segredos atualizado e a guarda do build público.

A inspeção inicial usou Gitleaks 8.30.1, buscas de credenciais e dados pessoais e validação de estrutura dos dados. Relatórios locais detalhados não são publicados. Nenhuma varredura garante ausência absoluta de informação sensível: a seleção por finalidade e a revisão de novos arquivos continuam necessárias.

Os dados de terceiros mantêm a atribuição às fontes. Este pacote não atribui uma licença de redistribuição nova a documentos ou dados externos.
