import { useState } from 'react'
import { guardadoDoNavegador } from '../guardado'
import { lerVaultId, gravarVaultId } from '../ajustes'
import { haQuantoTempo, hidratacao } from '../cardapio'
import { lerTema, gravarTema, aplicarTema, type Tema } from '../tema'
import { qualSistema } from '../instalar'
import { Cabecalho, Botao, Campo, Aviso } from '../componentes'
import type { UsoDoCardapio } from '../envio'
import type { Tela } from '../App'

/**
 * Ajustes.
 *
 * Dois estados, e o segundo é quase vazio de propósito. Conectado, não há o
 * que ajustar: o vault está ligado, os dados chegam sozinhos, e uma tela
 * cheia de números e botões só daria a impressão de que algo precisa de
 * atenção. Fica o essencial — a quem este celular está ligado — e a saída
 * para trocar.
 *
 * Não há botão de atualizar em lugar nenhum. Manter os dados em dia é
 * trabalho do app: ele busca ao abrir, ao voltar para a tela, quando a rede
 * volta, e a cada dois minutos.
 */
export function Ajustes(p: { cardapio: UsoDoCardapio; irPara: (t: Tela) => void }) {
  const atual = lerVaultId(guardadoDoNavegador)
  const [trocando, setTrocando] = useState(false)
  const [id, setId] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [tema, setTema] = useState<Tema>(() => lerTema(guardadoDoNavegador))
  const agua = hidratacao(p.cardapio.cardapio)

  const salvar = async (): Promise<void> => {
    try {
      gravarVaultId(guardadoDoNavegador, id)
      setErro(null)
      setTrocando(false)
      setId('')
      // Buscar na hora é a única confirmação honesta de que o id está certo:
      // se voltar vazio, o aviso aparece agora e não amanhã. `comoConexao` é
      // o que faz vazio virar aviso — fora deste instante, vazio é normal.
      await p.cardapio.atualizar({ comoConexao: true })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'id inválido')
    }
  }

  const quantos = p.cardapio.cardapio.itens.length
  const conectado = atual !== null && !trocando

  /* ---------- conectado: quase nada ---------- */

  if (conectado) {
    const falhou = p.cardapio.erro !== null
    const quando = haQuantoTempo(p.cardapio.cardapio.atualizadoEm)
    return (
      <div className="tema-hoje">
        <Cabecalho titulo="Ajustes" />

        <div className="bloco">
          {/*
            * O cartão da integração, como no desenho.
            *
            * Era uma tela centrada com um selo grande no meio. Virou cartão
            * para caber junto dos outros ajustes — e porque o estado da
            * conexão é UM ajuste entre vários, não a tela inteira.
            */}
          <div className="cartao-ajuste">
            <div className="integra-topo">
              <div>
                <div className="integra-tag">integração</div>
                <div className="integra-nome">Cortex</div>
              </div>
              <span className={`integra-estado ${falhou ? 'e-falha' : ''}`}>
                <i />
                {falhou ? 'sem dados' : 'ligado'}
              </span>
            </div>
            <p className="cartao-ajuste-txt">
              {falhou
                ? p.cardapio.erro
                : quantos > 0
                  ? 'Treinos, dieta e agenda chegam sozinhos. Não há nada para apertar aqui.'
                  : 'Assim que houver algo no Cortex, ele aparece aqui sozinho.'}
            </p>
            {/* O horário responde "ainda está funcionando?", que é a pergunta
                que traz alguém a esta tela. Não é botão, e não vira um. */}
            {quando && <div className="integra-quando">Atualizado {quando}</div>}
            <Botao aoClicar={() => { setTrocando(true); setId('') }}>
              Trocar de vault
            </Botao>
          </div>

          {/*
            * O calendário, para o Google e o iPhone assinarem.
            *
            * Um endereço, e não uma integração com login. A API do Google
            * exigiria aplicativo registrado, consentimento e token que expira
            * — e serviria só ao Google. Este mesmo endereço os dois assinam.
            *
            * De mão única, e o cartão diz isso: o que está no Cortex aparece
            * no calendário; o que for criado no calendário não volta.
            */}
          <CartaoCalendario vault={atual} />

          {/*
            * Aparência.
            *
            * O app era escuro sem escolha. A escolha entra junto com a virada
            * para o claro, que é o que evita a pergunta óbvia de quem gostava
            * do escuro.
            */}
          <div className="cartao-ajuste">
            <div className="cartao-ajuste-nome">Aparência</div>
            <div className="tema-opcoes">
              {(['claro', 'escuro', 'sistema'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  className={`tema-opcao ${tema === t ? 'ligada' : ''}`}
                  aria-pressed={tema === t}
                  onClick={() => {
                    gravarTema(guardadoDoNavegador, t)
                    aplicarTema(t)
                    setTema(t)
                  }}
                >
                  {t === 'claro' ? 'Claro' : t === 'escuro' ? 'Escuro' : 'Sistema'}
                </button>
              ))}
            </div>
            <p className="cartao-ajuste-txt">
              {tema === 'sistema'
                ? 'Acompanha o aparelho: escuro à noite, se ele estiver assim.'
                : `Sempre ${tema}, independente do aparelho.`}
            </p>
          </div>

          {/*
            * Hidratação: mostra, não edita.
            *
            * O desenho põe aqui os botões de tamanho de garrafa e de meta. No
            * app de verdade quem decide isso é o Cortex, que publica os dois
            * no cardápio — e dois lugares editando o mesmo número divergem no
            * primeiro dia sem sinal. Aqui fica a leitura, e o caminho.
            */}
          {agua && (
            <div className="cartao-ajuste">
              <div className="cartao-ajuste-nome">Hidratação</div>
              <div className="ajuste-par">
                <span>Garrafa</span>
                <b>{agua.copo} ml</b>
              </div>
              <div className="ajuste-par">
                <span>Meta do dia</span>
                <b>{agua.meta > 0 ? `${agua.meta} ml` : 'sem meta'}</b>
              </div>
              <p className="cartao-ajuste-txt">
                Definidas no Cortex, em Saúde. O celular só mostra e registra.
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ---------- sem vault, ou trocando ---------- */

  return (
    <div className="tema-hoje">
      <Cabecalho
        titulo={atual ? 'Trocar de vault' : 'Conectar'}
        aoVoltar={atual ? () => { setTrocando(false); setErro(null) } : undefined}
      />

      <Aviso titulo={atual ? 'Trocar desliga o vault atual' : 'Ligue este celular ao seu Cortex'}>
        Leia o QR que está no Cortex, em Configurações → Celular. Ou cole o id
        do vault à mão.
      </Aviso>

      {erro && <Aviso tom="erro" aoFechar={() => setErro(null)}>{erro}</Aviso>}

      <div className="bloco">
        <Botao tipo="principal" aoClicar={() => p.irPara('lerqr')}>
          Ler QR com a câmera
        </Botao>

        <Campo
          rotulo="Ou cole o id do vault"
          valor={id}
          aoMudar={v => { setId(v); setErro(null) }}
          dica="3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f607"
        />
        <Botao aoClicar={() => void salvar()} desligado={id.trim() === ''}>
          Conectar com este id
        </Botao>
      </div>
    </div>
  )
}

/**
 * Conectar o calendário — um botão, e nada mais.
 *
 * Havia aqui o endereço na tela, um botão de copiar e o passo a passo dos
 * dois sistemas. Tudo aquilo existia porque a primeira versão não tinha o
 * botão: era o material de quem ia fazer à mão.
 *
 * `webcal:` é o mesmo endereço com outro protocolo, e é o que faz o sistema
 * entender "assinar isto" em vez de "baixar um arquivo": o iPhone abre o
 * Calendário já no diálogo de assinar, e o Google Agenda tem o equivalente.
 * Com os dois funcionando, o endereço cru na tela era só um id de vault
 * exposto à toa.
 *
 * Um sistema de cada vez, como no tutorial de instalação. No computador
 * saem os dois, porque ali quem lê está montando o celular.
 */
function CartaoCalendario({ vault }: { vault: string | null }) {
  if (!vault) return null

  const endereco = `${window.location.origin}/agenda.ics?vault=${vault}`
  const webcal = endereco.replace(/^https?:/, 'webcal:')
  const sistema = qualSistema(navigator.userAgent, navigator.maxTouchPoints)

  return (
    <div className="cartao-ajuste">
      <div className="cartao-ajuste-nome">Calendário</div>
      <p className="cartao-ajuste-txt">
        Provas, compromissos e datas comemorativas do Cortex, dentro do
        calendário do seu celular.
      </p>

      <div className="cal-botoes">
        {(sistema === 'iphone' || sistema === 'outro') && (
          <a className="btn btn-principal" href={webcal}>Conectar ao iPhone</a>
        )}
        {(sistema === 'android' || sistema === 'outro') && (
          <a
            className="btn btn-principal"
            href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`}
            target="_blank"
            rel="noreferrer"
          >
            Conectar ao Google
          </a>
        )}
      </div>

      <p className="cartao-ajuste-txt cal-ressalva">
        É de mão única: o que está no Cortex aparece no calendário, e o que
        você criar no calendário não volta para cá.
      </p>
    </div>
  )
}
