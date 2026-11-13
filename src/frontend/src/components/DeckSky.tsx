import type { CSSProperties } from 'react';

// Fixed, original star map (percent coordinates) so every visit shows the same sky.
const stars: ReadonlyArray<readonly [x: number, y: number, size: number, twinkle: boolean]> = [
  [4, 6, 2, true], [11, 18, 1, false], [17, 4, 2, false], [23, 27, 1, true], [29, 11, 2, false],
  [36, 3, 1, false], [41, 19, 2, true], [48, 8, 1, false], [55, 15, 2, false], [61, 4, 1, true],
  [67, 22, 1, false], [72, 9, 2, true], [78, 17, 1, false], [84, 5, 2, false], [90, 13, 1, true],
  [96, 24, 2, false], [7, 38, 1, false], [14, 52, 2, true], [9, 71, 1, false], [3, 88, 2, false],
  [21, 63, 1, true], [93, 41, 1, false], [97, 58, 2, true], [88, 74, 1, false], [94, 91, 2, false],
  [52, 96, 1, true], [33, 92, 1, false], [70, 95, 2, false],
];

// The VUXO four-pointed sigil, traced as a constellation in the lower-left sky.
const sigil: ReadonlyArray<readonly [x: number, y: number]> = [
  [60, 6], [72, 48], [114, 60], [72, 72], [60, 114], [48, 72], [6, 60], [48, 48],
];

/** Decorative, non-interactive night sky behind the off-world deck. */
export function DeckSky() {
  const path = sigil.map(([x, y], index) => (index === 0 ? 'M' : 'L') + x + ' ' + y).join(' ') + ' Z';
  return (
    <div className="vuxo-deck__sky" aria-hidden="true" data-testid="game-deck-sky">
      <div className="vuxo-deck__aurora" />
      {stars.map(([x, y, size, twinkle], index) => (
        <span
          key={index}
          className={twinkle ? 'vuxo-deck__star vuxo-deck__star--twinkle' : 'vuxo-deck__star'}
          style={{ left: x + '%', top: y + '%', '--star-size': size + 'px', animationDelay: -(index % 7) * .7 + 's' } as CSSProperties}
        />
      ))}
      <svg className="vuxo-deck__constellation" viewBox="0 0 120 120" focusable="false">
        <path d={path} />
        {sigil.map(([x, y], index) => <circle key={index} cx={x} cy={y} r={index % 2 === 0 ? 2.6 : 1.6} />)}
      </svg>
      <span className="vuxo-deck__comet" />
    </div>
  );
}
