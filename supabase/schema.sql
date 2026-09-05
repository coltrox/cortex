-- supabase/schema.sql
-- Captura rápida do Cortex. Rodar uma vez no SQL Editor do painel do Supabase.
--
-- Modelo de segurança: as duas tabelas ficam com RLS ligado e SEM policy
-- nenhuma, o que nega acesso direto a todo mundo, inclusive à chave anon.
-- Tudo passa pelas funções abaixo, que são SECURITY DEFINER e exigem o id do
-- vault. Sem o id, o banco não devolve uma linha.

create table if not exists eventos (
  id        uuid primary key default gen_random_uuid(),
  vault_id  uuid not null,
  criado_em timestamptz not null default now(),
  dia       date not null,
  tipo      text not null,
  dados     jsonb not null default '{}'::jsonb
);
create index if not exists eventos_busca on eventos (vault_id, criado_em);
-- Separado do índice acima porque `limpar_antigos()` filtra só por
-- `criado_em`, sem `vault_id` — o índice líder em vault_id não serve para
-- essa busca.
create index if not exists eventos_retencao on eventos (criado_em);

create table if not exists cardapio (
  vault_id      uuid not null,
  especie       text not null,
  nome          text not null,
  detalhe       jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (vault_id, especie, nome)
);

alter table eventos  enable row level security;
alter table cardapio enable row level security;

-- Os tipos que o Cortex sabe aplicar. Um tipo fora desta lista é recusado no
-- INSERT: melhor falhar no celular, onde a pessoa vê, do que acumular lixo
-- que o Cortex vai ignorar em silêncio para sempre.
create or replace function tipos_validos() returns text[]
language sql immutable as $$
  select array['suplemento','refeicao_plano','refeicao_extra','gasto',
               'sessao','cardio','medida','peso','anotacao',
               -- Agenda e estudos: os que mexem numa nota existente, ou criam
               -- uma. Precisam casar com TIPOS_EVENTO em src/shared/eventos.ts
               -- e ter um caso em planejar.ts; faltar num dos tres faz o
               -- evento sumir em silencio.
               'prova_estudada','compromisso','item_apagado',
               'compromisso_editado','prova_nova','tarefa_nova',
               'porquinho',
               -- A tarefa diaria, marcada e desmarcada como o suplemento.
               'rotina_feita',
               -- Agua bebida, em ml. Soma ao total do dia; ml negativo desfaz.
               'agua']
$$;

create or replace function registrar_evento(
  p_vault uuid, p_dia date, p_tipo text, p_dados jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare novo uuid;
begin
  if not (p_tipo = any(tipos_validos())) then
    raise exception 'tipo desconhecido: %', p_tipo;
  end if;
  if length(p_dados::text) > 8192 then
    raise exception 'dados grandes demais (max. 8 KB)';
  end if;
  -- Teto por vault. Não detém um atacante decidido; detém um laço com defeito
  -- no app enchendo o banco de graça.
  if (select count(*) from eventos
      where vault_id = p_vault and criado_em > now() - interval '1 hour') >= 500 then
    raise exception 'limite de eventos por hora atingido';
  end if;

  insert into eventos (vault_id, dia, tipo, dados)
  values (p_vault, p_dia, p_tipo, coalesce(p_dados, '{}'::jsonb))
  returning id into novo;
  return novo;
end $$;

create or replace function listar_eventos(p_vault uuid, p_desde timestamptz)
returns setof eventos
language sql security definer set search_path = public as $$
  select * from eventos
  where vault_id = p_vault and criado_em > p_desde
  order by criado_em
$$;

create or replace function publicar_cardapio(p_vault uuid, p_itens jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  -- Substitui o cardápio inteiro do vault: um treino apagado no Cortex tem
  -- que sumir do celular, e mesclar deixaria fantasmas para sempre.
  delete from cardapio where vault_id = p_vault;

  -- Duas notas com o mesmo título (especie, nome) violam a chave primária
  -- se as duas forem inseridas na MESMA instrução — e como o DELETE acima
  -- já esvaziou o vault, essa é a única colisão possível aqui, nunca sobra
  -- linha antiga para conflitar contra. ON CONFLICT DO UPDATE não resolve
  -- esse caso: ele trata conflito contra linha já existente na tabela, não
  -- duas linhas propostas colidindo entre si (o Postgres recusa com
  -- "cannot affect row a second time"). Por isso a deduplicação tem que
  -- acontecer antes, no próprio payload — aqui, com DISTINCT ON. A
  -- ocorrência com a maior posição (a última do array) vence.
  insert into cardapio (vault_id, especie, nome, detalhe)
  select p_vault, dedup.especie, dedup.nome, dedup.detalhe
  from (
    select distinct on (item.especie, item.nome)
           item.especie, item.nome, item.detalhe
    from (
      select el->>'especie' as especie,
             el->>'nome'    as nome,
             coalesce(el->'detalhe', '{}'::jsonb) as detalhe,
             pos
      from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) with ordinality as bruto(el, pos)
      -- Lista branca de especies, e nao "aceita qualquer coisa": o Cortex e
      -- quem decide o que publica, mas o banco nao tem por que confiar nisso.
      -- Precisa casar com ESPECIES_CARDAPIO em src/shared/eventos.ts.
      where el->>'especie' in ('treino','suplemento','refeicao',
                               'prova','compromisso','tarefa','porquinho',
                               -- A tarefa diaria. Espécie propria, e nao
                               -- 'tarefa': aquela tem prazo e vive na aba
                               -- Chegando; esta se repete todo dia e vive no
                               -- Hoje, ao lado dos suplementos.
                               'rotina',
                               -- A agua do dia: quanto ja foi, a meta e a garrafa.
                               'hidratacao',
                               -- A anotacao de hoje, voltando para o celular
                               -- mostrar embaixo das tarefas do dia. So as de
                               -- hoje sobem; quem corta e montarCardapio.
                               'anotacao')
        and coalesce(el->>'nome','') <> ''
    ) item
    order by item.especie, item.nome, item.pos desc
  ) dedup
  -- Este ON CONFLICT não cuida mais da colisão do payload — a deduplicação
  -- acima já garante no máximo uma linha por (especie, nome) antes de
  -- chegar aqui. Ele cobre a corrida entre duas chamadas concorrentes para
  -- o mesmo vault: se uma segunda invocação desta função gravar depois que
  -- a primeira já inseriu a mesma linha (o DELETE de cada uma não bloqueia
  -- a outra), isso vira um UPDATE em vez de um erro de chave duplicada.
  on conflict (vault_id, especie, nome)
  do update set detalhe = excluded.detalhe, atualizado_em = now();

  get diagnostics n = row_count;
  return n;
end $$;

create or replace function listar_cardapio(p_vault uuid)
returns setof cardapio
language sql security definer set search_path = public as $$
  select * from cardapio where vault_id = p_vault order by especie, nome
$$;

-- Retenção: o vault já é a verdade depois de 90 dias; o banco é caixa de
-- passagem. Agende no painel (Database > Cron) para rodar uma vez por dia.
create or replace function limpar_antigos() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from eventos where criado_em < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function registrar_evento(uuid, date, text, jsonb) to anon;
grant execute on function listar_eventos(uuid, timestamptz)        to anon;
grant execute on function publicar_cardapio(uuid, jsonb)           to anon;
grant execute on function listar_cardapio(uuid)                    to anon;

-- Dois caminhos concedem EXECUTE sem ninguem pedir, e e preciso fechar os
-- dois.
--
-- O Postgres concede EXECUTE a PUBLIC por padrao em toda funcao nova, e a
-- chave anon herda isso mesmo sem aparecer em nenhum grant acima. E o
-- Supabase, por cima, concede EXECUTE em todas as funcoes do schema public
-- diretamente a anon e a authenticated, na configuracao inicial do projeto.
-- Esse segundo e um grant nominal: um revoke de PUBLIC nao o remove.
--
-- Medido contra o projeto real: so com o revoke de PUBLIC, limpar_antigos()
-- -- que apaga eventos de TODOS os vaults -- continuava respondendo 200 a
-- chave anon, sem o id de vault nenhum. Isso contradizia a promessa de que a
-- chave sozinha nao da acesso a nada, e por isso os revokes nomeiam os tres.
--
-- Precisam vir depois da criacao das funcoes: e na criacao que o grant
-- padrao a PUBLIC acontece.
revoke execute on function tipos_validos()  from public, anon, authenticated;
revoke execute on function limpar_antigos() from public, anon, authenticated;
-- E para qualquer função futura que alguém acrescente a este arquivo sem
-- lembrar deste detalhe: muda o padrão do schema, não é preciso repetir o
-- revoke acima toda vez.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
