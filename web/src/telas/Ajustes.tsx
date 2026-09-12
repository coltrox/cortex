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
 * O endereço do calendário, com o passo a passo de assinar.
 *
 * Um endereço, e não uma integração com login. A API do Google exigiria
 * aplicativo registrado, tela de consentimento, chave secreta e token que
 * expira — e serviria só ao Google, porque o iPhone não a entende. Este mesmo
 * endereço os dois assinam, sem login nenhum.
 *
 * As instruções aparecem uma de cada vez, pelo aparelho, como no tutorial de
 * instalação: no computador saem as duas, porque ali quem lê está montando o
 * celular e não usando este app.
 */
function CartaoCalendario({ vault }: { vault: string | null }) {
  const [copiado, setCopiado] = useState(false)
  if (!vault) return null

  const endereco = `${window.location.origin}/agenda.ics?vault=${vault}`
  // O MESMO endereço com outro protocolo. É o que faz o sistema entender
  // "assinar isto" em vez de "baixar um arquivo".
  const webcal = endereco.replace(/^https?:/, 'webcal:')
  const sistema = qualSistema(navigator.userAgent, navigator.maxTouchPoints)

  const copiar = (): void => {
    // `clipboard` falha em página sem HTTPS e em navegador antigo. Aí o
    // endereço continua na tela, selecionável — que é o caminho de sempre.
    navigator.clipboard?.writeText(endereco)
      .then(() => {
        setCopiado(true)
        setTimeout(() => setCopiado(false), 2000)
      })
      .catch(() => {})
  }

  return (
    <div className="cartao-ajuste">
      <div className="cartao-ajuste-nome">Calendário</div>
      <p className="cartao-ajuste-txt">
        Provas, compromissos e datas comemorativas do Cortex, dentro do seu
        calendário. Assine este endereço:
      </p>

      {/* O endereço inteiro na tela, quebrando onde precisar: ele carrega o id
          do vault e é longo demais para caber numa linha de celular. */}
      <code className="cal-endereco">{endereco}</code>

      {/*
        * Um toque em cada sistema, em vez de seis passos escritos.
        *
        * `webcal:` é o mesmo endereço com outro protocolo — o iPhone o entende
        * como "assinar isto" e abre o Calendário já no diálogo certo.
        *
        * O Google tem o equivalente: `/calendar/r?cid=` abre o Google Agenda
        * direto na pergunta "adicionar este calendário?". Ele precisa do
        * endereço codificado e de uma sessão aberta do Google — por isso o
        * passo a passo continua aqui embaixo, recolhido, para quando não abrir.
        */}
      <div className="cal-botoes">
        {(sistema === 'iphone' || sistema === 'outro') && (
          <a className="btn btn-principal" href={webcal}>Assinar no iPhone</a>
        )}
        {(sistema === 'android' || sistema === 'outro') && (
          <a
            className="btn btn-principal"
            href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`}
            target="_blank"
            rel="noreferrer"
          >
            Assinar no Google
          </a>
        )}
      </div>

      <button className="btn btn-secundario" type="button" onClick={copiar}>
        {copiado ? 'Copiado' : 'Copiar endereço'}
      </button>

      <details className="cal-manual">
        <summary>Se o botão não abrir, dá para fazer à mão</summary>
        <div className="cal-passos">
          <span className="cal-titulo">No Google Agenda</span>
          <ol>
            <li>Abra o Google Agenda pelo computador — o app do celular não assina.</li>
            <li>Em "Outras agendas", toque no + e escolha "De URL".</li>
            <li>Cole o endereço e confirme.</li>
          </ol>
        </div>
        <div className="cal-passos">
          <span className="cal-titulo">No iPhone</span>
          <ol>
            <li>Ajustes, Aplicativos, Calendário, Contas.</li>
            <li>Adicionar conta, Outra, Adicionar calendário assinado.</li>
            <li>Cole o endereço e toque em Seguinte.</li>
          </ol>
        </div>
      </details>

      <p className="cartao-ajuste-txt cal-ressalva">
        É de mão única: o que está no Cortex aparece no calendário, e o que
        você criar no calendário não volta para cá. O Google relê algumas vezes
        por dia; o iPhone deixa escolher de quanto em quanto tempo.
      </p>
    </div>
  )
}
