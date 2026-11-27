# Observatório SESAB

Documentação técnica complementar à [apresentação do projeto](../README.md).

[Ver a demonstração pública](https://observatorio-sesab.pages.dev/)

## Da pesquisa documental à pergunta analítica

O projeto reúne pesquisa documental e análise de dados sobre empresas e bases vinculadas ao Credenciamento SESAB nº 002/2013, de remoção terrestre em ambulância na Bahia. A construção local evoluiu de identificação de bases e regras de vínculo de pagamentos para um painel com mapa e ranking.

A pergunta que orienta o projeto é: **como a ampliação do cadastro de empresas se relaciona com a distribuição territorial e financeira dos pagamentos observados?** Uma hipótese a investigar é se mais empresas documentadas acompanharam o crescimento dos recursos ou uma redistribuição entre prestadores. Isso é uma hipótese de trabalho, não uma conclusão demonstrada pelo painel.

## O que o painel permite explorar

O painel combina totais do período, filtros por ano, macrorregião e empresa, mapa das bases por município, ranking empresarial e lista de bases por cidade. Base é o cadastro de um CNPJ completo; empresa é a raiz de oito dígitos. O agrupamento não presume grupo econômico. Os filtros territoriais associam pagamentos ao cadastro somente pelo CNPJ completo.

A cópia pública cobre 2023–2026 e inclui 50 bases e 100 agregados de pagamentos por CNPJ e ano. Esses agregados representam 1.114 pagamentos aprovados e R$ 282.758.196,74 em valores nominais. São números do retrato publicado em 27/11/2026, não totais de toda a SESAB. A fonte cobre pagamentos do período até 28/10/2026; 2026 é parcial.

## Fontes e limitações

- [Portal de Dados Abertos da Bahia — Pagamentos](https://dados.ba.gov.br/dataset/pagamentos): registros FIPLAN; cópia adquirida em 06/11/2026.
- Diário Oficial da Bahia (DOOL/EGBA): origem documental dos atos e termos pesquisados. O acervo e as evidências de conferência não integram este repositório.
- SESAB, PDR 2026, e IBGE: regionalização da saúde e malha municipal utilizadas no mapa. As malhas derivadas publicadas estão separadas dos dados financeiros.

Os totais somam somente pagamentos aprovados na conferência; os que aguardam revisão e os excluídos ficam de fora. A aprovação não equivale a homologação oficial nem a auditoria financeira. Os pagamentos são agrupados pelo ano em que foram pagos, não pela competência do serviço, e não têm correção monetária.

O mapa usa o município cadastral da base: não demonstra local de execução nem cobertura assistencial. O cadastro de bases com primeiro termo documentado não mede prestadores ativos em cada ano. Ausência de pagamento aprovado não demonstra ausência de serviço. As fontes e lacunas impedem inferir causalidade entre expansão do cadastro e distribuição financeira.

## Decisões técnicas

A versão pública usa React, TypeScript e Vite, com o mapa desenhado em SVG sobre as malhas do IBGE. Um exportador Python copia campos permitidos e agrega pagamentos por CNPJ e ano; a soma é conferida em centavos. O navegador calcula os filtros sobre esse JSON. O build estático do Cloudflare Pages dispensa acesso ao PostgreSQL e à aplicação administrativa.

O repositório contém uma seleção do código necessário para essa versão: interface pública, agregação em Python e TypeScript, exportação, guarda do pacote e testes. O ambiente operacional completo, a API administrativa, as migrações e o pipeline histórico permanecem fora desta publicação.

## Executar a versão pública

Requer Node.js com npm. Na pasta `web`:

```sh
npm ci
npm run test:publico
npm run build:publico
npx vite preview --config vite.publico.config.ts
```

Acesse `http://127.0.0.1:4180/`. Os arquivos em `web/publico/estatico` são uma cópia agregada fixa, incluída para permitir reprodução sem banco ou credenciais. Use os comandos acima: os demais scripts de `package.json` pertencem ao ambiente local completo.

Para conferir a saída, a partir da raiz, com Python:

```sh
python3 scripts/publico/guarda_publico.py web/dist-publico
```

Para desenvolver o exportador, `uv sync` instala o ambiente Python registrado em `pyproject.toml` e `uv.lock`. A exportação de uma nova cópia exige um snapshot privado de pagamentos aprovados; esse snapshot não é distribuído. O teste de paridade Python/TypeScript depende de arquivos externos e é pulado quando eles não são fornecidos. Os testes sintéticos não precisam desses arquivos.

## Segurança e próximos passos

O versionamento usa lista explícita de arquivos e bloqueia novos arquivos por padrão. Veja [a política de publicação](SEGURANCA.md) e [o inventário](INVENTARIO_PUBLICAVEL.tsv).

Para conferir a seleção de arquivos, a partir da raiz:

```sh
python3 scripts/publico/conferir_repositorio.py
```

O README técnico original foi preservado no computador e não é enviado. A apresentação do projeto está no [README da raiz](../README.md); este documento preserva os detalhes técnicos da versão pública.
