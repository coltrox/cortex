/** Um painel lateral: o ícone do botão que mostra e esconde o menu do app. */
export function IconeLateral({ aberta = true }: { aberta?: boolean }) {
  return (
    <svg className="icone-lateral" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" fill="none">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6 2.8v10.4" stroke="currentColor" strokeWidth="1.3" />
      {aberta && <rect x="2.4" y="3.4" width="3" height="9.2" rx="1" fill="currentColor" opacity=".35" />}
    </svg>
  )
}
