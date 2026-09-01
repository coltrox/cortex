import qr from 'qrcode-generator'

/**
 * O QR que conecta o celular.
 *
 * Ele carrega um LINK, não o id cru: a câmera do celular abre link sozinha,
 * sem app de leitor, sem permissão extra, sem eu ter que escrever um
 * decodificador de QR dentro do app web — que seria a parte mais frágil de
 * todo o caminho. O id viaja no fragmento (`#id=`) de propósito: fragmento
 * não é enviado ao servidor, então o id não aparece em log de acesso nenhum,
 * nem da Vercel nem de proxy no meio.
 *
 * Sem endereço configurado o QR carrega o id sozinho — quem ler vê o id e
 * cola à mão. É o modo degradado, não um erro.
 *
 * O desenho sai como SVG de um caminho só, em vez de uma matriz de <rect>:
 * um QR de 33x33 daria mais de mil elementos no DOM, e nenhum deles é
 * clicável nem animado.
 */
export function Qr({ conteudo, lado = 180 }: { conteudo: string; lado?: number }) {
  // 0 = o menor tamanho que couber o conteúdo. 'M' aguenta ~15% do desenho
  // danificado — o suficiente para uma tela com reflexo ou um dedo no canto.
  const codigo = qr(0, 'M')
  codigo.addData(conteudo)
  codigo.make()

  const n = codigo.getModuleCount()
  const partes: string[] = []
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (codigo.isDark(y, x)) partes.push(`M${x} ${y}h1v1h-1z`)
    }
  }

  // A margem clara de 4 módulos não é enfeite: sem ela muitos leitores não
  // encontram o código.
  const margem = 4
  const total = n + margem * 2

  return (
    <svg
      className="qr"
      width={lado}
      height={lado}
      viewBox={`0 0 ${total} ${total}`}
      role="img"
      aria-label="QR para conectar o celular"
    >
      <rect width={total} height={total} fill="#FFFFFF" />
      <g transform={`translate(${margem} ${margem})`}>
        <path d={partes.join('')} fill="#000000" />
      </g>
    </svg>
  )
}

/** O que vai dentro do QR: link quando há endereço, id cru quando não há. */
export function conteudoDoQr(vaultId: string, enderecoApp: string): string {
  return enderecoApp ? `${enderecoApp}/#id=${vaultId}` : vaultId
}
