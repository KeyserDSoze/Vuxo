import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { WorldScene } from './WorldScene';

export function GameCanvas() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      width: 960,
      height: 540,
      backgroundColor: '#172554',
      pixelArt: true,
      physics: {
        default: 'arcade',
        arcade: { debug: false }
      },
      scene: [WorldScene]
    });

    return () => game.destroy(true);
  }, []);

  return <div className="game-canvas" ref={host} data-testid="game-canvas" />;
}
