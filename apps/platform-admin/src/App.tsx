type Props = {
  title: string;
  subtitle: string;
};

export function App({ title, subtitle }: Props) {
  return (
    <main className="shell">
      <section className="panel">
        <span className="eyebrow">NuyChat</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
        <div className="grid">
          <article>
            <h2>Login</h2>
            <p>待接入认证模块与租户权限。</p>
          </article>
          <article>
            <h2>Dashboard</h2>
            <p>待接入平台总览、租户统计与运行状态。</p>
          </article>
        </div>
      </section>
    </main>
  );
}

