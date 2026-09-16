import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <section className="page hero">
      <p className="eyebrow">Versione 0.0.1</p>
      <h1>Il primo mondo di Vuxo sta nascendo.</h1>
      <p>La prima milestone porta il giocatore dalla creazione del personaggio a un mondo 2D condiviso in tempo reale.</p>
      <Link className="button" to="/game">Apri il prototipo Phaser</Link>
    </section>
  );
}
