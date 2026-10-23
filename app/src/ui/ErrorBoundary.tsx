import { Component, type ReactNode } from 'react';

/** 某个页面出错时不至于整个应用白屏；数据都在本机数据库里，重新加载即可 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="page" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
        <strong style={{ fontSize: 18 }}>这一页出了点问题</strong>
        <span className="hint">数据都还在手机上，重新加载一下就好。</span>
        <code style={{ fontSize: 12, color: 'var(--muted)', wordBreak: 'break-all' }}>{this.state.error.message}</code>
        <button className="btn primary" onClick={() => location.reload()}>重新加载</button>
      </main>
    );
  }
}
