# Histórico de versões

Versões do código da Let's Insights, da mais nova para a mais antiga. Cada versão tem uma tag
(`vX.Y.Z`) no commit de merge e uma Release no GitHub com a lista de PRs.

Como numerar: `feat` sobe o número do meio, `fix` sobe o último, e mudança que quebra o banco ou o
formato do envio sobe o primeiro. Os commits semanais do bot (banco e imagens de cada edição) não
ganham versão, porque são dados e não código. PR só de documentação também não.

As tags de v1.0.0 a v2.0.0 foram criadas depois, em 09/11/2026. Por isso o `package.json` dessas
versões ainda diz 0.1.0 e as Releases delas aparecem publicadas nessa data. A data que vale é a do
commit, que está abaixo.

## v2.3.0 · 16/11/2026 · Geração pela assinatura do Claude Code

PR #22. O crédito de API virou gargalo, então curadoria e redação passaram para o computador do
Yago, usando a assinatura do Claude Code em vez da API.

- `chamarClaude` chama o `claude -p` local com saída estruturada (`--json-schema`), sem ferramentas e
  sem a chave de API no ambiente, para não cobrar crédito.
- `scripts/rodar-semana.js` (`npm run semana`) roda WF-01, WF-02 e WF-03 em sequência e marca cada
  etapa feita na semana, para a próxima tentativa continuar de onde parou.
- O GitHub Actions perdeu o agendamento e ficou como reserva manual pela API (`CLAUDE_BACKEND=api`).
- Quem dispara é a tarefa agendada `newsletter-semanal` do app Claude (documentado no PR #23).

## v2.2.0 · 10/11/2026 · Pool ordenado por nota de relevância

PR #21. Dentro da janela de idade, cada fonte entrava com as 3 matérias mais novas, não as mais
relevantes. Agora o WF-01 ordena por uma nota (termos do público, tema forte, veículo do público,
descontos para acidente, vídeo, evento e matéria internacional). A quantidade de artigos não muda.
Volta à ordem por data com `WF01_ORDENACAO=data`.

## v2.1.1 · 10/11/2026 · Transporte de passageiros fora

PR #20. Matérias de linhas intermunicipais, viações e ANTT entravam quase toda semana pelo termo
"ônibus". O filtro do WF-01 e a curadoria passaram a barrar transporte de passageiros.

## v2.1.0 · 10/11/2026 · Relatório semanal com sugestões

PR #19. Relatório semanal com os números da edição no E-goi e até 3 sugestões, gerado por uma tarefa
agendada do app Claude e entregue como rascunho no Gmail.

## v2.0.3 · 09/11/2026 · Linha de identidade encurtada

PR #18. A linha que substitui o botão nas versões para clientes ficou mais curta.

## v2.0.2 · 09/11/2026 · Imagem decodificada e matéria paga barrada

PR #17. Endereço de imagem com `&amp;` passou a ser decodificado. A verificação de integridade passou a
barrar matéria paga, e o feed de economia do Estadão saiu.

## v2.0.1 · 09/11/2026 · Identidade do git, Node 24 e limpeza do repositório

PR #16. Os commits do bot deixaram de gravar a identidade no `.git/config`, o Actions passou para o
Node 24 e e-mails de terceiros saíram do repositório.

## v2.0.0 · 03/11/2026 · News segmentada em 7 versões

PRs #12 a #15. Mudança no formato do envio:

- 7 versões por semana: geral comercial, geral para clientes e 5 por segmento (mineração, indústria,
  engenharia, tecnologia, florestal).
- Rascunhos no E-goi por versão, com o segmento salvo de cada uma, e envio sem duplicados entre listas.
- Curadoria no Haiku 5.5.
- Verificação de integridade de conteúdo (página sequestrada, spam, título que não bate com o feed).

## v1.4.0 · 26/10/2026 · API de lote da Claude

PRs #8 a #11. Curadoria e redação pela API de lote (metade do preço), com a geração indo para a
madrugada de segunda.

## v1.3.0 · 22/10/2026 · Coleta segmentada e agendamento no E-goi

PRs #5 a #7. Coleta com trilhas por setor e trilha Brasil, troca para o Sonnet 5.5 e agendamento
automático no E-goi (desligado por padrão).

## v1.2.0 · 28/09/2026 · Geração na segunda-feira

PRs #2 a #4. A geração passou de terça para segunda, para dar folga contra atraso do GitHub e abrir
uma janela de revisão antes do envio.

## v1.1.0 · 18/08/2026 · Lista única e rascunhos no E-goi

Fim da divisão entre artigos principais e cards: uma lista única com o blog e 3 artigos. Rascunhos
"POR PUBLICAR" no E-goi e teste A/B de posição do botão.

## v1.0.0 · 03/07/2026 · Migração para Node + SQLite

Primeira versão em Node.js e GitHub Actions, migrada do N8N Cloud, com o banco SQLite no repositório.
