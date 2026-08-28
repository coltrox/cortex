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
               'sessao','cardio','medida','peso','anotacao']
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
  -- Duas notas com o mesmo título colidem na chave primária
  -- (vault_id, especie, nome). Sem o ON CONFLICT, essa sincronização — que
  -- roda a cada 2 minutos — falharia sempre a partir da primeira colisão,
  -- sem que a pessoa entendesse por quê. O último item da lista vence, o que
  -- é aceitável para um cardápio.
  insert into cardapio (vault_id, especie, nome, detalhe)
  select p_vault, i->>'especie', i->>'nome', coalesce(i->'detalhe', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) i
  where i->>'especie' in ('treino','suplemento','refeicao')
    and coalesce(i->>'nome','') <> ''
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

-- O Postgres concede EXECUTE a PUBLIC por padrão em toda função nova — a
-- chave anon herda isso automaticamente, mesmo sem aparecer em nenhum grant
-- acima. Sem estes REVOKEs, `limpar_antigos()` (apaga eventos de todos os
-- vaults) e `tipos_validos()` ficariam alcançáveis por qualquer portador da
-- chave anon, sem o id do vault — contradizendo a promessa do README de que
-- a chave sozinha não dá acesso a nada. Precisam vir depois da criação das
-- funções: é na criação que o grant padrão a PUBLIC acontece.
revoke execute on function tipos_validos() from public;
revoke execute on function limpar_antigos() from public;
-- E para qualquer função futura que alguém acrescente a este arquivo sem
-- lembrar deste detalhe: muda o padrão do schema, não é preciso repetir o
-- revoke acima toda vez.
alter default privileges in schema public revoke execute on functions from public;
