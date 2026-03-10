type Props = {
  title: string;
  subtitle: string;
};

export function App({ title, subtitle }: Props) {
  return (
    <main className="shell">
      <section className="panel">
        <span className="eyebrow">Realtime Desk</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
        <div className="grid">
          <article>
            <h2>会话列表</h2>
            <p>待接入 Mock API 和实时会话流。</p>
          </article>
          <article>
            <h2>消息面板</h2>
            <p>待接入 Socket、AI 建议与人工接管。</p>
          </article>
        </div>
      </section>
    </main>
  );
}

