/**
 * Ícones do Cortex — SVG inline, traço uniforme de 1.6px.
 *
 * Escritos à mão em vez de importados: uma biblioteca de ícones seria a
 * primeira dependência do renderer, e o app inteiro precisa de oito.
 */

type Props = { size?: number }

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
})

export function IconeHoje({ size = 19 }: Props) {
  return (
    <svg {...base(size)}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <circle cx="12" cy="15.5" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconeNotas({ size = 19 }: Props) {
  return (
    <svg {...base(size)}>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M15 3v4h4M9.5 12h6M9.5 16h4" />
    </svg>
  )
}

export function IconeVida({ size = 19 }: Props) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </svg>
  )
}

export function IconeSaude({ size = 19 }: Props) {
  return (
    <svg {...base(size)}>
      <path d="M3 12h4l2-5 3 10 2.5-6 1.5 3h5" />
    </svg>
  )
}

export function IconeDev({ size = 19 }: Props) {
  return (
    <svg {...base(size)}>
      <path d="M8.5 8.5 5 12l3.5 3.5M15.5 8.5 19 12l-3.5 3.5M13.5 5.5l-3 13" />
    </svg>
  )
}

export function IconeConhecimento({ size = 19 }: Props) {
  return (
    <svg {...base(size)}>
      <path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
      <path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
    </svg>
  )
}

export function IconeFinancas({ size = 19 }: Props) {
  return (
    <svg {...base(size)}>
      <path d="M4 18V9M9.3 18V5M14.7 18v-6M20 18v-9" />
      <path d="M3 21h18" />
    </svg>
  )
}

export function IconeCalendario({ size = 19 }: Props) {
  return (
    <svg {...base(size)}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  )
}
