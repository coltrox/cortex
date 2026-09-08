import { useState } from 'react'
import { eventoEstudo } from '../montar'
import { Cabecalho, Botao, Campo, CampoNumero, Aviso, Chips } from '../componentes'
import type { useEnvio } from '../envio'
import type { Tela } from '../App'

/**
 * As matérias, numa lista fixa.
 *
 * Campo livre aqui mataria a métrica: "Mat", "matemática" e "Matemática"
 * viram três matérias diferentes no gráfico, e aí o gráfico não serve para
 * nada. "Outra" existe para o que não está na lista — e só aí abre o campo.
 */
const MATERIAS = [
  'Matemática', 'Física', 'Química', 'Biologia',
  'História', 'Geografia', 'Português', 'Redação',
  'Inglês', 'Filosofia', 'Sociologia', 'Outra'
]

/** Atalhos de duração. O cursinho é de quatro horas; o resto é o resto. */
const MINUTOS_RAPIDOS = ['30', '60', '90', '120', '240']

/**
 * Registrar uma sessão de estudo que já aconteceu.
 *
 * Não é cronômetro, e a escolha é do dono: no cursinho das 14h ninguém vai
 * mexer no celular para apertar começar, e um cronômetro esquecido ligado
 * grava seis horas de estudo que não houve — pior do que não ter o dado.
 *
 * Questões e acertos são opcionais porque nem todo estudo tem exercício: ler
 * a teoria de uma matéria é estudo, e obrigar um número ali faria a pessoa
 * inventar um.
 */
export function Estudo(p: { envio: ReturnType<typeof useEnvio>; irPara: (t: Tela) => void }) {
  const [materia, setMateria] = useState(MATERIAS[0])
  const [outra, setOutra] = useState('')
  const [minutos, setMinutos] = useState('')
  const [questoes, setQuestoes] = useState('')
  const [acertos, setAcertos] = useState('')
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const nomeDaMateria = materia === 'Outra' ? outra : materia

  const enviar = () => {
    try {
      p.envio.registrar(eventoEstudo(nomeDaMateria, Number(minutos), {
        questoes: questoes ? Number(questoes) : undefined,
        acertos: acertos ? Number(acertos) : undefined,
        obs: obs || undefined
      }))
      p.irPara('hoje')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para registrar')
    }
  }

  return (
    <div className="tema-estudo">
      <Cabecalho titulo="Estudo" aoVoltar={() => p.irPara('hoje')} />
      {erro && <Aviso tom="erro" aoFechar={() => setErro(null)}>{erro}</Aviso>}
      <div className="bloco">
        <span className="campo-rotulo">Matéria</span>
        <Chips opcoes={MATERIAS} escolhida={materia} aoEscolher={setMateria} />
        {/* Só quando é "Outra": um campo de texto sempre visível convida a
            digitar o nome à mão, e aí a métrica volta a ter três grafias da
            mesma matéria. */}
        {materia === 'Outra' && (
          <Campo rotulo="Qual?" valor={outra} aoMudar={setOutra} dica="Atualidades" />
        )}

        <CampoNumero rotulo="Minutos" valor={minutos} aoMudar={setMinutos} dica="60" grande />
        {/* Os atalhos existem porque o teclado numérico do celular custa três
            toques para dizer o que um chip diz em um. */}
        <Chips opcoes={MINUTOS_RAPIDOS} escolhida={minutos} aoEscolher={setMinutos} />

        <CampoNumero rotulo="Questões (opcional)" valor={questoes} aoMudar={setQuestoes} dica="20" />
        <CampoNumero rotulo="Acertos (opcional)" valor={acertos} aoMudar={setAcertos} dica="14" />
        <Campo rotulo="Observação" valor={obs} aoMudar={setObs} linhas={3}
          dica="o que travou, o que rendeu" />

        <Botao tipo="principal" aoClicar={enviar}>Registrar estudo</Botao>
      </div>
    </div>
  )
}
