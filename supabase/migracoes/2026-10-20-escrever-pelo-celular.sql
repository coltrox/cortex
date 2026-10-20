-- Migração de 20/10/2026 — escrever no vault pelo celular.
--
-- Acrescenta o tipo de evento `nota_escrita` à lista branca do banco. Sem
-- ele, `registrar_evento` recusa com "tipo desconhecido" e nada do que for
-- escrito no tablet chega ao vault.
--
-- Esse tipo serve a dois gestos, que são o mesmo por dentro — preencher uma
-- nota que o Cortex já publicou:
--   1. a REDAÇÃO escrita no celular, com o texto e o status;
--   2. o DIA do cronograma marcado como concluído.
--
-- Ele nunca cria nota, e os campos que pode mexer são uma lista branca curta
-- em planejar.ts (status, feito, nota).
--
-- A lista abaixo precisa casar com TIPOS_EVENTO em src/shared/eventos.ts.
-- Faltar num dos dois faz o evento sumir em silêncio.
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
               -- Escrever numa nota que JA EXISTE, do celular: o texto da
               -- redacao, o dia do cronograma marcado como concluido. Nunca
               -- cria nota, e so mexe nos campos de uma lista branca curta.
               'nota_escrita']
$$;
