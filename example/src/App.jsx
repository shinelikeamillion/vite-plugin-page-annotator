const features = [
  { icon: '✦', title: 'Capture anything', text: 'Clip pages, jot ideas and drop in files. Everything lands in one inbox.' },
  { icon: '⇄', title: 'Link your thinking', text: 'Connect notes with a keystroke and see how your ideas fit together.' },
  { icon: '⌕', title: 'Find it instantly', text: 'Search across every note, image and PDF in under a second.' },
];

export default function App() {
  return (
    <main>
      <nav className="nav">
        <strong className="logo">Driftwood</strong>
        <div className="links">
          <a href="#">Product</a>
          <a href="#">Docs</a>
          <a href="#">Blog</a>
          <button className="ghost">Sign in</button>
        </div>
      </nav>
      <header className="hero">
        <span className="badge">New · Offline sync</span>
        <h1>Your second brain, without the clutter</h1>
        <p>Driftwood keeps your notes, links and files in one calm place, so you can get back to the work that matters.</p>
        <div className="actions">
          <button className="cta">Get started</button>
          <button>Watch the demo</button>
        </div>
        <div className="shot" aria-hidden="true">
          <div className="shot-side" />
          <div className="shot-main">
            <div className="line w60" />
            <div className="line w90" />
            <div className="line w75" />
            <div className="line w40" />
          </div>
        </div>
      </header>
      <section className="features">
        {features.map((f) => (
          <article key={f.title} className="feature">
            <div className="icon">{f.icon}</div>
            <h2>{f.title}</h2>
            <p>{f.text}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
