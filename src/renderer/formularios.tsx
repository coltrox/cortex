import { useState } from 'react'

/**
 * Formulários das lentes de vida.
 *
 * Registrar um treino, lançar um gasto ou marcar uma tarefa não deve exigir
 * escrever YAML. Cada tipo declara seus campos aqui, e um componente genérico
 * desenha o formulário — não existe código por tipo.
 *
 * O markdown continua sendo a verdade em disco; ele só deixa de ser a interface.
 */

export type Campo = {
  k: string
  rotulo: string
  tipo: 'texto' | 'numero' | 'data' | 'bool' | 'select'
  opcoes?: string[]
  placeholder?: string
  obrigatorio?: boolean
}

export type Formulario = {
  tipo: string
  nome: string
  pasta: string
  /** Como nomear o arquivo: pelo título digitado, ou pela data (um por dia). */
  nomearPor: 'titulo' | 'data'
  campos: Campo[]
}

/** Notas inteiras — cada uma vira um arquivo `.md`. */
export const FORMULARIOS: Record<string, Formulario> = {
  treino: {
    tipo: 'treino', nome: 'Treino', pasta: 'Saude', nomearPor: 'data',
    campos: [
      { k: 'date', rotulo: 'Data', tipo: 'data', obrigatorio: true },
      { k: 'grupo', rotulo: 'Grupo', tipo: 'select', opcoes: ['push', 'pull', 'legs', 'full body'] },
      { k: 'modalidade', rotulo: 'Modalidade', tipo: 'select', opcoes: ['forca', 'cardio'] }
    ]
  },
  consulta: {
    tipo: 'consulta', nome: 'Consulta', pasta: 'Saude', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Título', tipo: 'texto', obrigatorio: true, placeholder: 'Consulta nutri' },
      { k: 'date', rotulo: 'Data', tipo: 'data', obrigatorio: true },
      { k: 'profissional', rotulo: 'Profissional', tipo: 'texto' }
    ]
  },
  suplemento: {
    tipo: 'suplemento', nome: 'Suplemento', pasta: 'Saude', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Nome', tipo: 'texto', obrigatorio: true, placeholder: 'Whey' },
      { k: 'dose', rotulo: 'Dose', tipo: 'texto', placeholder: '30 g' },
      { k: 'dias', rotulo: 'Dias', tipo: 'texto', placeholder: 'todo dia' },
      { k: 'estoque', rotulo: 'Estoque', tipo: 'numero' }
    ]
  },
  materia: {
    tipo: 'materia', nome: 'Conteúdo', pasta: 'Estudos', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Conteúdo', tipo: 'texto', obrigatorio: true, placeholder: 'Trigonometria' },
      { k: 'dominio', rotulo: 'Domínio (1 a 5)', tipo: 'select', opcoes: ['1', '2', '3', '4', '5'] },
      { k: 'status', rotulo: 'Status', tipo: 'select', opcoes: ['não comecei', 'estudando', 'revisando', 'dominado'] },
      { k: 'alvo', rotulo: 'Alvo', tipo: 'select', opcoes: ['vestibular', 'etec', 'faculdade'] }
    ]
  },
  prova: {
    tipo: 'prova', nome: 'Prova', pasta: 'Estudos', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Prova', tipo: 'texto', obrigatorio: true, placeholder: 'Matemática II' },
      { k: 'date', rotulo: 'Data', tipo: 'data', obrigatorio: true },
      { k: 'materia', rotulo: 'Matéria', tipo: 'texto' }
    ]
  },
  simulado: {
    tipo: 'simulado', nome: 'Simulado', pasta: 'Estudos', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Simulado', tipo: 'texto', obrigatorio: true },
      { k: 'date', rotulo: 'Data', tipo: 'data', obrigatorio: true },
      { k: 'acertos', rotulo: 'Acertos', tipo: 'numero' },
      { k: 'total', rotulo: 'Total de questões', tipo: 'numero' }
    ]
  },
  redacao: {
    tipo: 'redacao', nome: 'Redação', pasta: 'Estudos', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Tema', tipo: 'texto', obrigatorio: true },
      { k: 'date', rotulo: 'Data', tipo: 'data', obrigatorio: true },
      { k: 'nota', rotulo: 'Nota', tipo: 'numero' }
    ]
  },
  tarefa: {
    tipo: 'tarefa', nome: 'Tarefa', pasta: 'Estudos', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Tarefa', tipo: 'texto', obrigatorio: true, placeholder: 'Trabalho de história' },
      { k: 'date', rotulo: 'Prazo', tipo: 'data', obrigatorio: true }
    ]
  },
  livro: {
    tipo: 'livro', nome: 'Livro', pasta: 'Estudos', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Título', tipo: 'texto', obrigatorio: true },
      { k: 'autor', rotulo: 'Autor', tipo: 'texto' },
      { k: 'status', rotulo: 'Status', tipo: 'select', opcoes: ['na fila', 'lendo', 'lido'] },
      { k: 'link', rotulo: 'Link', tipo: 'texto', placeholder: 'aula, resumo…' }
    ]
  },
  porquinho: {
    tipo: 'porquinho', nome: 'Movimento', pasta: 'Grana', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Descrição', tipo: 'texto', obrigatorio: true, placeholder: 'Guardei do salário' },
      { k: 'date', rotulo: 'Data', tipo: 'data', obrigatorio: true },
      { k: 'valor', rotulo: 'Valor', tipo: 'numero', obrigatorio: true },
      { k: 'direcao', rotulo: 'Direção', tipo: 'select', opcoes: ['entrada', 'saida'] }
    ]
  },
  objetivo: {
    tipo: 'objetivo', nome: 'Meta', pasta: 'Vida', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Meta', tipo: 'texto', obrigatorio: true, placeholder: 'Chegar em 76 kg' },
      { k: 'date', rotulo: 'Prazo', tipo: 'data' },
      { k: 'prioridade', rotulo: 'Prioridade', tipo: 'bool' }
    ]
  },
  anotacao: {
    tipo: 'anotacao', nome: 'Anotação', pasta: 'Vida', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Anotação', tipo: 'texto', obrigatorio: true }
    ]
  },
  compra: {
    tipo: 'compra', nome: 'Item', pasta: 'Vida', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Item', tipo: 'texto', obrigatorio: true, placeholder: 'Fone novo' },
      { k: 'categoria', rotulo: 'Categoria', tipo: 'texto', placeholder: 'casa, roupa, eletrônico…' },
      { k: 'valor', rotulo: 'Valor estimado', tipo: 'numero' }
    ]
  },
  pessoa: {
    tipo: 'pessoa', nome: 'Pessoa', pasta: 'Vida', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
      { k: 'papel', rotulo: 'Papel', tipo: 'texto', placeholder: 'nutricionista, fisio…' }
    ]
  },
  documento: {
    tipo: 'documento', nome: 'Documento', pasta: 'Vida', nomearPor: 'titulo',
    campos: [
      { k: 'titulo', rotulo: 'Documento', tipo: 'texto', obrigatorio: true, placeholder: 'RG' },
      { k: 'arquivo', rotulo: 'Arquivo em Anexos/', tipo: 'texto', placeholder: 'rg.pdf' }
    ]
  }
}

/** Itens que entram numa lista do diário do dia, não em arquivo próprio. */
export const ITENS: Record<string, { nome: string; campo: string; campos: Campo[] }> = {
  gasto: {
    nome: 'Gasto', campo: 'gastos',
    campos: [
      { k: 'hora', rotulo: 'Hora', tipo: 'texto', placeholder: '13:40' },
      { k: 'item', rotulo: 'O quê', tipo: 'texto', obrigatorio: true, placeholder: 'Almoço' },
      { k: 'valor', rotulo: 'Valor', tipo: 'numero', obrigatorio: true },
      { k: 'cat', rotulo: 'Categoria', tipo: 'texto', placeholder: 'alimentacao' }
    ]
  },
  refeicao: {
    nome: 'Refeição', campo: 'refeicoes',
    campos: [
      { k: 'hora', rotulo: 'Hora', tipo: 'texto', placeholder: '12:40' },
      { k: 'item', rotulo: 'O quê', tipo: 'texto', obrigatorio: true, placeholder: 'Almoço' },
      { k: 'kcal', rotulo: 'Calorias', tipo: 'numero' },
      { k: 'prot', rotulo: 'Proteína (g)', tipo: 'numero' }
    ]
  }
}

/* ---------- o componente ---------- */

type Props = {
  nome: string
  campos: Campo[]
  hoje: string
  inicial?: Record<string, unknown>
  aoSalvar: (valores: Record<string, unknown>) => void | Promise<void>
  aoFechar: () => void
}

export function ModalFormulario({ nome, campos, hoje, inicial, aoSalvar, aoFechar }: Props) {
  const [v, setV] = useState<Record<string, unknown>>(() => {
    const base: Record<string, unknown> = { ...inicial }
    for (const c of campos) {
      if (base[c.k] !== undefined) continue
      if (c.tipo === 'data') base[c.k] = hoje
      else if (c.tipo === 'bool') base[c.k] = false
      else if (c.tipo === 'select') base[c.k] = c.opcoes?.[0] ?? ''
      else base[c.k] = ''
    }
    return base
  })
  const [salvando, setSalvando] = useState(false)

  const faltando = campos.filter(c => c.obrigatorio && !String(v[c.k] ?? '').trim())
  const podeSalvar = faltando.length === 0 && !salvando

  const enviar = async () => {
    if (!podeSalvar) return
    setSalvando(true)
    // Campos vazios não viram frontmatter: uma chave com string vazia polui a
    // nota e atrapalha a leitura no Obsidian.
    const limpo: Record<string, unknown> = {}
    for (const c of campos) {
      const bruto = v[c.k]
      if (c.tipo === 'bool') { if (bruto === true) limpo[c.k] = true; continue }
      const s = String(bruto ?? '').trim()
      if (!s) continue
      limpo[c.k] = c.tipo === 'numero' ? Number(s.replace(',', '.')) : s
    }
    try { await aoSalvar(limpo) } finally { setSalvando(false) }
  }

  return (
    <div className="paleta-fundo" onClick={aoFechar}>
      <form
        className="form"
        onClick={e => e.stopPropagation()}
        onSubmit={e => { e.preventDefault(); void enviar() }}
      >
        <div className="form-topo">{nome}</div>

        <div className="form-corpo">
          {campos.map(c => (
            <label key={c.k} className="form-campo">
              <span className="form-rotulo">
                {c.rotulo}{c.obrigatorio && <i> obrigatório</i>}
              </span>

              {c.tipo === 'select' ? (
                <select value={String(v[c.k] ?? '')} onChange={e => setV(o => ({ ...o, [c.k]: e.target.value }))}>
                  {c.opcoes?.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : c.tipo === 'bool' ? (
                <input
                  type="checkbox"
                  className="form-check"
                  checked={v[c.k] === true}
                  onChange={e => setV(o => ({ ...o, [c.k]: e.target.checked }))}
                />
              ) : (
                <input
                  type={c.tipo === 'data' ? 'date' : c.tipo === 'numero' ? 'number' : 'text'}
                  step={c.tipo === 'numero' ? 'any' : undefined}
                  value={String(v[c.k] ?? '')}
                  placeholder={c.placeholder}
                  onChange={e => setV(o => ({ ...o, [c.k]: e.target.value }))}
                />
              )}
            </label>
          ))}
        </div>

        <div className="form-rodape">
          {faltando.length > 0 && (
            <span className="form-aviso">Falta {faltando.map(f => f.rotulo.toLowerCase()).join(', ')}</span>
          )}
          <button type="button" className="btn-fantasma" onClick={aoFechar}>Cancelar</button>
          <button type="submit" className="btn" disabled={!podeSalvar}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}
