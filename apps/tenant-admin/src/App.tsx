type Props = {
  title: string;
  subtitle: string;
};

export function App({ title, subtitle }: Props) {
  return (
    <main className="shell">
      <section className="panel">
        <span className="eyebrow">Workspace</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
        <div className="grid">
          <article>
            <h2>渠道设置</h2>
            <p>待接入 WhatsApp / Telegram / WebChat 配置。</p>
          </article>
          <article>
            <h2>AI 配置</h2>
            <p>待接入模型、配额与知识库管理。</p>
          </article>
        </div>
      </section>
    </main>
  );
}

