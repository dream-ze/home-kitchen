// "还没添加到主屏幕"的提示条：iPhone 教用户在 Safari 里手动加，安卓能直接弹安装框。
import { Icon } from './Icon';
import { platform, useInstallPrompt } from './install';

export function InstallHint({ title, tone }: { title: string; tone: 'neutral' | 'warn' }) {
  const { canInstall, installed, install } = useInstallPrompt();
  const p = platform();

  if (installed) {
    return (
      <div className="banner ok">
        <Icon name="check" />
        <span>已装到桌面，以后从桌面上的“食谱”图标打开</span>
      </div>
    );
  }

  const how =
    p === 'ios'
      ? '在 Safari 底部点“分享”，选“添加到主屏幕”。不加的话，Safari 可能会清掉长期没打开的数据。'
      : p === 'android'
        ? canInstall
          ? '装到桌面后打开更快，还能在相册里把截图直接分享给“食谱”。'
          : '在 Chrome 右上角点 ⋮，选“添加到主屏幕”或“安装应用”。装好后还能在相册里把截图直接分享给“食谱”。'
        : canInstall
          ? '装好后像普通应用一样从桌面打开。'
          : '在浏览器菜单里选“安装”或“添加到主屏幕”。';

  return (
    <div className={`banner ${tone}`} style={{ alignItems: 'flex-start' }}>
      <span style={{ color: tone === 'neutral' ? 'var(--accent)' : undefined, marginTop: 1 }}>
        <Icon name={p === 'ios' ? 'share' : 'plus'} />
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
        <strong style={{ fontSize: 15, fontWeight: 500 }}>{title}</strong>
        <span style={{ fontSize: 13 }} className={tone === 'neutral' ? 'hint' : undefined}>{how}</span>
        {canInstall && (
          <button className="btn primary small" style={{ alignSelf: 'flex-start', marginTop: 6 }} onClick={install}>
            安装到桌面
          </button>
        )}
      </div>
    </div>
  );
}
