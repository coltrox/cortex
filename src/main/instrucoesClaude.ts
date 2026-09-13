/**
 * O `CLAUDE.md` que o Cortex grava na raiz do vault.
 *
 * É para o Claude Code de OUTRA pessoa — alguém que instalou o Cortex e abriu
 * o Claude Code na pasta do vault. O Claude Code lê este arquivo sozinho ao
 * começar, e ele diz três coisas, nesta ordem:
 *
 * 1. Apresentar o app antes de qualquer coisa. Quem nunca viu o Cortex não sabe
 *    o que responder a "quais são seus treinos?" sem entender para onde isso vai.
 * 2. Entrevistar a pessoa, uma área por vez, e só nas áreas que ela ligou.
 * 3. As regras do vault — a estrutura, os tipos, o diário, e o que não tocar.
 *
 * O texto é montado aqui, no processo principal. A tela só pede para gravar.
 */

/** As áreas, com o que perguntar em cada uma. A ordem é a do app. */
const ENTREVISTA: { id: string; nome: string; perguntas: string[] }[] = [
  {
    id: 'vida', nome: 'Vida',
    perguntas: [
      'Quais metas você tem agora? Alguma tem prazo? Qual é a prioridade do momento?',
      'Quem são as pessoas importantes para ter à mão (família, médicos, professores)? Tem aniversário de alguém para lembrar?',
      'Que tarefas você quer lembrar de fazer todo dia? Em que dias da semana e em que período (manhã, tarde, noite)?',
      'Tem alguma coisa que você quer comprar? Quanto custa e onde?'
    ]
  },
  {
    id: 'saude', nome: 'Saúde',
    perguntas: [
      'Você treina? Quais são os treinos (nome, grupo muscular, exercícios com séries e repetições)?',
      'Tem plano alimentar ou dieta de nutricionista? Se tiver o arquivo, peça para ler e monte as refeições a partir dele.',
      'Toma suplementos? Qual a dose, em que momento do dia e em quais dias?',
      'Qual é a sua meta de água por dia, e de quantos ml é a garrafa que você usa?',
      'Qual é o seu peso e as medidas de hoje (cintura, braço, coxa…)?',
      'Tem consulta marcada (médico, nutri, fisio)?'
    ]
  },
  {
    id: 'conhecimento', nome: 'Estudos',
    perguntas: [
      'Tem provas marcadas? Data, matérias, local, e se precisa fazer inscrição.',
      'Quais conteúdos você está estudando, e de 1 a 5, quanto domina cada um?',
      'Tem tarefas ou trabalhos com prazo?',
      'Está lendo algum livro? Em que página?'
    ]
  },
  {
    id: 'financas', nome: 'Grana',
    perguntas: [
      'Está juntando dinheiro para alguma coisa? Quanto quer juntar e até quando?',
      'Quanto você já tem guardado para isso?'
    ]
  },
  {
    id: 'calendario', nome: 'Agenda',
    perguntas: [
      'Quais compromissos você tem nas próximas semanas? Data, hora e local.',
      'Quais datas comemorativas quer lembrar (aniversários, casamento, formatura)? Dia, mês e, se souber, o ano em que começou — é dele que sai "faz N anos".'
    ]
  },
  {
    id: 'dev', nome: 'Dev',
    perguntas: [
      'Tem projetos de programação em andamento? Qual o objetivo, a stack e o status de cada um?'
    ]
  }
]

/** Os tipos de nota que o app lê: pasta e campos do frontmatter. */
const TIPOS: { tipo: string; oque: string; pasta: string; campos: string }[] = [
  { tipo: 'evento', oque: 'Compromisso', pasta: 'Agenda', campos: 'title, date, hora, local, nota' },
  { tipo: 'data-comemorativa', oque: 'Data comemorativa (repete todo ano)', pasta: 'Agenda', campos: 'title, dia, mes, ano (opcional), oque, pessoa' },
  { tipo: 'objetivo', oque: 'Meta', pasta: 'Vida', campos: 'title, date (prazo), prioridade' },
  { tipo: 'rotina', oque: 'Tarefa diária', pasta: 'Vida', campos: 'title, quando, dias [seg, ter…] (vazio = todo dia)' },
  { tipo: 'anotacao', oque: 'Anotação', pasta: 'Vida', campos: 'title, texto, date, prioridade' },
  { tipo: 'compra', oque: 'Item para comprar', pasta: 'Vida', campos: 'title, categoria, valor, onde, nota' },
  { tipo: 'pessoa', oque: 'Pessoa', pasta: 'Vida', campos: 'title, papel, telefone, nascimento_dia, nascimento_mes, nascimento_ano' },
  { tipo: 'treino-modelo', oque: 'Treino', pasta: 'Saude/Treinos', campos: 'title, grupo, exercicios [{nome, series, reps}]' },
  { tipo: 'sessao', oque: 'Treino feito', pasta: 'Saude/Treinos', campos: 'title, date, modelo, exercicios [{nome, series, reps, carga}]' },
  { tipo: 'cardio', oque: 'Cardio', pasta: 'Saude/Treinos', campos: 'date, aparelho, minutos, distancia, pace' },
  { tipo: 'medida', oque: 'Peso e medidas', pasta: 'Saude', campos: 'date, peso, gordura, cintura, peito, braco, coxa, quadril…' },
  { tipo: 'plano', oque: 'Plano alimentar', pasta: 'Saude/Dieta', campos: 'title, objetivo, ativo: true, kcal, prot, refeicoes [{nome, hora, itens, kcal, prot, dias}]' },
  { tipo: 'suplemento', oque: 'Suplemento', pasta: 'Saude', campos: 'title, dose, quando, dias' },
  { tipo: 'hidratacao', oque: 'Meta de água', pasta: 'Saude', campos: 'title, meta (ml), copo (ml)' },
  { tipo: 'consulta', oque: 'Consulta', pasta: 'Saude', campos: 'title, date, hora, profissional, local' },
  { tipo: 'prova', oque: 'Prova', pasta: 'Estudos/Provas', campos: 'title, date, materia, local, inscricao' },
  { tipo: 'simulado', oque: 'Simulado', pasta: 'Estudos', campos: 'title, date, acertos, total, materia' },
  { tipo: 'materia', oque: 'Conteúdo de estudo', pasta: 'Estudos/Conteudos', campos: 'title, materia, dominio (1–5), status, prioridade' },
  { tipo: 'tarefa', oque: 'Tarefa com prazo', pasta: 'Estudos', campos: 'title, date (prazo), materia' },
  { tipo: 'livro', oque: 'Livro', pasta: 'Estudos', campos: 'title, autor, paginas, pagina, status' },
  { tipo: 'meta-cofre', oque: 'Meta do porquinho', pasta: 'Grana', campos: 'title, alvo, date, ativa: true' },
  { tipo: 'porquinho', oque: 'Movimento do porquinho', pasta: 'Grana', campos: 'title, date, valor, direcao (deposito | sangria)' },
  { tipo: 'projeto', oque: 'Projeto', pasta: 'Dev/Projetos', campos: 'title, project, status, stack' }
]

export function instrucoesParaClaude(areasLigadas: string[]): string {
  const ligadas = ENTREVISTA.filter(a => areasLigadas.includes(a.id))
  const nomesLigadas = ligadas.map(a => a.nome).join(', ') || 'nenhuma além do Hoje'

  const entrevista = ligadas.map(a => [
    `### ${a.nome}`,
    '',
    ...a.perguntas.map(p => `- ${p}`)
  ].join('\n')).join('\n\n')

  const tabela = [
    '| tipo | o que é | pasta | campos do frontmatter |',
    '|---|---|---|---|',
    ...TIPOS.map(t => `| \`${t.tipo}\` | ${t.oque} | \`${t.pasta}/\` | ${t.campos} |`)
  ].join('\n')

  return `# Instruções para o Claude Code — vault do Cortex

Este arquivo foi gravado pelo Cortex (Configurações → Claude Code) e é lido por
você, Claude, quando o Claude Code abre nesta pasta. Siga as seções na ordem.

## 1. Primeiro: apresente o app

Na primeira conversa, ANTES de fazer qualquer pergunta ou mexer em qualquer
arquivo, explique à pessoa — em linguagem simples, sem jargão — como o Cortex
funciona:

- O **Cortex** é um app de computador que organiza a vida dela em notas. Cada
  nota é um arquivo de texto (\`.md\`) nesta pasta, que é o "vault". O app lê
  essas notas e monta as telas: Hoje, Saúde, Estudos, Grana, Vida, Dev, Agenda
  e o Cortex, que mostra tudo como uma rede.
- As áreas ligadas neste vault são: **${nomesLigadas}**.
- Existe um **app de celular** (o Cortex no bolso) para registrar o dia: marcar
  suplemento, refeição, água, treino, gasto, anotação e compromisso. O que é
  registrado lá chega ao computador e vira nota ou entra no diário do dia.
- Você (Claude) pode ajudar a **preencher o vault**: montar treinos, plano
  alimentar, provas, metas, datas comemorativas, e escrever o **resumo do
  diário** de cada dia.

Termine perguntando se ela quer começar a preencher agora.

## 2. Depois: entreviste a pessoa, uma área por vez

Só nas áreas ligadas. Regras:

- Uma área por vez, e poucas perguntas de cada vez. Espere a resposta.
- Antes de gravar, mostre em lista o que vai criar e peça confirmação.
- Nunca invente dado. Pergunta que a pessoa não sabe responder fica em branco.
- Quando ela mandar um arquivo (dieta, cronograma, edital), leia e transforme
  em notas — sem resumir a ponto de perder informação.

${entrevista || '_Nenhuma área ligada além do Hoje. Pergunte se ela quer ligar alguma nas Configurações do app._'}

## 3. Como as notas são escritas

Cada nota é um arquivo \`.md\` com um cabeçalho YAML entre \`---\`. O campo
\`tipo\` diz o que a nota é, e o app lê exatamente os nomes de campo abaixo.

- Datas em \`AAAA-MM-DD\`, horas em \`HH:MM\`, dias da semana como \`seg, ter, qua, qui, sex, sab, dom\`.
- O nome do arquivo é o título: \`Agenda/Dentista.md\`, com \`title: Dentista\`.
- Termine a nota com a seção \`### Dependências da Rede\` e links \`[[Outra nota]]\` para as notas relacionadas — é isso que liga a rede do Cortex.

${tabela}

## 4. O diário

Existe um diário por dia: \`Diario/AAAA-MM-DD.md\`.

- **O cabeçalho é do app.** Ele é preenchido sozinho a partir dos registros do
  dia: \`suplementos_feitos\`, \`dieta_feitas\`, \`dieta_detalhes\` (quanto
  comeu e o que trocou), \`rotinas_feitas\`, \`agua_ml\`, \`transacoes\` (gastos
  e entradas), \`estudos\` e \`extras\`. Não altere esses campos.
- **O texto é seu.** O diário são anotações que você escreve a partir de TUDO
  que foi registrado no dia. Quando a pessoa pedir (ou ao fim do dia), leia o
  cabeçalho do diário e as notas com \`date\` daquele dia — treino feito,
  cardio, medidas, anotações, compromissos, provas, porquinho — e escreva, na
  seção \`## Como foi o dia\`, um resumo curto do que aconteceu: o que comeu e se
  seguiu o plano, o treino, a água, o estudo, os gastos, os compromissos e as
  anotações. Tom de diário. Se já houver texto seu ali, atualize em vez de
  repetir.

## 5. O que nunca fazer

- Não mexa na pasta \`.vault/\` — é o índice e a configuração do app.
- Não abra nem edite arquivos de pastas trancadas (\`Vida/Contas\`,
  \`Vida/Documentos\` quando estão cifradas): senhas e documentos ficam fora.
- Não renomeie campos nem troque o \`tipo\` de uma nota que já existe.
- Não apague notas sem a pessoa pedir.
- A pasta \`Anexos/\` guarda arquivos (PDF, imagem): não edite, só referencie.
`
}
