# Cortex

Um segundo cérebro que roda na sua máquina, escreve Markdown que você consegue
ler no bloco de notas, e tem um caderninho de bolso no celular.

Não é um clone do Obsidian. É o oposto de uma escolha que quase todo app de
notas faz: em vez de um editor genérico onde você inventa a estrutura, o Cortex
**sabe o que é um treino, uma prova, um gasto e um suplemento** — e por saber,
consegue responder "o que disso é meu hoje?" sem que ninguém monte um
dashboard.

```
Você marca "Creatina" no celular, no ônibus, sem sinal.
        ↓ fila no localStorage
        ↓ Supabase (evento, não estado)
        ↓ Cortex puxa e escreve
Diario/2026-09-04.md ganha `suplementos_feitos: [Creatina]`
        ↓ o mesmo arquivo que a lente Saúde já lia
A tela Hoje, no computador, mostra o check — sem código novo.
```

---

## Índice

- [A ideia](#a-ideia)
- [O que ele faz](#o-que-ele-faz)
- [Arquitetura](#arquitetura)
- [O vault: o arquivo é a verdade](#o-vault-o-arquivo-é-a-verdade)
- [O celular](#o-celular)
- [O contrato com a nuvem](#o-contrato-com-a-nuvem)
- [Segurança](#segurança)
- [Rodando](#rodando)
- [Testes](#testes)
- [Mapa do código](#mapa-do-código)
- [Decisões que parecem estranhas e não são](#decisões-que-parecem-estranhas-e-não-são)
- [Estado e licença](#estado)

---

## A ideia

Três regras sustentam tudo:

**1. O arquivo é a verdade.** Não há banco de dados de conteúdo. Tudo é `.md`
com frontmatter YAML numa pasta que você escolhe. Desinstale o Cortex amanhã e
suas notas continuam lá, legíveis, versionáveis em git, abríveis por qualquer
editor. O SQLite existe só como **índice descartável** — apague
`.vault/index.db` e ele se reconstrói do zero lendo os arquivos.

**2. Tipo em vez de tag.** Uma nota declara `tipo: prova` no frontmatter, e a
partir daí o app sabe que ela tem data, matéria e um campo `estudado`. É isso
que permite a tela Hoje existir: ela não é uma lente a mais, é o **corte
transversal** de todas as outras no dia de hoje.

**3. O celular só escreve; o computador só lê.** O app web não edita, não
apaga, não lê histórico — ele empilha eventos. Quem interpreta evento e escreve
Markdown é o Cortex, num lugar só. Assim não existem duas implementações da
mesma regra para divergirem.

---

## O que ele faz

### Seis lentes

| Lente | O que ela responde |
|---|---|
| **Hoje** | O que disso tudo é de hoje — treino, suplementos, tarefas do dia, anotações, dieta, gastos, compromissos |
| **Saúde** | Treinos (modelo × sessão), cardio, medidas, dieta, suplementos, hidratação |
| **Conhecimento** | Conteúdos, provas, simulados, redações, tarefas, livros |
| **Grana** | Transações, categorias, e o porquinho com meta |
| **Vida** | Anotações, metas, compras, contas e senhas, pessoas, documentos |
| **Dev** | Projetos, código, rodar o projeto dentro do app, abrir no VS Code |

Mais um **calendário** que junta tudo que tem data.

### 26 tipos de nota

`treino-modelo` · `sessao` · `cardio` · `medida` · `plano` · `suplemento` ·
`hidratacao` · `consulta` · `materia` · `prova` · `simulado` · `redacao` ·
`tarefa` · `livro` · `porquinho` · `meta-cofre` · `objetivo` · `rotina` ·
`anotacao` · `compra` · `pessoa` · `documento` · `conta` · `evento` ·
`projeto` · `nota`

Cada um com formulário próprio, pasta de destino própria e regra de nome
própria — declarados numa tabela em `src/renderer/formularios.tsx`, e não
espalhados em `if`s pelo código.

### Modelo × registro

A distinção que faz o resto funcionar:

- **`treino-modelo`** é a estrutura ("Push A tem supino, desenvolvimento,
  tríceps"). **`sessao`** é o que aconteceu hoje, com as cargas. Mexer numa
  sessão nunca mexe no modelo — é o que deixa você variar um treino sem
  reescrever a rotina.
- **`plano`** define as refeições; o **diário do dia** guarda quais você
  marcou. Como cada dia é um arquivo, virar o dia limpa os checks sozinho e o
  dia anterior fica gravado.
- **`rotina`** se repete todo dia e vive no Hoje; **`tarefa`** tem prazo e vive
  em Chegando. Duas coisas diferentes, dois tipos diferentes.

### Painéis trancados

Contas, senhas e documentos podem ficar **cifrados no disco** (AES-256-GCM,
chave-mestra envelopada por scrypt). Trocar a senha reembrulha a chave-mestra —
nada no vault é reescrito. A alternativa (derivar a chave direto da senha)
exigiria decifrar e recifrar todo arquivo trancado num laço de milhares de
escritas que, interrompido por uma queda de energia, deixaria metade do vault
com uma chave e metade com outra. Ver `src/main/cifra.ts`, que também documenta
o que isso **não** protege.

---

## Arquitetura

```
┌─────────────────────────── Electron ────────────────────────────┐
│                                                                 │
│  renderer (React 19)          │  main (Node)                    │
│  ─────────────────────        │  ─────────────                  │
│  App.tsx  · useVault          │  index.ts   · session           │
│  6 lentes + calendário        │  vault/     · escrita atômica   │
│  formularios.tsx (tabela)     │  index/     · SQLite + FTS5     │
│  dados.ts (leituras puras)    │  parser/    · frontmatter,      │
│                               │               wikilinks, tasks  │
│         ↕ IPC tipado          │  nuvem/     · Supabase          │
│      (zod nos dois lados)     │  cifra/cofre/senha              │
│                               │                                 │
└─────────────────────────────────────────────────────────────────┘
                    ↕ shared/ (o contrato)
┌─────────────────────────── web/ (PWA) ──────────────────────────┐
│  Vite 7 · React 19 · fila em localStorage · sem SDK             │
└─────────────────────────────────────────────────────────────────┘
```

**Stack:** Electron 43 · React 19 · TypeScript · zod 4 · better-sqlite3 13 ·
chokidar 5 · gray-matter · Vite 7 · vitest 4. Sem framework de UI, sem
biblioteca de ícones, sem cliente de estado. ~16.500 linhas.

O `src/shared/` é importado pelos **três** lados (main, renderer, web). Mudar
um campo lá quebra a compilação de todo mundo de uma vez — que é exatamente o
que se quer. A alternativa é os três divergirem em silêncio e o dado chegar
torto.

---

## O vault: o arquivo é a verdade

```
meu-vault/
├── .vault/
│   ├── config.json        áreas, id do vault, painéis trancados
│   ├── index.db           SQLite — descartável, reconstruído dos arquivos
│   └── recebidos.json     ids de eventos já aplicados (idempotência)
├── Diario/2026-09-04.md   um arquivo por dia
├── Saude/ Estudos/ Grana/ Vida/ Agenda/ Dev/ Anexos/
```

Uma nota típica:

```markdown
---
tipo: rotina
titulo: Escada 30 min
dias: [seg, ter, qua, qui, sex]
---

Trinta minutos, de segunda a sexta.
```

E o diário, que é onde o dia acontece:

```markdown
---
tipo: diario
date: '2026-09-04'
agua_ml: 3200
rotinas_feitas:
  - Esteira 30 min
suplementos_feitos: [Creatina, Vitamina D]
---

## Como foi o dia
```

**O índice.** `chokidar` observa a pasta; toda gravação reindexa a nota
alterada em SQLite, com FTS5 para a busca. O índice guarda metadados e o corpo
— nunca é a fonte. Toda escrita passa por `vault/patch.ts`, que verifica que o
caminho é descendente da raiz do vault e grava de forma atômica (temporário +
rename).

**Wikilinks** `[[assim]]` são resolvidos por título e por caminho, com o grafo
guardado no índice — é o que faz "notas que apontam para esta" funcionar.

---

## O celular

Um PWA em `web/`. Instala na tela de início, abre sem barra de endereço,
funciona sem sinal.

**O que ele tem:** a tela Hoje (suplementos, hidratação, tarefas do dia,
anotações, refeições, com check), e telas de registro rápido — treino, cardio,
peso e medidas, gasto, porquinho, anotação. Mais agenda e um leitor de QR para
parear com o Cortex.

**O que ele não tem, de propósito:** ler histórico, editar, apagar, gráficos,
notificação, mais de um usuário.

**Como ele sobrevive ao metrô.** Todo envio entra numa fila no `localStorage`
antes de sair. A fila esvazia ao abrir, quando a rede volta, e a cada 30
segundos. Um item recusado por **erro de dado** sai da fila e vira aviso —
senão um evento que o banco nunca vai aceitar entope a fila para sempre e leva
junto todos os registros seguintes. Um item que falha por **rede** fica e tenta
de novo.

**A campainha.** Realtime do Supabase via WebSocket, protocolo Phoenix escrito
à mão. O toque diz apenas "mudou alguma coisa", nunca o quê: o canal é público,
e ouvir não adianta nada. Um toque feito com o canal fechado fica guardado e
sai quando ele entra — sem isso, marcar algo no celular com a tela apagada era
um toque perdido.

---

## O contrato com a nuvem

Duas tabelas, quatro funções, e uma direção de cada vez.

```
celular  ──registrar_evento──►  eventos    ──listar_eventos──►  Cortex
                                                                  │
celular  ◄──listar_cardapio──   cardapio  ◄─publicar_cardapio─────┘
```

**Evento, não estado.** O celular manda `{ tipo: 'agua', dia: '2026-09-04',
dados: { ml: 800 } }` — um movimento. Quem soma é o Cortex. É isso que torna o
reenvio seguro: `recebidos.json` guarda os ids já aplicados, então o mesmo
evento chegando duas vezes não conta duas vezes.

**O cardápio é lista branca, campo a campo.** `montarCardapio` é a única função
do app que manda dado do vault para fora, e ela declara cada campo que copia.
Nunca `...campos`, nunca um objeto inteiro do frontmatter. Um teste monta um
vault com senha, número de documento, valor de gasto e carga de exercício, e
**falha** se qualquer um aparecer no JSON publicado.

A mesma lista branca existe no banco, dentro de `publicar_cardapio` — porque o
Cortex decide o que publica, mas o banco não tem por que confiar nisso.

---

## Segurança

- **RLS ligado, zero policies.** Todo acesso passa por funções `SECURITY
  DEFINER` que exigem o id do vault. Com a chave publicável na mão e sem o id,
  ler `eventos` direto devolve lista vazia; `listar_eventos` com outro id
  devolve vazio também. Medido contra o projeto real.
- **Só a chave publicável** entra no pacote. Ela é pública por natureza — vive
  dentro do JavaScript que qualquer visitante baixa.
- **O renderer é entrada hostil.** Todo payload de IPC é validado com zod no
  processo main; todo caminho é verificado como descendente da raiz do vault.
- **A Vida fica local.** Documento, senha, conta e compra não sobem. Nunca.
- **O app não abre a própria pasta de dados como vault** — nem nada acima dela.
  Parece detalhe e não é: um vault fantasma nasce com um **id novo**, e aí o
  celular publica num id enquanto o Cortex escuta outro. As duas pontas
  funcionando, conversando com bancos diferentes, e nada na tela dizendo por
  quê. Ver `src/main/caminhos.ts`.

---

## Rodando

Requer Node 20+. O `better-sqlite3` usa binários N-API prebuilt — **não**
precisa de Python nem das Build Tools do Visual Studio.

```bash
npm install
cp .env.example .env      # opcional: só para a sincronização com o celular
npm run dev
```

O app web:

```bash
cp web/.env.example web/.env
npm run web:dev           # o Vite mostra o IP da rede local
```

Gerar o instalador do Windows:

```bash
npm run dist              # roda os testes, compila e empacota
```

**Supabase** é opcional — o Cortex funciona inteiro sem nuvem. Para ligar o
celular: crie um projeto, cole `supabase/schema.sql` no SQL Editor, e ponha URL
+ chave publicável nos dois `.env`. Detalhes em
[`supabase/README.md`](supabase/README.md) e [`web/LEIAME.md`](web/LEIAME.md).

---

## Testes

**41 arquivos, 713 testes**, rodando em ~18 s.

```bash
npm test
```

Não há teste de "a função devolve o que ela devolve". Cada teste tem um nome
que é uma frase em português dizendo o que está sendo garantido, e vários
carregam um comentário explicando **o defeito real** que os fez existir:

> `o toque feito com o canal fechado sai quando ele entra` — "Este é o caso do
> celular: tela apagada e app em segundo plano fazem o navegador suspender o
> websocket (…) O toque era descartado aí, e o outro lado só descobria no
> relógio de dois minutos."

> `nome que só COMEÇA igual não conta como conter` — "`Cortex2` não é
> `Cortex`, mas uma comparação por prefixo de texto diria que sim — e proibiria
> um vault legítimo por causa do nome."

Quando um teste morre numa refatoração, o comentário é o que diz se você acabou
de reintroduzir um bug antigo.

---

## Mapa do código

```
src/
  main/
    index.ts          bootstrap, janela, abertura de vault
    session.ts        vault aberto: db + watcher + config
    caminhos.ts       o que não pode ser aberto como vault
    vault/            escrita atômica, patch, watcher
    index/            SQLite, indexer, queries, FTS
    parser/           frontmatter, wikilinks, tarefas
    nuvem/            cliente, sincronizador, planejar, cardapio, campainha
    cifra.ts cofre.ts senha.ts    painéis trancados
    dev/              rodar processos, abrir no editor
    ipc/handlers.ts   toda a superfície IPC, validada com zod
  renderer/
    App.tsx           roteamento entre lentes, republicação do cardápio
    useVault.ts       estado do vault no renderer
    formularios.tsx   os 26 tipos, como tabela
    dados.ts          leituras puras (testáveis sem React)
    components/       Lente* + base.tsx (Cartao, Serie, Barras, Check…)
  shared/             o contrato: eventos, ipc, types
  preload/            a ponte, mínima
web/src/              o PWA: telas, fila, cardápio, campainha
supabase/schema.sql   duas tabelas, quatro funções, RLS sem policy
```

---

## Decisões que parecem estranhas e não são

**Tudo em português.** Nomes de função, variáveis, comentários, testes. O
domínio é a vida de uma pessoa em português — `refeicoesDoPlano` e
`suplementosDoDia` se leem melhor do que a tradução, e não sobra tradutor
mental entre o que o usuário diz e o que o código chama.

**Comentários longos, e o porquê em vez do quê.** Um comentário que diz o que a
linha faz apodrece. Um que diz por que ela é assim — que alternativa foi
tentada, que bug apareceu — vale a manutenção. É o padrão aqui.

**Sem biblioteca de ícones.** Os seis ícones do app web são desenhados à mão em
SVG, meia dúzia de traços cada. Uma dependência de ícones traria centenas junto
para dentro do pacote que o celular baixa.

**Sem SDK do Supabase.** O cliente HTTP são quatro `fetch`. O Realtime é o
protocolo Phoenix escrito à mão. Um SDK inteiro para quatro chamadas é peso sem
retorno — e o que foi escrito à mão cabe na cabeça.

**Sem botão de "atualizar" no celular.** O vault está conectado; manter isso em
dia é trabalho do app, não da pessoa. Campainha para o caminho normal, relógio
de dois minutos como rede de segurança.

**Deduplicação por `DISTINCT ON` no `publicar_cardapio`.** Duas notas com o
mesmo título colidiriam na chave primária dentro do **mesmo** INSERT, e
`ON CONFLICT DO UPDATE` não resolve isso — o Postgres recusa com "cannot affect
row a second time". A dedup tem que acontecer antes, no payload.

---

## Estado

`v0.1.0`. Funciona, é usado todo dia, e tem as arestas de um projeto de uma
pessoa só: sem CI, sem instalador para macOS/Linux, sem migrações versionadas
do schema. Aberto porque não há motivo para não ser.

## Licença

Ainda não há arquivo `LICENSE`. O `package.json` diz `ISC`, que é o padrão do
npm e não uma escolha deliberada — então, na prática, **os direitos ainda são
todos reservados**: código público sem licença não é código livre para usar.
Se você quer reaproveitar alguma coisa daqui, abra uma issue e a gente
resolve.
