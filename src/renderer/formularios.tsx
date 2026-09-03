/**
 * Schemas dos formulários.
 *
 * Registrar um treino, lançar um gasto ou marcar uma tarefa não deve exigir
 * escrever YAML. Cada tipo declara seus campos aqui, e `ModalFormulario`
 * desenha a tela — não existe código por tipo.
 *
 * O markdown continua sendo a verdade em disco; ele só deixa de ser a
 * interface. É por isso que os nomes das chaves aqui são os nomes que
 * aparecem no frontmatter: quem abrir o `.md` fora do app lê a mesma coisa.
 */

export type TipoCampo =
  | 'texto' | 'longo' | 'numero' | 'data' | 'hora' | 'bool'
  | 'select' | 'dias' | 'senha' | 'itens'

export type Campo = {
  k: string
  rotulo: string
  tipo: TipoCampo
  opcoes?: string[]
  /** Só para `itens`: as colunas de cada linha da lista. */
  subcampos?: Campo[]
  placeholder?: string
  obrigatorio?: boolean
  dica?: string
}

export type Formulario = {
  tipo: string
  nome: string
  pasta: string
  /** Como nomear o arquivo: pelo título digitado, ou pela data (um por dia). */
  nomearPor: 'titulo' | 'data'
  campos: Campo[]
  /** Texto que entra no corpo da nota nova, abaixo do frontmatter. */
  corpo?: string
}

export const DIAS_SEMANA = [
  { id: 'dom', nome: 'D' }, { id: 'seg', nome: 'S' }, { id: 'ter', nome: 'T' },
  { id: 'qua', nome: 'Q' }, { id: 'qui', nome: 'Q' }, { id: 'sex', nome: 'S' },
  { id: 'sab', nome: 'S' }
]

/** Dia da semana de uma data ISO, no vocabulário de `DIAS_SEMANA`. */
export function diaDaSemana(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return DIAS_SEMANA[new Date(a, m - 1, d).getDay()].id
}

const EXERCICIOS: Campo[] = [
  { k: 'nome', rotulo: 'Exercício', tipo: 'texto', placeholder: 'Supino reto' },
  { k: 'series', rotulo: 'Séries', tipo: 'numero' },
  { k: 'reps', rotulo: 'Reps', tipo: 'texto', placeholder: '8-10' }
]

const REFEICOES_PLANO: Campo[] = [
  { k: 'nome', rotulo: 'Refeição', tipo: 'texto', placeholder: 'Café da manhã' },
  { k: 'hora', rotulo: 'Hora', tipo: 'hora' },
  { k: 'itens', rotulo: 'O quê', tipo: 'texto', placeholder: '2 ovos, 80 g de aveia' },
  { k: 'kcal', rotulo: 'kcal', tipo: 'numero' },
  { k: 'prot', rotulo: 'Prot', tipo: 'numero' }
]

/** Notas inteiras — cada uma vira um arquivo `.md`. */
export const FORMULARIOS: Record<string, Formulario> = {
  /* ---------- Saúde ---------- */
  'treino-modelo': {
    tipo: 'treino-modelo', nome: 'Treino', pasta: 'Saude/Treinos', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Nome do treino', tipo: 'texto', obrigatorio: true, placeholder: 'Push A' },
      { k: 'grupo', rotulo: 'Grupo', tipo: 'select', opcoes: ['push', 'pull', 'legs', 'upper', 'lower', 'full body'] },
      {
        k: 'exercicios', rotulo: 'Exercícios', tipo: 'itens', subcampos: EXERCICIOS,
        dica: 'Esta é a estrutura do treino. As cargas você registra na hora de treinar.'
      }
    ]
  },
  sessao: {
    tipo: 'sessao', nome: 'Treino feito', pasta: 'Saude/Treinos', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Título', tipo: 'texto', obrigatorio: true },
      { k: 'date', rotulo: 'Data', tipo: 'data', obrigatorio: true },
      { k: 'modelo', rotulo: 'Treino base', tipo: 'texto' },
      {
        k: 'exercicios', rotulo: 'O que foi feito', tipo: 'itens',
        subcampos: [
          { k: 'nome', rotulo: 'Exercício', tipo: 'texto' },
          { k: 'series', rotulo: 'Séries', tipo: 'numero' },
          { k: 'reps', rotulo: 'Reps', tipo: 'texto' },
          { k: 'carga', rotulo: 'Carga', tipo: 'texto', placeholder: '60 kg' }
        ]
      }
    ]
  },
  cardio: {
    tipo: 'cardio', nome: 'Cardio', pasta: 'Saude/Treinos', nomearPor: 'data',
    campos: [
      { k: 'date', rotulo: 'Data', tipo: 'data', obrigatorio: true },
      { k: 'aparelho', rotulo: 'Aparelho', tipo: 'select', opcoes: ['esteira', 'bike', 'escada', 'elíptico', 'rua'] },
      { k: 'minutos', rotulo: 'Tempo (min)', tipo: 'numero', obrigatorio: true },
      { k: 'distancia', rotulo: 'Distância (km)', tipo: 'numero' },
      { k: 'pace', rotulo: 'Pace', tipo: 'texto', placeholder: '5:45 /km' },
      { k: 'nivel', rotulo: 'Nível / inclinação', tipo: 'texto', placeholder: '8' }
    ]
  },
  medida: {
    tipo: 'medida', nome: 'Medida', pasta: 'Saude', nomearPor: 'data',
    campos: [
      { k: 'date', rotulo: 'Data', tipo: 'data', obrigatorio: true },
      { k: 'peso', rotulo: 'Peso (kg)', tipo: 'numero' },
      { k: 'gordura', rotulo: 'Gordura (%)', tipo: 'numero' },
      { k: 'cintura', rotulo: 'Cintura (cm)', tipo: 'numero' },
      { k: 'peito', rotulo: 'Peito (cm)', tipo: 'numero' },
      { k: 'braco', rotulo: 'Braço (cm)', tipo: 'numero' },
      { k: 'antebraco', rotulo: 'Antebraço (cm)', tipo: 'numero' },
      { k: 'coxa', rotulo: 'Coxa (cm)', tipo: 'numero' },
      { k: 'panturrilha', rotulo: 'Panturrilha (cm)', tipo: 'numero' },
      { k: 'quadril', rotulo: 'Quadril (cm)', tipo: 'numero' }
    ]
  },
  plano: {
    tipo: 'plano', nome: 'Plano alimentar', pasta: 'Saude/Dieta', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Nome do plano', tipo: 'texto', obrigatorio: true, placeholder: 'Cutting agosto' },
      { k: 'objetivo', rotulo: 'Objetivo', tipo: 'select', opcoes: ['cutting', 'bulking', 'manutenção'] },
      { k: 'kcal', rotulo: 'Meta de kcal', tipo: 'numero' },
      { k: 'prot', rotulo: 'Proteína (g)', tipo: 'numero' },
      { k: 'carb', rotulo: 'Carboidrato (g)', tipo: 'numero' },
      { k: 'gord', rotulo: 'Gordura (g)', tipo: 'numero' },
      {
        k: 'refeicoes', rotulo: 'Refeições do dia', tipo: 'itens', subcampos: REFEICOES_PLANO,
        dica: 'É esta lista que aparece na aba Dieta para você marcar todo dia.'
      }
    ]
  },
  suplemento: {
    tipo: 'suplemento', nome: 'Suplemento', pasta: 'Saude', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Nome', tipo: 'texto', obrigatorio: true, placeholder: 'Whey' },
      { k: 'dose', rotulo: 'Dose', tipo: 'texto', placeholder: '30 g' },
      { k: 'quando', rotulo: 'Quando', tipo: 'select', opcoes: ['manhã', 'pré-treino', 'pós-treino', 'noite', 'com a refeição'] },
      { k: 'dias', rotulo: 'Dias da semana', tipo: 'dias' },
      { k: 'estoque', rotulo: 'Estoque (doses)', tipo: 'numero' }
    ]
  },
  /*
   * A água do dia.
   *
   * Só a meta e o tamanho da garrafa moram aqui. O quanto já foi bebido vive
   * no diário do dia, como todo registro — misturar as duas coisas na mesma
   * nota faria a meta ser reescrita a cada gole.
   *
   * Uma nota basta: duas metas de água não querem dizer nada, e o Cortex
   * publica a primeira que encontrar.
   */
  hidratacao: {
    tipo: 'hidratacao', nome: 'Água do dia', pasta: 'Saude', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Nome', tipo: 'texto', obrigatorio: true, placeholder: 'Água' },
      {
        k: 'meta', rotulo: 'Meta do dia (ml)', tipo: 'numero', obrigatorio: true,
        dica: '3,5 litros são 3500.'
      },
      {
        k: 'copo', rotulo: 'Tamanho da garrafa (ml)', tipo: 'numero',
        dica: 'É o tamanho do botão no celular — cada toque soma isto.'
      }
    ]
  },
  consulta: {
    tipo: 'consulta', nome: 'Consulta', pasta: 'Saude', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Título', tipo: 'texto', obrigatorio: true, placeholder: 'Consulta nutri' },
      { k: 'date', rotulo: 'Data', tipo: 'data', obrigatorio: true },
      { k: 'hora', rotulo: 'Hora', tipo: 'hora' },
      { k: 'profissional', rotulo: 'Profissional', tipo: 'texto' },
      { k: 'local', rotulo: 'Local', tipo: 'texto' }
    ],
    corpo: '## Como foi\n\n## O que ficou combinado\n'
  },

  /* ---------- Estudos ---------- */
  materia: {
    tipo: 'materia', nome: 'Conteúdo', pasta: 'Estudos/Conteudos', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Conteúdo', tipo: 'texto', obrigatorio: true, placeholder: 'Trigonometria' },
      { k: 'materia', rotulo: 'Matéria', tipo: 'select', opcoes: ['matemática', 'física', 'química', 'biologia', 'português', 'literatura', 'história', 'geografia', 'filosofia', 'sociologia', 'inglês', 'redação'] },
      { k: 'dominio', rotulo: 'Domínio (1 a 5)', tipo: 'select', opcoes: ['1', '2', '3', '4', '5'] },
      { k: 'status', rotulo: 'Status', tipo: 'select', opcoes: ['não comecei', 'estudando', 'revisando', 'dominado'] },
      { k: 'prioridade', rotulo: 'Reta final', tipo: 'bool', dica: 'Aparece primeiro na lista de revisão.' }
    ],
    corpo: '## Resumo\n\n\n## Fórmulas\n\n$$\n\n$$\n\n## Pegadinhas de prova\n'
  },
  prova: {
    tipo: 'prova', nome: 'Prova', pasta: 'Estudos/Provas', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Prova', tipo: 'texto', obrigatorio: true, placeholder: 'ENEM 1º dia' },
      { k: 'date', rotulo: 'Data', tipo: 'data', obrigatorio: true },
      { k: 'materia', rotulo: 'Matérias', tipo: 'texto', placeholder: 'linguagens, humanas' },
      { k: 'local', rotulo: 'Local', tipo: 'texto' }
    ],
    corpo: '## O que cai\n\n## O que revisar\n- [ ] \n'
  },
  simulado: {
    tipo: 'simulado', nome: 'Simulado', pasta: 'Estudos', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Simulado', tipo: 'texto', obrigatorio: true },
      { k: 'date', rotulo: 'Data', tipo: 'data', obrigatorio: true },
      { k: 'acertos', rotulo: 'Acertos', tipo: 'numero' },
      { k: 'total', rotulo: 'Total de questões', tipo: 'numero' },
      { k: 'materia', rotulo: 'Área', tipo: 'texto', placeholder: 'natureza' }
    ],
    corpo: '## O que errei e por quê\n'
  },
  redacao: {
    tipo: 'redacao', nome: 'Redação', pasta: 'Estudos/Redacoes', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Tema', tipo: 'texto', obrigatorio: true },
      { k: 'date', rotulo: 'Data', tipo: 'data', obrigatorio: true },
      { k: 'nota', rotulo: 'Nota', tipo: 'numero' },
      {
        k: 'repertorios', rotulo: 'Repertórios usados', tipo: 'longo',
        placeholder: 'Um por linha: Zygmunt Bauman, Constituição art. 205, Vidas Secas…'
      }
    ],
    corpo: '## Texto\n\n## O que o corretor apontou\n'
  },
  tarefa: {
    tipo: 'tarefa', nome: 'Tarefa', pasta: 'Estudos', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Tarefa', tipo: 'texto', obrigatorio: true, placeholder: 'Trabalho de história' },
      { k: 'date', rotulo: 'Prazo', tipo: 'data', obrigatorio: true },
      { k: 'materia', rotulo: 'Matéria', tipo: 'texto' }
    ]
  },
  livro: {
    tipo: 'livro', nome: 'Livro', pasta: 'Estudos', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Título', tipo: 'texto', obrigatorio: true },
      { k: 'autor', rotulo: 'Autor', tipo: 'texto' },
      { k: 'paginas', rotulo: 'Total de páginas', tipo: 'numero' },
      { k: 'pagina', rotulo: 'Estou na página', tipo: 'numero' },
      { k: 'status', rotulo: 'Status', tipo: 'select', opcoes: ['na fila', 'lendo', 'lido'] },
      { k: 'link', rotulo: 'Link da aula/resumo', tipo: 'texto' }
    ],
    corpo: '## Resumo\n\n## Trechos que valem citar\n'
  },

  /* ---------- Grana ---------- */
  porquinho: {
    tipo: 'porquinho', nome: 'Movimento do porquinho', pasta: 'Grana', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Descrição', tipo: 'texto', obrigatorio: true, placeholder: 'Guardei do salário' },
      { k: 'date', rotulo: 'Data', tipo: 'data', obrigatorio: true },
      { k: 'valor', rotulo: 'Valor', tipo: 'numero', obrigatorio: true },
      { k: 'direcao', rotulo: 'Movimento', tipo: 'select', opcoes: ['deposito', 'sangria'] },
      { k: 'nota', rotulo: 'Por quê', tipo: 'longo', placeholder: 'O motivo da sangria ou do depósito.' }
    ]
  },
  'meta-cofre': {
    tipo: 'meta-cofre', nome: 'Meta do porquinho', pasta: 'Grana', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Para quê', tipo: 'texto', obrigatorio: true, placeholder: 'Notebook novo' },
      { k: 'alvo', rotulo: 'Quanto quero juntar', tipo: 'numero', obrigatorio: true },
      { k: 'date', rotulo: 'Até quando', tipo: 'data' },
      { k: 'ativa', rotulo: 'Meta atual', tipo: 'bool' }
    ]
  },

  /* ---------- Vida ---------- */
  objetivo: {
    tipo: 'objetivo', nome: 'Meta', pasta: 'Vida', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Meta', tipo: 'texto', obrigatorio: true, placeholder: 'Chegar em 76 kg' },
      { k: 'date', rotulo: 'Prazo', tipo: 'data' },
      { k: 'prioridade', rotulo: 'Prioridade do momento', tipo: 'bool', dica: 'Aparece no Hoje.' }
    ]
  },
  /*
   * A tarefa diária.
   *
   * Tipo próprio, e não uma `tarefa` sem prazo: a tarefa tem data de entrega e
   * vive na aba Chegando do celular, some quando é feita e não volta. Esta se
   * repete, aparece no Hoje ao lado dos suplementos, e amanhã está lá de novo.
   * Duas coisas diferentes com o mesmo nome acabariam numa tela mostrando a
   * outra.
   *
   * Os campos são os mesmos do suplemento de propósito — é o mesmo gesto na
   * mesma tela, e o celular desenha os dois com o mesmo componente.
   */
  rotina: {
    tipo: 'rotina', nome: 'Tarefa diária', pasta: 'Vida', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'O quê', tipo: 'texto', obrigatorio: true, placeholder: 'Tomar 3 L de água' },
      { k: 'quando', rotulo: 'Quando', tipo: 'select', opcoes: ['manhã', 'tarde', 'noite', 'qualquer hora'] },
      {
        k: 'dias', rotulo: 'Dias da semana', tipo: 'dias',
        dica: 'Sem marcar nenhum, ela aparece todo dia.'
      }
    ]
  },
  anotacao: {
    tipo: 'anotacao', nome: 'Anotação', pasta: 'Vida', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Anotação', tipo: 'texto', obrigatorio: true },
      { k: 'texto', rotulo: 'Conteúdo', tipo: 'longo' },
      // O celular também marca isto. Sem o campo aqui, dava para marcar de
      // fora e não de dentro — e desmarcar exigiria editar o YAML na mão.
      { k: 'prioridade', rotulo: 'Prioridade', tipo: 'bool', dica: 'Vai para o topo da lista.' }
    ]
  },
  compra: {
    tipo: 'compra', nome: 'Item para comprar', pasta: 'Vida', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Item', tipo: 'texto', obrigatorio: true, placeholder: 'Fone novo' },
      { k: 'categoria', rotulo: 'Categoria', tipo: 'texto', placeholder: 'casa, roupa, eletrônico…' },
      { k: 'valor', rotulo: 'Valor estimado', tipo: 'numero' },
      { k: 'onde', rotulo: 'Onde', tipo: 'texto' },
      { k: 'nota', rotulo: 'Observação', tipo: 'longo' }
    ]
  },
  pessoa: {
    tipo: 'pessoa', nome: 'Pessoa', pasta: 'Vida', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
      { k: 'papel', rotulo: 'Papel', tipo: 'texto', placeholder: 'nutricionista, fisio…' },
      { k: 'telefone', rotulo: 'Telefone', tipo: 'texto' }
    ]
  },
  documento: {
    tipo: 'documento', nome: 'Documento', pasta: 'Vida/Documentos', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Documento', tipo: 'texto', obrigatorio: true, placeholder: 'RG' },
      { k: 'arquivo', rotulo: 'Arquivo em Anexos/', tipo: 'texto', placeholder: 'rg.pdf' },
      { k: 'numero', rotulo: 'Número', tipo: 'texto' },
      { k: 'validade', rotulo: 'Validade', tipo: 'data' }
    ]
  },
  conta: {
    tipo: 'conta', nome: 'Conta', pasta: 'Vida/Contas', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Serviço', tipo: 'texto', obrigatorio: true, placeholder: 'Netflix' },
      { k: 'usuario', rotulo: 'Usuário / e-mail', tipo: 'texto' },
      {
        k: 'senha', rotulo: 'Senha', tipo: 'senha',
        dica: 'Fica em texto puro no .md, como todo o resto do vault.'
      },
      { k: 'url', rotulo: 'Site', tipo: 'texto', placeholder: 'https://…' },
      { k: 'categoria', rotulo: 'Categoria', tipo: 'texto', placeholder: 'streaming, banco, jogo…' },
      { k: 'nota', rotulo: 'Observação', tipo: 'longo', placeholder: 'Plano, quem divide, vencimento…' }
    ]
  },

  /* ---------- transversais ---------- */
  evento: {
    tipo: 'evento', nome: 'Compromisso', pasta: 'Agenda', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'O quê', tipo: 'texto', obrigatorio: true, placeholder: 'Aniversário da Ana' },
      { k: 'date', rotulo: 'Data', tipo: 'data', obrigatorio: true },
      { k: 'hora', rotulo: 'Hora', tipo: 'hora' },
      { k: 'local', rotulo: 'Onde', tipo: 'texto' },
      { k: 'nota', rotulo: 'Detalhes', tipo: 'longo' }
    ]
  },
  projeto: {
    tipo: 'projeto', nome: 'Projeto', pasta: 'Dev/Projetos', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Projeto', tipo: 'texto', obrigatorio: true },
      { k: 'project', rotulo: 'Chave', tipo: 'texto', placeholder: 'nima' },
      { k: 'status', rotulo: 'Status', tipo: 'select', opcoes: ['ativo', 'pausado', 'concluído'] },
      { k: 'stack', rotulo: 'Stack', tipo: 'texto', placeholder: 'react, node, postgres' }
    ],
    corpo: '## Objetivo\n\n## Decisões\n\n## Tarefas\n- [ ] \n'
  },
  nota: {
    tipo: 'nota', nome: 'Nota', pasta: 'Dev/Projetos', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Título', tipo: 'texto', obrigatorio: true },
      { k: 'project', rotulo: 'Projeto', tipo: 'texto' }
    ]
  }
}

/** Itens que entram numa lista do diário do dia, não em arquivo próprio. */
export const ITENS: Record<string, { nome: string; campo: string; campos: Campo[] }> = {
  transacao: {
    nome: 'Transação', campo: 'transacoes',
    campos: [
      { k: 'dir', rotulo: 'Tipo', tipo: 'select', opcoes: ['saida', 'entrada'] },
      { k: 'item', rotulo: 'O quê', tipo: 'texto', obrigatorio: true, placeholder: 'Almoço' },
      { k: 'valor', rotulo: 'Valor', tipo: 'numero', obrigatorio: true },
      { k: 'cat', rotulo: 'Categoria', tipo: 'texto', placeholder: 'alimentacao' }
    ]
  },
  refeicao: {
    nome: 'Refeição extra', campo: 'extras',
    campos: [
      { k: 'item', rotulo: 'O quê', tipo: 'texto', obrigatorio: true, placeholder: 'Coxinha na cantina' },
      { k: 'kcal', rotulo: 'Calorias', tipo: 'numero' },
      { k: 'prot', rotulo: 'Proteína (g)', tipo: 'numero' }
    ]
  }
}
