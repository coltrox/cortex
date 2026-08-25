# Design — Vault pessoal com lentes

**Data:** 2026-08-24
**Status:** aguardando revisão do autor
**Nome do app:** Cortex

---

## 1. Problema

Hoje o Obsidian guarda notas técnicas de projetos (81 notas em `C:\Users\PH\obsidian`, sob `Claude/Projetos`, `Claude/Segurança`, `Claude/Sessões`). Funciona bem para texto, mas três coisas ficam de fora:

1. **Dados estruturados.** Peso, cargas de treino, questões erradas, datas de prova e consultas não têm onde viver. Em markdown puro, "meu peso nos últimos 6 meses" exige reler todos os arquivos na mão.
2. **O protocolo não é imposto.** A taxonomia de prefixos (`API-`, `DB-`, `REQ-`, `MOC-`), a seção obrigatória `### 🕸️ Dependências da Rede` e o checklist de segurança existem como convenção. Nada verifica se foram seguidos; um wikilink quebrado passa despercebido.
3. **Checklist de segurança é texto morto.** `MOC - Segurança (Checklist Obrigatório)` tem 9 passos e um checklist mestre OWASP-ish, mas com `- [ ]` soltos numa nota única. Não há estado por projeto — é impossível responder "quais dos meus projetos estão sem rate limiting?".

## 2. Objetivo

Um app desktop pessoal que substitui o Obsidian como interface, mantendo o vault como formato. Ele precisa servir **dois consumidores**:

- **O autor**, que escreve, organiza e consulta a própria vida (projetos, estudos, saúde, calendário, viagens, código).
- **Um agente de IA**, que lê e escreve o mesmo vault diretamente do disco — sem o app aberto, sem API, sem banco intermediário — para recuperar contexto e registrar sessões.

O segundo consumidor é o que torna markdown-em-disco um **requisito**, não uma preferência.

## 3. Decisões travadas

| Decisão | Escolha | Motivo |
|---|---|---|
| Onde os dados vivem | Local-first; sync opcional numa fase futura | Offline, privacidade (dados de saúde), `.exe` sem backend |
| Formato em disco | Markdown + frontmatter YAML; SQLite só como índice | Único formato legível por `grep`/`cat`/Obsidian/git |
| Stack | Electron + React + TypeScript | Uma linguagem só; CodeMirror 6 resolve o editor; mesma stack do Obsidian |
| Banco | SQLite via `better-sqlite3` | Síncrono, embutido, sem servidor |
| Escopo v1 | Só o núcleo, sem módulos de vida | Fundação sólida antes de estudos/saúde/viagens |
| Navegação | Vault sempre visível + rail de lentes | O vault é o centro de gravidade; módulos são lentes, não lugares |
| Painéis | Layout fixo por lente no v1 | Arrastar/redimensionar é caro e não é o que faz o app ser usado |
| Command palette | Ctrl+K desde o v1 | Não é layout, é atalho — convive com tudo |

## 4. Princípios

1. **Os arquivos são a verdade. O banco é descartável.** Apagar `index.db` deve ser sempre seguro: o app reconstrói do disco. Nenhum dado existe só no SQLite.
2. **Tudo é uma nota.** Um treino, uma prova, uma consulta, uma questão de vestibular e um projeto são todos `.md` com `tipo:` no frontmatter. Módulos não criam tabelas — criam views.
3. **O renderer nunca toca o disco.** Todo acesso a arquivo e banco passa por IPC até o processo main. É a fronteira de segurança do Electron e também a fronteira de testabilidade.
4. **Nunca sobrescrever silenciosamente.** Escrita atômica; conflito com edição externa sempre pergunta.
5. **O protocolo é imposto pelo app, não pela memória do autor.**

## 5. Arquitetura

### 5.1 Processos

```
┌─ main (Node/TS) ──────────────── dono do disco e do banco
│   vault/     ler, escrever (atômico), watcher (chokidar)
│   parser/    frontmatter, wikilinks, tarefas
│   index/     SQLite: schema, migrations, reindex incremental
│   ipc/       superfície de comandos tipada (validada com zod)
│
├─ preload ──────────────────────── contextBridge, API tipada
│   contextIsolation: true · nodeIntegration: false · sandbox: true
│
└─ renderer (React/TS) ─────────── só UI
    shell/     rail, sidebar do vault, painéis, command palette
    lenses/    uma pasta por lente
    editor/    CodeMirror 6 + extensões (wikilink, live preview)
```

### 5.2 Fluxo de dados

```
disco (.md)  ──parser──▶  index (SQLite)  ──query──▶  IPC  ──▶  UI
     ▲                                                          │
     └──────────── escrita atômica ◀── IPC ◀── comando ─────────┘
     ▲
     └── chokidar detecta edição externa (Obsidian, agente) → reindexa → notifica UI
```

O agente escreve direto no disco. O watcher percebe e reindexa. O app não precisa estar aberto para o agente funcionar, e não precisa ser reiniciado quando o agente escreve.

### 5.3 Fronteiras

Cada unidade tem uma responsabilidade e é testável sozinha:

| Unidade | Faz | Depende de | Testável sem |
|---|---|---|---|
| `parser` | texto `.md` → objeto (frontmatter, links, tarefas) | nada | disco, Electron, UI |
| `vault` | ler/escrever arquivos, emitir eventos de mudança | fs | Electron, UI |
| `index` | manter SQLite em dia; responder queries | parser, vault | Electron, UI |
| `ipc` | expor comandos validados | index, vault | UI |
| `shell`/`lenses`/`editor` | desenhar e capturar interação | ipc (mockável) | disco, banco |

`parser` e `index` — o coração — rodam em teste puro, sem abrir janela.

## 6. Modelo de dados

### 6.1 Estrutura em disco

```
MeuVault/
├── AGENT.md              contrato de agente (§7), gerado e mantido pelo app
├── .vault/               metadados do app — não são notas
│   ├── index.db          SQLite derivado, descartável, no .gitignore
│   ├── config.json       lentes ativas, layout de painéis, preferências
│   └── templates/        um template por tipo
├── Projetos/
├── Segurança/
├── Sessões/
├── Anexos/               PDFs, imagens (não indexados como texto)
└── …
```

### 6.2 Frontmatter

As chaves existentes do vault atual (`tags`, `created`, `project`, `status`) são **mantidas como estão** — não há migração e as 81 notas atuais continuam válidas. O app acrescenta:

```yaml
---
tipo: projeto          # obrigatório: o que essa nota é
tags: [tech, seguranca]
created: 2026-08-02    # ISO YYYY-MM-DD
updated: 2026-08-24
project: Nima
status: ativo
date: 2026-09-02       # opcional; se existir, a nota aparece no calendário
---
```

`tipo` é o único campo novo obrigatório. Nota sem `tipo` é tratada como `tipo: nota` — as 81 notas atuais continuam funcionando sem serem tocadas.

`created` é escrito pelo app apenas na criação da nota. `updated` é reescrito pelo app a cada salvamento **feito pelo próprio app**; edições externas (Obsidian, agente) não têm `updated` mexido — para essas, o índice usa o `mtime` do arquivo. Nenhum outro campo é alterado automaticamente: o app nunca reescreve frontmatter que o autor digitou.

Cada tipo aceita campos próprios, livres. Exemplo de treino:

```yaml
---
tipo: treino
date: 2026-08-24
grupo: peito
exercicios:
  - { nome: supino, series: 4, reps: 8, carga: 60 }
---
```

### 6.3 Schema do índice

```sql
notes(path PK, title, tipo, project, status, created, updated, date,
      mtime, size, body_hash, parse_error)
note_tags(path, tag)
links(src, dst, resolved)            -- wikilinks; resolved=0 → link quebrado
tasks(path, line, text, done, due)
fields(path, key, value_text, value_num, value_date)
notes_fts                            -- FTS5 sobre título + corpo
checklist_state(project, item_id, done, updated)
```

A tabela `fields` é o que faz "tudo é uma nota" funcionar sem migração de schema a cada tipo novo: qualquer chave de frontmatter vira linha, com o valor guardado na coluna do tipo certo. Adicionar o módulo de viagens no futuro não altera o banco.

### 6.4 Indexação

- **No boot:** compara `mtime`+`size` de cada arquivo com o índice; reindexa só o que mudou.
- **Em runtime:** `chokidar` observa o vault e reindexa arquivo a arquivo.
- **Reconstrução:** apagar `.vault/index.db` reconstrói tudo. É a rota de recuperação para qualquer inconsistência.

## 7. O contrato de agente

O app gera e mantém `AGENT.md` na raiz do vault. É o primeiro arquivo que um agente lê, e descreve: estrutura de pastas, tipos válidos e seus campos, convenção de prefixos, a regra da seção `### 🕸️ Dependências da Rede`, e onde gravar notas de sessão.

O que hoje é convenção passa a ser verificado pelo app:

| Hoje (convenção) | No app |
|---|---|
| Prefixo `REQ-`/`API-`/`DB-`/`MOC-` | Template por tipo, aplicado na criação |
| `### 🕸️ Dependências da Rede` se lembrar | Seção obrigatória; aviso ao salvar se faltar |
| Wikilink quebrado passa batido | `links.resolved = 0` → destaque no editor + painel de links quebrados |
| Checklist de segurança lido manualmente | `checklist_state` por projeto, com progresso consultável |

**Validação é aviso, não bloqueio.** Salvar nunca falha por causa do protocolo — o app marca a nota como incompleta e mostra o que falta. Bloquear a escrita transformaria uma ajuda em obstáculo.

### 7.1 Checklist de segurança

Os itens vêm de `Segurança/MOC - Segurança (Checklist Obrigatório).md` (parseados dos `- [ ]`, agrupados pelos headings existentes). O estado é **por projeto** e vive no frontmatter da própria nota do projeto, sob a chave `seguranca:`, um booleano por item. O painel da lente Projetos mostra o agregado: *"Nima: 14/23 · faltam rate limiting, CORS allowlist, Helmet+CSP"*.

A tabela `checklist_state` do índice é **derivada** desse frontmatter, como todas as outras — apagar `index.db` continua sendo seguro, porque o progresso real está nos `.md`. Isso mantém o princípio de §4.1 intacto e é coerente com "tudo é uma nota": o estado do checklist de um projeto pertence à nota daquele projeto. Como o dado é indexado, perguntas como "quais projetos estão sem rate limiting?" continuam sendo uma query.

## 8. Interface

### 8.1 O shell

```
┌────┬──────────────┬──────────────────────────────────────────┐
│rail│ vault        │ painéis da lente ativa                   │
│    │ (filtrado    │                                          │
│Hoje│  pela lente,  │  ┌──────────┬───────────┬─────────────┐ │
│Nota│  resto        │  │ nota     │ checklist │ sessões     │ │
│Proj│  esmaecido)   │  │ (editor) │ segurança │ + tarefas   │ │
│ …  │              │  └──────────┴───────────┴─────────────┘ │
└────┴──────────────┴──────────────────────────────────────────┘
                                                     Ctrl+K
```

- **Rail:** troca a lente. Não navega para outro lugar — troca a apresentação do mesmo vault.
- **Sidebar:** a árvore do vault fica sempre visível. A lente ativa filtra e destaca; as outras pastas continuam presentes, esmaecidas.
- **Painéis:** layout fixo por lente, desenhado, não arrastável. Painéis podem ser ligados/desligados.
- **Ctrl+K:** abre nota, cria nota por tipo, busca, roda comandos.

### 8.2 Lentes do v1

Só duas:

- **Notas** — sidebar + editor + painel de Dependências da Rede (links de saída e backlinks).
- **Projetos** — sidebar filtrada em `tipo: projeto` + editor + painel de checklist de segurança + painel de sessões e tarefas do projeto.

`Hoje`, `Estudos`, `Saúde` e `Calendário` aparecem no rail apenas como lugares reservados desabilitados, para o rail não mudar de forma quando forem implementados.

## 9. Escopo do v1

**Entra:**

1. Abrir uma pasta como vault; watcher; indexação incremental
2. Editor CodeMirror 6: markdown, wikilinks clicáveis, autocomplete de `[[`, syntax highlight em blocos de código
3. Árvore do vault; quick open (Ctrl+O); busca full-text (Ctrl+Shift+F)
4. Painel de Dependências da Rede (saída + backlinks) e painel de links quebrados
5. Shell completo: rail, painéis fixos, Ctrl+K
6. Lentes Notas e Projetos
7. Templates por tipo e validação de protocolo (aviso)
8. Checklist de segurança por projeto
9. Geração e manutenção do `AGENT.md`
10. Anexos: arrastar PDF/imagem para dentro → move para `Anexos/` e insere o link

**Não entra, explicitamente:** módulos de Estudos, Saúde, Calendário e Viagens; grafo visual; sincronização e Supabase; painéis arrastáveis; plugins de terceiros; mobile; auto-update.

O item mais cortável, caso o v1 se alongue, é o **8** (checklist) — os outros nove são fundação.

## 10. Erros e casos de borda

| Situação | Comportamento |
|---|---|
| Arquivo alterado fora do app com a nota aberta | Watcher detecta; barra pergunta "recarregar / manter o meu". Nunca sobrescreve sozinho |
| YAML de frontmatter inválido | Nota abre como texto puro com aviso; o índice guarda o que der e marca `parse_error`. Não derruba a indexação |
| Wikilink apontando para nota inexistente | `resolved = 0`; destaque no editor; oferece criar a nota |
| `index.db` corrompido ou de versão antiga | Detectado no boot; reconstrói do zero |
| Falha de escrita no meio | Escrita atômica: grava em arquivo temporário e faz `rename`. O `.md` original nunca fica parcial |
| Vault muito grande / anexos binários | Binários não entram no FTS; só metadados |
| Pasta do vault sumiu ou sem permissão | Tela de erro com opção de escolher outra pasta; não cria vault vazio por cima |

## 11. Testes

- **Unitários (a maioria):** `parser` — frontmatter válido e inválido, wikilinks com alias e âncora, tarefas; `index` — resolução de links, queries, reindex incremental. Sem Electron, sem disco.
- **Integração:** vault de fixture numa pasta temporária → indexar → asserções sobre as queries; simular edição externa e conferir a reindexação.
- **E2E (poucos, Playwright + Electron):** abrir vault, criar nota, criar link, buscar, trocar de lente.
- **Regra:** todo bug corrigido ganha primeiro um teste que falha.

## 12. Segurança do próprio app

Aplicando o checklist do vault ao app que o hospeda:

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; sem `remote`
- CSP restritiva no renderer; nenhum conteúdo remoto carregado
- Markdown renderizado é sanitizado (DOMPurify); nada de `dangerouslySetInnerHTML` sem sanitização
- **Path traversal:** todo caminho recebido por IPC é resolvido e verificado como descendente da raiz do vault antes de qualquer leitura ou escrita
- Payloads de IPC validados com `zod` — a fronteira renderer→main é tratada como entrada hostil
- Nenhuma telemetria, nenhuma chamada de rede no v1

## 13. Distribuição

`electron-builder` gerando instalador NSIS e um `.exe` portátil, x64. Sem auto-update no v1.

O executável não será assinado (certificado de code signing custa caro), então o SmartScreen do Windows vai exibir aviso na primeira execução — os amigos precisam saber disso de antemão.

Amigos recebem o app **sem** o vault e sem as regras do autor: taxonomia de tipos, templates e o checklist de segurança vivem em `.vault/config.json` e nas notas, não no código.

## 14. Riscos

| Risco | Mitigação |
|---|---|
| **Escopo.** Sete subsistemas podem afundar o projeto | v1 restrito a duas lentes; módulos só depois do app estar em uso diário |
| **O editor é a parte mais difícil.** CodeMirror 6 tem curva | Começar com markdown cru + preview lado a lado; live preview depois, como incremento |
| **Escrita concorrente** com o Obsidian ou o agente aberto | Watcher + escrita atômica + pergunta ao usuário; nunca merge automático |
| **Perda de dados** durante o desenvolvimento | Apontar para uma **cópia** do vault até o app estar estável (ver §15) |
| Abandono por falta de valor imediato | Migrar o vault real cedo, para o app ser útil já na primeira semana |

## 15. Decisões em aberto

1. ~~**Nome do app.**~~ **Resolvido em 2026-08-24: Cortex.** A pasta do projeto foi renomeada de `app-pessoal` para `Cortex` na mesma data, com o histórico do git preservado.
2. **Qual vault usar durante o desenvolvimento.** Recomendação: trabalhar sobre uma cópia de `C:\Users\PH\obsidian` até o app passar nos testes de escrita, e só então apontar para o vault real. O formato é compatível nos dois sentidos — Obsidian e app podem conviver no mesmo vault.
3. **Se o checklist de segurança entra no v1** ou fica para o v1.1 (ver §9).
