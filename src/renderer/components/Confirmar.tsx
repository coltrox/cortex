import { useEffect } from 'react'

/**
 * Confirmação para ação sem volta.
 *
 * Apagar um `.md` é irreversível — não existe lixeira no vault. Um clique
 * errado no × de uma linha não pode custar uma nota. Mesmo padrão serve para
 * qualquer ação que não tem desfazer (trocar o id do vault, por exemplo):
 * explicar o que vai acontecer ANTES do clique, não depois.
 */
export function Confirmar({ titulo, texto, rotulo, perigo, aoConfirmar, aoFechar }: {
  titulo: string
  texto: string
  rotulo: string
  perigo?: boolean
  aoConfirmar: () => void
  aoFechar: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aoFechar])

  return (
    <div className="paleta-fundo" onClick={aoFechar}>
      <div className="form estreito" onClick={e => e.stopPropagation()}>
        <div className="form-topo">{titulo}</div>
        <div className="form-corpo"><p className="confirmar-texto">{texto}</p></div>
        <div className="form-rodape">
          <button className="btn-fantasma" onClick={aoFechar}>Cancelar</button>
          <button className={perigo ? 'btn perigo' : 'btn'} onClick={aoConfirmar}>{rotulo}</button>
        </div>
      </div>
    </div>
  )
}
