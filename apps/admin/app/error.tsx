'use client';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div>
      <header>
        <h2>Algo falhou</h2>
        <p>Verifique se a API esta no ar em API_BASE_URL.</p>
      </header>
      <div className="error">{error.message}</div>
      <button onClick={reset}>Tentar novamente</button>
    </div>
  );
}
