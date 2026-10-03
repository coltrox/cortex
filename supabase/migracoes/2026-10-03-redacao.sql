-- Migração de 03/10/2026 — espécies de redação no cardápio.
--
-- Acrescenta `estrutura-redacao` e `repertorio` à lista branca de
-- `publicar_cardapio`. Sem isto o banco descarta as duas em silêncio, e as
-- abas de Redação no celular ficam vazias mesmo com as notas no vault.
--
-- Como aplicar: cole no SQL Editor do Supabase e rode. É idempotente —
-- `create or replace` substitui a função inteira.
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
                               -- Uma area ligada no Cortex. Nao e conteudo: e
                               -- o mapa do que o dono escolheu usar, para o
                               -- celular nao mostrar tela de area desligada.
                               'area',
                               -- A agua do dia: quanto ja foi, a meta e a garrafa.
                               'hidratacao',
                               -- Redacao: o esqueleto de um genero de texto e
                               -- o repertorio que sustenta o argumento. Sao
                               -- duas coisas diferentes -- uma diz COMO
                               -- organizar, a outra COM O QUE preencher.
                               'estrutura-redacao','repertorio',
                               -- A anotacao. Sobem TODAS: a tela Notas do
                               -- celular mostra o conjunto, e o Hoje corta
                               -- pelo dia. Quem corta e a tela, nao o banco.
                               'anotacao',
                               -- O treino feito, com as series de cada
                               -- exercicio: o celular mostra os ultimos.
                               'sessao',
                               -- O HISTORICO, para o celular desenhar
                               -- evolucao em vez de so registrar: peso e
                               -- medidas, sessoes de cardio, e os
                               -- lancamentos do diario. Os lancamentos so
                               -- entraram aqui depois de o dono levantar a
                               -- restricao de privacidade, em 10/09/2026.
                               'medida','cardio','transacao')
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

