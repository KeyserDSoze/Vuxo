import { Link, Route, Routes } from 'react-router-dom';
import { AdminPage } from './pages/AdminPage';
import { GamePage } from './pages/GamePage';
import { HomePage } from './pages/HomePage';
import { VersionPage } from './pages/VersionPage';

export function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <strong>Vuxo</strong>
        <nav>
          <Link to="/">Home</Link>
          <Link to="/game">Gioco</Link>
          <Link to="/admin">Admin</Link>
          <Link to="/version">Versione</Link>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/game" element={<GamePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/version" element={<VersionPage />} />
        </Routes>
      </main>
    </div>
  );
}
