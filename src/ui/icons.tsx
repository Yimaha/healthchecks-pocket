// Inline SVG icons. Text glyphs (⟳ ⚙ ›) render differently per platform font
// and aren't centred in their box, so they wobble when rotated; these are
// drawn centred in a 24x24 square and inherit the text colour.

function Svg({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      className={`icon${className ? ` ${className}` : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const RefreshIcon = ({ spinning }: { spinning?: boolean }) => (
  <Svg className={spinning ? 'spinning' : undefined}>
    <path d="M20 12a8 8 0 1 1-2.34-5.66" />
    <path d="M20 4v4.5h-4.5" />
  </Svg>
)

export const SettingsIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Svg>
)

export const BackIcon = () => (
  <Svg>
    <path d="M15 18l-6-6 6-6" />
  </Svg>
)

export const ChevronIcon = () => (
  <Svg className="icon-chevron">
    <path d="M9 18l6-6-6-6" />
  </Svg>
)

export const ExternalIcon = () => (
  <Svg className="icon-small">
    <path d="M7 17L17 7" />
    <path d="M8 7h9v9" />
  </Svg>
)

export const EditIcon = () => (
  <Svg className="icon-small">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
  </Svg>
)

export const CheckMarkIcon = () => (
  <Svg className="icon-small">
    <path d="M20 6L9 17l-5-5" />
  </Svg>
)

export const PlusIcon = () => (
  <Svg className="icon-small">
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Svg>
)

export const LockIcon = () => (
  <Svg>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Svg>
)

export const UnlockIcon = () => (
  <Svg>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 7.75-1.4" />
  </Svg>
)
