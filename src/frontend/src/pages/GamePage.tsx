import { GameCanvas } from '../game/GameCanvas';

export function GamePage() {
  return (
    <section className="page">
      <h1>World prototype</h1>
      <p>Placeholder originale generato da codice. Usa WASD o le frecce per muoverti.</p>
      <GameCanvas />
    </section>
  );
}
