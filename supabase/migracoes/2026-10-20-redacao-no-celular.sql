-- Migração de 20/10/2026 — escrever a redação pelo celular.
--
-- Acrescenta o tipo de evento `redacao_escrita` à lista branca do banco.
-- Sem ele, `registrar_evento` recusa com "tipo desconhecido" e o texto
-- escrito no tablet nunca chega ao vault.
--
-- A lista precisa casar com TIPOS_EVENTO em src/shared/eventos.ts e ter um
-- caso em planejar.ts. Faltar num dos três faz o evento sumir em silêncio —
-- foi assim que as espécies do cardápio já sumiram antes.
--
-- Cole no SQL Editor do Supabase e rode. É idempotente.

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
               'agua',
               -- Inscricao e pagamento do vestibular. Separados de
               -- 'prova_estudada' porque acontecem uma vez e tem prazo
               -- proprio: perder o da inscricao tira a pessoa da prova.
               'prova_etapa',
               -- A sessao de estudo: materia, minutos, questoes e acertos.
               -- Vira linha no diario do dia, e nao nota, porque estudar
               -- duas vezes no mesmo dia e o caso normal.
               'estudo',
               -- A REDACAO escrita no celular, com o texto inteiro.
               --
               -- Nao cria nota: preenche a folha que o Cortex ja publicou,
               -- com tema, data e banca, e muda o status para "aguardando
               -- correcao". E o que permite escrever no tablet, longe do
               -- computador. O texto cabe folgado no teto de 8 KB por evento:
               -- uma redacao de 30 linhas tem cerca de 1,8 KB.
               'redacao_escrita']
$$;
