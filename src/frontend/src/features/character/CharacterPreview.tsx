import { Box } from '@mui/material'
import type { CharacterAppearanceDraft } from './appearance'
import { PREVIEW_COLORS } from './appearance'

function color(id: string, fallback: string) {
  return PREVIEW_COLORS[id] ?? fallback
}

export function CharacterPreview({ appearance }: { appearance: CharacterAppearanceDraft }) {
  const bodyWidth = appearance.bodyType === 'body-1' ? 70 : appearance.bodyType === 'body-3' ? 98 : 84
  const bodyX = 110 - bodyWidth / 2
  const faceRx = appearance.face === 'face-2' ? 34 : appearance.face === 'face-3' ? 39 : 36
  const eyeY = appearance.face === 'face-3' ? 76 : 72
  const skin = color(appearance.skinTone, '#d7a17d')
  const hair = color(appearance.hairColor, '#20242c')
  const top = color(appearance.topColor, '#3f6fd8')
  const bottom = color(appearance.bottomColor, '#20242c')
  const shoe = color(appearance.shoeColor, '#e9edf3')

  return (
    <Box
      data-testid="character-preview"
      sx={{
        width: '100%',
        maxWidth: 360,
        mx: 'auto',
        borderRadius: 4,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.default',
        overflow: 'hidden',
        aspectRatio: '4 / 5',
      }}
    >
      <svg viewBox="0 0 220 280" role="img" aria-label="Vuxo character preview" width="100%" height="100%">
        <defs>
          <linearGradient id="preview-bg" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.05" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0.14" />
          </linearGradient>
        </defs>
        <rect width="220" height="280" fill="url(#preview-bg)" />
        <ellipse cx="110" cy="258" rx="72" ry="10" fill="currentColor" opacity="0.12" />

        <rect x="72" y="210" width="30" height="38" rx="11" fill={skin} />
        <rect x="118" y="210" width="30" height="38" rx="11" fill={skin} />
        <rect x="66" y="238" width="42" height={appearance.shoeStyle === 'shoe-2' ? 16 : 12} rx={appearance.shoeStyle === 'shoe-3' ? 2 : 6} fill={shoe} />
        <rect x="112" y="238" width="42" height={appearance.shoeStyle === 'shoe-2' ? 16 : 12} rx={appearance.shoeStyle === 'shoe-3' ? 2 : 6} fill={shoe} />

        {appearance.bottomStyle === 'skirt' ? (
          <path d={`M${bodyX + 5} 169 H${bodyX + bodyWidth - 5} L${bodyX + bodyWidth + 7} 220 H${bodyX - 7} Z`} fill={bottom} />
        ) : (
          <>
            <rect x={bodyX + 4} y="168" width={bodyWidth - 8} height="35" rx="7" fill={bottom} />
            <rect x="75" y="197" width="31" height="28" rx="6" fill={bottom} />
            <rect x="114" y="197" width="31" height="28" rx="6" fill={bottom} />
          </>
        )}

        <rect x={bodyX} y="111" width={bodyWidth} height="67" rx="22" fill={top} />
        <rect x={bodyX - 18} y="119" width="23" height="75" rx="11" fill={skin} />
        <rect x={bodyX + bodyWidth - 5} y="119" width="23" height="75" rx="11" fill={skin} />
        <rect x="100" y="99" width="20" height="21" rx="8" fill={skin} />
        <ellipse cx="110" cy="69" rx={faceRx} ry="42" fill={skin} />

        {appearance.hairStyle === 'hair-1' && <path d="M75 65 Q77 21 110 24 Q145 22 146 65 Q130 46 110 48 Q91 45 75 65Z" fill={hair} />}
        {appearance.hairStyle === 'hair-2' && <path d="M73 70 Q70 24 110 22 Q151 23 148 73 L141 91 L136 55 Q111 37 82 57 L79 91Z" fill={hair} />}
        {appearance.hairStyle === 'hair-3' && <path d="M69 69 Q67 19 110 20 Q154 19 151 75 L145 112 L132 108 L137 54 Q109 36 80 56 L86 109 L73 112Z" fill={hair} />}
        {appearance.hairStyle === 'hair-4' && <path d="M74 62 Q79 20 110 24 Q142 20 147 61 Q137 49 130 52 Q125 37 113 49 Q100 34 94 51 Q83 43 74 62Z" fill={hair} />}

        <circle cx="96" cy={eyeY} r="3.5" fill="#20242c" />
        <circle cx="124" cy={eyeY} r="3.5" fill="#20242c" />
        {appearance.face === 'face-1' && <path d="M99 88 Q110 95 121 88" fill="none" stroke="#704b35" strokeWidth="2.5" strokeLinecap="round" />}
        {appearance.face === 'face-2' && <path d="M101 89 H119" fill="none" stroke="#704b35" strokeWidth="2.5" strokeLinecap="round" />}
        {appearance.face === 'face-3' && <path d="M100 87 Q110 91 120 87" fill="none" stroke="#704b35" strokeWidth="2.5" strokeLinecap="round" />}
      </svg>
    </Box>
  )
}
