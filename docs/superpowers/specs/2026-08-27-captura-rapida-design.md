# Captura rápida — app web que só escreve, Cortex que só lê

**Data:** 2026-08-27
**Estado:** desenho aprovado, aguardando plano de implementação

## 1. O problema

O Cortex vive no PC. Metade do que ele quer registrar acontece longe dele: o
suplemento é tomado na cozinha, a carga é levantada na academia, o gasto
acontece na cantina. Registrar depois, de memória, é registrar errado ou não
registrar.

O objetivo é um app web para o celular que capture esses momentos em segundos
e os entregue ao vault — sem transformar o Cortex num app conectado.

## 2. O princípio

> **O Cortex publica o cardápio. O celular manda os acontecimentos.**

- **Cardápio** é o que *existe*: os nomes dos treinos com seus exercícios, os
  suplementos com dose e dias, as refeições do plano ativo. É estrutura.
- **Acontecimento** é o que *foi feito*: fiz Push A com 60 kg, tomei o whey,
  comi o almoço, pesei 78,4.

Histórico, cargas passadas, valores lançados, anotações, documentos e senhas
**não sobem**. A fronteira não é uma promessa: é uma função só, com teste que
falha se qualquer campo fora da lista aparecer no que é publicado (§8).

Os **dados** correm em mão única: o que é registrado sobe do celular e desce
para o vault, e nada volta. O cardápio é a exceção, e anda no sentido
contrário — mas ele não é dado registrado, é a lista do que existe.

Em concreto: o celular só faz INSERT de eventos. O Cortex só faz SELECT de
eventos — nunca marca nada como lido, nunca apaga, nunca corrige o que está
no banco. O controle do que já foi processado é local (§7.3). A única escrita
do Cortex é o cardápio (§7.4), e o que cabe nele é fechado por teste (§8).

## 3. Arquitetura

```
CELULAR (app web)              SUPABASE                    PC (Cortex)
┌────────────────┐   INSERT   ┌──────────────┐  SELECT   ┌─────────────┐
│ botões grandes │ ─────────► │   eventos    │ ────────► │ vira .md no │
│ fila offline   │            └──────────────┘           │    vault    │
│ guarda o ID    │            ┌──────────────┐           └─────────────┘
└────────────────┘  ◄──────── │   cardapio   │ ◄──────── publica só isso
                     SELECT   └──────────────┘
```

Três peças, cada uma com uma responsabilidade:

| Peça | Faz | Não faz |
|---|---|---|
| App web | Captura e enfileira; envia quando há rede | Não lê histórico, não edita, não apaga |
| Supabase | Guarda eventos etiquetados e o cardápio | Não decide nada, não transforma dado |
| Cortex | Puxa eventos e escreve markdown; publica o cardápio | Não escreve eventos, não apaga do banco |

## 4. O ID do vault

O Cortex gera um UUID v4 na primeira abertura de cada vault e guarda em
`.vault/config.json`, no campo `vaultId`. **Gerado offline** — o banco não
participa, e por isso o Cortex não precisa escrever nada lá nem para se
registrar.

Esse ID é a única credencial. Cola-se no app web uma vez, e ele fica no
`localStorage` do celular. Qualquer aparelho com o ID funciona, o que atende
"acessar em outro celular" sem tela de login em lugar nenhum.

**O ID é a senha.** Quem o vir num print escreve no vault. São 122 bits de
entropia: adivinhar é inviável; o risco real é vazamento. Por isso o Cortex
tem um botão **Gerar ID novo**: os aparelhos antigos param de valer na hora, e
basta recolar o novo. Trocar o ID não apaga nada — os eventos antigos
simplesmente deixam de ser buscados.

## 5. O banco

Duas tabelas, ambas com RLS ligado e **nenhuma policy** — acesso direto é
negado a todos. Tudo passa por funções `SECURITY DEFINER` que exigem o
`vault_id`. Sem o ID, o banco não devolve uma linha sequer.

```sql
create table eventos (
  id        uuid primary key default gen_random_uuid(),
  vault_id  uuid not null,
  criado_em timestamptz not null default now(),
  dia       date not null,          -- o dia a que o registro se refere
  tipo      text not null,
  dados     jsonb not null default '{}'::jsonb
);
create index eventos_busca on eventos (vault_id, criado_em);

create table cardapio (
  vault_id      uuid not null,
  especie       text not null,      -- 'treino' | 'suplemento' | 'refeicao'
  nome          text not null,
  detalhe       jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (vault_id, especie, nome)
);
```

`dia` existe separado de `criado_em` porque não são a mesma coisa: registrar
às 23h50 o treino de hoje, ou lançar de manhã o gasto de ontem, precisa cair
no dia certo do vault.

**Funções expostas:**

| Função | Quem chama | O que faz |
|---|---|---|
| `registrar_evento(vault, dia, tipo, dados)` | celular | Insere um evento; devolve o id |
| `listar_eventos(vault, desde)` | Cortex | Eventos com `criado_em > desde` |
| `publicar_cardapio(vault, itens)` | Cortex | Substitui todo o cardápio desse vault |
| `listar_cardapio(vault)` | celular | O cardápio do vault |

`registrar_evento` valida: `tipo` pertence à lista de §6, `dados` não passa de
8 KB, e o vault não excedeu 500 eventos na última hora. O limite não protege
contra um atacante determinado — protege contra um laço com defeito no app
enchendo o banco de graça.

**Retenção:** um job diário apaga eventos com mais de 90 dias. O vault já é a
verdade a essa altura; o banco é só uma caixa de passagem.

## 6. Os eventos

Cada tipo tem uma forma fixa e um destino conhecido no vault:

| Tipo | Dados | Destino no vault |
|---|---|---|
| `suplemento` | `{nome}` | `suplementos_feitos` no `Diario/<dia>.md` |
| `refeicao_plano` | `{nome}` | `dieta_feitas` no diário |
| `refeicao_extra` | `{item, kcal?, prot?}` | `extras` no diário |
| `gasto` | `{item, valor, cat?, dir?}` | `transacoes` no diário |
| `sessao` | `{modelo, exercicios:[{nome,series?,reps?,carga?}]}` | Nota `tipo: sessao` |
| `cardio` | `{aparelho, minutos, distancia?, pace?, nivel?}` | Nota `tipo: cardio` |
| `medida` | `{peso?, cintura?, peito?, …}` | Nota `tipo: medida` do dia |
| `peso` | `{peso}` | Mesma nota `medida` do dia |
| `anotacao` | `{texto}` | Nota `tipo: anotacao` |

`peso` e `medida` gravam no mesmo lugar de propósito: o botão de peso é um
atalho, não um dado paralelo, e o gráfico de peso continua sendo um só.

Esses nomes de campo são os que o Cortex **já** usa. O app web não inventa
vocabulário; ele alimenta o que as lentes já leem.

## 7. O lado do Cortex

### 7.1 Configuração

`.vault/config.json` ganha:

```json
{
  "vaultId": "3f2a…",
  "nuvem": { "url": "https://xxx.supabase.co", "chave": "<anon key>" }
}
```

A chave anon do Supabase é pública por natureza (vive no app web também). Ela
não dá acesso a nada sem o `vault_id`, porque as tabelas estão fechadas.

Uma aba **Nuvem** nas configurações mostra o ID, o botão de gerar um novo, o
estado da última sincronização e o botão de publicar o cardápio.

### 7.2 Puxar

Ao abrir o vault, a cada 2 minutos com o app aberto, e por botão manual.
Falha de rede não é erro visível: a próxima tentativa resolve. Falha de
credencial é — aparece na aba Nuvem.

### 7.3 Aplicar sem duplicar

O Cortex guarda em `.vault/recebidos.json` os ids dos eventos já aplicados,
com a data. Um evento já visto é ignorado.

Isso é necessário porque nem todo evento é idempotente: marcar o mesmo
suplemento duas vezes não muda nada (a lista é um conjunto), mas aplicar o
mesmo gasto duas vezes cobra duas vezes. O arquivo é podado junto com a
retenção do banco, aos 90 dias.

A escrita usa os mesmos caminhos que os formulários já usam — `note:ensure` +
`note:patch` para o diário, `note:create` para as notas. Nenhum caminho novo
de escrita no vault.

### 7.4 Publicar o cardápio

Automático quando o watcher vê mudança em nota `treino-modelo`, `suplemento`
ou no plano ativo, com um atraso de 5 segundos para não publicar a cada tecla.
E por botão, para quando a pessoa quiser forçar.

## 8. A fronteira verificável

Uma função pura monta o que sobe:

```ts
montarCardapio(notas: NoteComCampos[]): ItemCardapio[]
```

Ela produz exatamente três espécies, com exatamente estes campos:

- `treino` → `{grupo, exercicios: [{nome, series, reps}]}` — **sem carga**
- `suplemento` → `{dose, quando, dias}`
- `refeicao` → `{hora, itens, kcal, prot}` (só do plano ativo)

O teste que garante a fronteira: monta um vault com notas contendo senha,
número de documento, valor de gasto, carga de treino e texto de anotação;
serializa o cardápio; e falha se qualquer um desses valores aparecer no JSON.
Um campo novo que vaze passa a quebrar o teste, não a confiança.

## 9. O app web

Vite + React + TypeScript, no mesmo repositório, em `web/`. Compartilha
`src/shared/eventos.ts` com o desktop — a definição dos tipos de evento é uma
só, e mudar um campo quebra a compilação dos dois lados, que é o
comportamento desejado.

**Telas:**

1. **Hoje** — suplementos do dia e refeições do plano, cada um com um check
   grande. Abaixo, botões para Treino, Cardio, Peso, Medidas, Gasto e
   Anotação. No topo, o estado da fila.
2. **Treino** — escolhe o modelo do cardápio, aparecem os exercícios com um
   campo de carga cada, envia.
3. **Cardio**, **Medidas**, **Gasto**, **Anotação** — formulários curtos.
4. **Ajustes** — colar o ID do vault; mostra quando o cardápio foi atualizado.

**Fila offline:** todo envio entra numa fila em `localStorage` antes de sair.
A fila esvazia ao abrir o app, ao evento `online` do navegador, e a cada 30
segundos enquanto aberto. A tela mostra quantos itens esperam. Um item que
falha por erro de validação (não de rede) sai da fila e vira aviso — senão
entope a fila para sempre.

**PWA:** manifest e service worker, para instalar na tela inicial e abrir sem
navegador. O service worker guarda o app em cache; ele **não** faz cache de
dados.

## 10. Erros e casos de borda

| Situação | Comportamento |
|---|---|
| Celular sem rede | Registro entra na fila; a tela diz quantos esperam |
| ID não configurado | O app abre direto em Ajustes pedindo o ID |
| ID errado (não existe) | O cardápio volta vazio; a tela avisa em vez de mostrar telas em branco |
| Evento com tipo desconhecido | O Cortex ignora e registra no log; um app novo contra um Cortex velho não quebra nada |
| Evento chega para um dia futuro | Aceito — pode ser fuso; o Cortex grava no dia informado |
| Mesmo evento lido duas vezes | Ignorado pelo `recebidos.json` |
| Supabase fora do ar | Sincronização falha em silêncio e tenta de novo; nada se perde |
| Vault trocado (ID novo) | Eventos antigos param de ser buscados; nada é apagado |

## 11. Testes

- `montarCardapio` — a fronteira do que sobe (§8), o teste mais importante
- Conversão evento → mutação no vault, um caso por tipo da tabela §6
- Deduplicação: o mesmo evento aplicado duas vezes produz um resultado só
- Fila offline: enfileira, esvazia, sobrevive a recarregar a página, e
  descarta item inválido sem travar a fila
- As funções SQL, com um projeto Supabase de teste: sem `vault_id` correto,
  `listar_eventos` e `listar_cardapio` não devolvem nada

## 12. Não entra

Ler histórico no celular. Editar ou apagar registro pelo celular. Gráficos no
celular. Notificações push. Mais de um usuário. Sincronizar o vault inteiro.
Qualquer escrita do Cortex no banco além do cardápio.

O celular é um caderninho de bolso, não um segundo Cortex.

## 13. O que depende do Pedro

1. Criar um projeto no [supabase.com](https://supabase.com) (plano grátis) e
   me passar a **URL do projeto** e a **chave anon**. Não crio conta em nome
   de ninguém.
2. Escolher onde hospedar o app web quando ele estiver pronto — Cloudflare
   Pages e Vercel servem, ambos grátis. Só é preciso no fim.
