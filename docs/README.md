# Observatório SESAB

Documentação técnica complementar à [apresentação do projeto](../README.md).

[Ver a demonstração pública](https://observatorio-sesab.pages.dev/)

## Da pesquisa documental à pergunta analítica

O projeto reúne pesquisa documental e análise de dados sobre empresas e bases vinculadas ao Credenciamento SESAB nº 002/2013, de remoção terrestre em ambulância na Bahia. A construção local evoluiu de identificação de bases e regras de vínculo de pagamentos para um painel com séries, mapa e ranking.

A pergunta que orienta o projeto é: **como a ampliação do cadastro de empresas se relaciona com a distribuição territorial e financeira dos pagamentos observados?** Uma hipótese a investigar é se mais empresas documentadas acompanharam o crescimento dos recursos ou uma redistribuição entre prestadores. Isso é uma hipótese de trabalho, não uma conclusão demonstrada pelo painel.

## O que o painel permite explorar

O panorama combina evolução anual, filtros por período e território, mapa e ranking empresarial. Base é o cadastro de um CNPJ completo; empresa é a raiz de oito dígitos. O agrupamento não presume grupo econômico. Os filtros territoriais associam pagamentos ao cadastro somente pelo CNPJ completo.

A cópia pública inclui 49 bases e 128 agregados de pagamentos por CNPJ e ano. Esses agregados representam 1.775 lançamentos selecionados e R$ 363.289.297,77 em valores nominais. São números do retrato publicado, não totais de toda a SESAB. A fonte cobre pagamentos observados de 07/02/2019 a 28/10/2026; 2026 é parcial.

## Fontes e limitações

- [Portal de Dados Abertos da Bahia — Pagamentos](https://dados.ba.gov.br/dataset/pagamentos): registros FIPLAN; cópia adquirida em 06/11/2026 e importação registrada em 09/11/2026.
- Diário Oficial da Bahia (DOOL/EGBA): origem documental dos atos e termos pesquisados. O acervo e as evidências de conferência não integram este repositório.
- SESAB, PDR 2026, e IBGE: regionalização da saúde e malha municipal utilizadas no mapa. As malhas derivadas publicadas estão separadas dos dados financeiros.

A seleção estatística conservadora não equivale a homologação ou auditoria individual. Pendências e exclusões não entram automaticamente nos totais. Os pagamentos são agrupados pelo ano em que foram pagos, não pela competência do serviço, e não têm correção monetária.

O mapa usa o município cadastral da base: não demonstra local de execução nem cobertura assistencial. O acúmulo de empresas com primeiro termo documentado não mede prestadores ativos em cada ano. Ausência de pagamento selecionado não demonstra ausência de serviço. As fontes e lacunas impedem inferir causalidade entre expansão do cadastro e distribuição financeira.

## Decisões técnicas

A versão pública usa React, TypeScript, Vite e MapLibre. Um exportador Python copia campos permitidos e agrega pagamentos por CNPJ e ano; a soma é conferida em centavos. O navegador calcula os filtros sobre esse JSON. O build estático do Cloudflare Pages dispensa acesso ao PostgreSQL e à aplicação administrativa.

O repositório contém uma seleção do código necessário para essa versão: interface pública, agregação em Python e TypeScript, exportação, guarda do pacote e testes. O ambiente operacional completo, a API administrativa, as migrações e o pipeline histórico permanecem fora desta publicação.

## Executar a versão pública

Requer Node.js com npm. Na pasta `web`:

```sh
npm ci
npx tsc -p tsconfig.publico.json
npx vitest run --config vite.portfolio.config.ts
npx vite build --config vite.publico.config.ts
npx vite preview --config vite.publico.config.ts
```

Acesse `http://127.0.0.1:4180/`. Os arquivos em `web/publico/estatico` são uma cópia agregada fixa, incluída para permitir reprodução sem banco ou credenciais. Use os comandos acima: os scripts legados de `package.json` pertencem ao ambiente local completo.

Para conferir a saída, a partir da raiz, com Python:

```sh
python3 scripts/publico/guarda_publico.py web/dist-publico
```

Para desenvolver o exportador, `uv sync` instala o ambiente Python registrado em `pyproject.toml` e `uv.lock`. A exportação de uma nova cópia exige um snapshot privado previamente revisado; esse snapshot não é distribuído. O teste de paridade Python/TypeScript depende de arquivos externos e é pulado quando eles não são fornecidos. Os testes sintéticos não precisam desses arquivos.

## Segurança e próximos passos

O versionamento usa lista explícita de arquivos e bloqueia novos arquivos por padrão. Veja [a política de publicação](SEGURANCA.md) e [o inventário](INVENTARIO_PUBLICAVEL.tsv).

O README técnico original foi preservado no computador e não é enviado. A apresentação do projeto está no [README da raiz](../README.md); este documento preserva os detalhes técnicos da versão pública.
