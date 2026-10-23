// P14 首次打开。
import { Link, useNavigate } from 'react-router-dom';
import { startImageImport } from '../data/session';
import { useImagePicker } from '../ui/useImagePicker';
import { isStandalone, useToday } from '../data/hooks';
import { loadDemoData } from '../data/demo';
import { fullDayLabel } from '../logic/dates';
import { Icon } from '../ui/Icon';
import { TabBar } from '../ui/TabBar';
import { useToast } from '../ui/Toast';

export function Onboarding() {
  const today = useToday();
  const toast = useToast();
  const navigate = useNavigate();
  const picker = useImagePicker(async (files) => {
    await startImageImport(files);
    navigate('/import');
  });
  return (
    <>
      <main className="page with-tabs">
        <header className="page-header">
          <div className="heads">
            <span className="eyebrow">{fullDayLabel(today)}</span>
            <h1 className="title">今天</h1>
          </div>
        </header>

        {!isStandalone() && (
          <div className="banner neutral" style={{ alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--accent)', marginTop: 1 }}><Icon name="share" /></span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <strong style={{ fontSize: 15, fontWeight: 500 }}>先把它添加到主屏幕</strong>
              <span className="hint" style={{ fontSize: 13 }}>在 Safari 底部点“分享”，选“添加到主屏幕”。这样数据才能长期保存，打开也更快。</span>
            </div>
          </div>
        )}

        <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '10px 0 4px', textAlign: 'center' }}>
          <svg viewBox="0 0 120 80" width="120" height="80" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 40h92a46 30 0 0 1-92 0z" />
            <path d="M46 70h28" />
            <path d="M48 28c0-6 6-6 6-12M60 28c0-6 6-6 6-12M72 28c0-6 6-6 6-12" stroke="var(--handle)" />
          </svg>
          <h2 style={{ margin: 0, fontSize: 21 }}>先收藏第一道菜</h2>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
            截图、粘贴文字、手动输入都可以。
            <br />
            有了菜谱，菜单和购物清单就能自动生成。
          </p>
        </section>

        <ol className="card list" style={{ margin: 0, listStyle: 'none' }}>
          <li className="row" style={{ minHeight: 64 }}>
            <StepNo n={1} active />
            <span className="row-main row-title strong">导入一道菜谱</span>
            {picker.input}
            <Link to="/recipes/new" className="btn small">手动</Link>
            <button className="btn primary small" disabled={picker.busy} onClick={picker.open}>截图导入</button>
          </li>
          <li className="row" style={{ minHeight: 64 }}>
            <StepNo n={2} />
            <span className="row-main">
              <span className="row-title" style={{ color: 'var(--ink-2)' }}>排进这周菜单</span>
              <span className="row-sub">有了菜谱就能排</span>
            </span>
          </li>
          <li className="row" style={{ minHeight: 64 }}>
            <StepNo n={3} />
            <span className="row-main">
              <span className="row-title" style={{ color: 'var(--ink-2)' }}>一键生成购物清单</span>
              <span className="row-sub">会自动扣掉冰箱里已有的</span>
            </span>
          </li>
        </ol>

        <Link to="/fridge" style={{ alignSelf: 'center', minHeight: 44, display: 'flex', alignItems: 'center', fontSize: 14 }}>
          或者，先记一下冰箱里有什么 ›
        </Link>
        <button
          className="btn text"
          style={{ alignSelf: 'center' }}
          onClick={async () => {
            await loadDemoData();
            toast('已加载示例数据，可以在设置里清空');
          }}
        >
          加载示例数据看看效果
        </button>
      </main>
      <TabBar />
    </>
  );
}

function StepNo({ n, active }: { n: number; active?: boolean }) {
  return (
    <span
      style={{
        width: 28, height: 28, flex: 'none', borderRadius: 14, fontSize: 14, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? 'var(--accent)' : '#EEF0EC', color: active ? '#fff' : 'var(--muted)',
      }}
    >
      {n}
    </span>
  );
}
