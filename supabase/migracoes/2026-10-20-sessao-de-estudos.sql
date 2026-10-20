-- Sessão de estudos registrada pelo celular.
--
-- Pedido do dono: "eu quero iniciar uma sessão de estudos e aí todos os
-- exercícios que eu fizer, eu quero que você marque depois sessão de estudos
-- tal de tal dia, de tal horário, e quantos exercícios de cada matéria eu
-- acertei, quantos que eu errei, os conteúdos que eu mais fui bem, os que eu
-- mais fui mal".
--
-- O único efeito desta migração é liberar o tipo de evento `sessao_estudo`.
-- Sem ela, `registrar_evento` recusa o evento e encerrar a sessão no celular
-- falha: o relatório fica preso no aparelho e nunca vira nota.
--
-- Rodar no SQL Editor do Supabase. Pode rodar duas vezes sem problema:
-- `create or replace` só substitui a função.

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
               'nota_escrita',
               -- A sessao de treino fechada no celular. Vira NOTA com o
               -- relatorio -- acertos por materia e por conteudo, onde foi
               -- bem e onde foi mal --, e tambem soma os minutos no diario.
               'sessao_estudo']
$$;
