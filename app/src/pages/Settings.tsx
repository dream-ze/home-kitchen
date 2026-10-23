// P13 设置。
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../db/db';
import { DEFAULT_SETTINGS } from '../db/types';
import { exportBackup, readBackup, restoreBackup, shareBackup, summarize } from '../data/backup';
import { loadDemoData } from '../data/demo';
import { isStandalone, useSettings } from '../data/hooks';
import { updateSettings } from '../data/settings';
import { seedFoods } from '../db/seedFoods';
import { Sheet, Stepper, Switch } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { useToast } from '../ui/Toast';
import { ai, errorText } from '../data/ai';

const DAY = 86400000;

export function SettingsPage() {
  const settings = useSettings();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [restore, setRestore] = useState<Awaited<ReturnType<typeof readBackup>> | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conn, setConn] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const standalone = isStandalone();

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);

  const last = settings.lastBackupAt;
  const lastText = last
    ? `${Math.floor((Date.now() - last) / DAY) === 0 ? '今天' : `${Math.floor((Date.now() - last) / DAY)} 天前`}（${new Date(last).getMonth() + 1}月${new Date(last).getDate()}日）`
    : '还没有备份过';

  return (
    <>
      <main className="page" style={{ gap: 18 }}>
        <Link to="/" className="back-link"><Icon name="back" size={20} />今天</Link>
        <h1 className="title" style={{ marginTop: -10 }}>设置</h1>

        {standalone ? (
          <div className="banner ok" style={{ alignItems: 'flex-start' }}>
            <Icon name="check" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <strong style={{ fontWeight: 500, color: '#1D4A2E' }}>已添加到主屏幕</strong>
              <span style={{ fontSize: 13 }}>数据只存在这台手机上，记得定期备份{persisted === false ? '；系统还没同意长期保存，请多备份' : ''}</span>
            </div>
          </div>
        ) : (
          <div className="banner warn" style={{ alignItems: 'flex-start' }}>
            <Icon name="share" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <strong style={{ fontWeight: 500 }}>还没添加到主屏幕</strong>
              <span style={{ fontSize: 13 }}>在 Safari 底部点“分享”，选“添加到主屏幕”。不加的话，Safari 可能会清掉长期没打开的数据。</span>
            </div>
          </div>
        )}

        <Group title="备份与恢复">
          <div style={{ padding: '14px 0 12px', display: 'flex', flexDirection: 'column', gap: 12, borderBottom: '1px solid var(--divider)' }}>
            <span className="eyebrow">上次备份：{lastText}</span>
            <div className="bar-row">
              <button
                className="btn primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const file = await exportBackup(settings.backupIncludeImages);
                    const r = await shareBackup(file);
                    if (r !== 'cancelled') toast(r === 'shared' ? '已导出备份' : '备份文件已下载');
                  } catch (e) {
                    toast('导出失败：' + String((e as Error).message ?? e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                导出备份
              </button>
              <button className="btn" onClick={() => fileRef.current?.click()}>从备份恢复</button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  try {
                    setRestore(await readBackup(f));
                  } catch (err) {
                    toast(String((err as Error).message));
                  }
                }}
              />
            </div>
          </div>
          <Line label="备份里包含图片">
            <Switch label="备份里包含图片" checked={settings.backupIncludeImages} onChange={(v) => updateSettings({ backupIncludeImages: v })} />
          </Line>
          <Line label="超过几天没备份就提醒" last>
            <Stepper small label="提醒天数" value={settings.backupRemindDays} min={3} max={30} onChange={(v) => updateSettings({ backupRemindDays: v })} format={(v) => `${v} 天`} />
          </Line>
        </Group>

        <Group title="AI 识别" hint="截图导入、粘贴文字、拍照入库、新建食材时都会用到。用哪家模型在服务器上设置，换模型不需要改手机这边。">
          <label className="field" style={{ padding: '12px 0', borderBottom: '1px solid var(--divider)' }}>
            服务地址
            <input className="input" placeholder="https://你的-worker.workers.dev" value={settings.workerUrl} onChange={(e) => updateSettings({ workerUrl: e.target.value.trim() })} />
          </label>
          <label className="field" style={{ padding: '12px 0', borderBottom: '1px solid var(--divider)' }}>
            访问口令
            <input className="input" type="password" autoComplete="off" value={settings.appToken} onChange={(e) => updateSettings({ appToken: e.target.value })} />
          </label>
          <div className="row" style={{ minHeight: 56, borderBottom: 'none' }}>
            <span className="row-main" style={{ fontSize: 14, color: conn ? (conn.ok ? 'var(--accent-ink)' : 'var(--warn-ink)') : 'var(--muted)' }}>
              {conn ? conn.text : '还没测试'}
            </span>
            <button
              className="btn small"
              disabled={testing}
              onClick={async () => {
                setTesting(true);
                try {
                  const h = await ai.health();
                  setConn({ ok: true, text: `连接正常 · ${h.provider === 'mock' ? '模拟模型（不会真的识别）' : `${h.provider} · ${h.model}`}` });
                } catch (e) {
                  setConn({ ok: false, text: errorText(e) });
                } finally {
                  setTesting(false);
                }
              }}
            >
              {testing ? '测试中…' : '测试连接'}
            </button>
          </div>
        </Group>

        <Group title="冰箱与购物">
          <Link to="/fridge" className="row" style={{ color: 'var(--ink)' }}>
            <span className="row-main row-title">常备品</span><span className="row-sub">在冰箱页管理 ›</span>
          </Link>
          <button className="row button" onClick={() => setOrderOpen(true)}>
            <span className="row-main row-title">购物分区顺序</span><span className="row-sub">›</span>
          </button>
          <Line label="临期提醒" last>
            <Stepper small label="提前天数" value={settings.expiryWarnDays} min={1} max={7} onChange={(v) => updateSettings({ expiryWarnDays: v })} format={(v) => `提前 ${v} 天`} />
          </Line>
        </Group>

        <Group title="热量">
          <Line label="显示蛋白质、脂肪、碳水">
            <Switch label="显示蛋白质、脂肪、碳水" checked={settings.showMacros} onChange={(v) => updateSettings({ showMacros: v })} />
          </Line>
          <Line label="拍照时提醒“油可能少算”" last>
            <Switch label="拍照时提醒油可能少算" checked={settings.oilHint} onChange={(v) => updateSettings({ oilHint: v })} />
          </Line>
        </Group>

        <Group title="关于">
          <p style={{ margin: 0, padding: '14px 0', fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.6, borderBottom: '1px solid var(--divider)' }}>
            现在内置的约 50 种食材营养数据是常见参考值，之后会换成台湾食品营养成分资料库（政府资料开放授权）和 USDA FoodData Central 的正式数据。热量都是估算，心里有数就好。
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '12px 0' }}>
            <button
              className="btn small"
              onClick={async () => {
                if ((await db.recipes.count()) > 0 && !confirm('示例数据会和现有数据混在一起，继续吗？')) return;
                await loadDemoData();
                toast('已加载示例数据');
              }}
            >
              加载示例数据
            </button>
            <button
              className="btn small danger-text"
              onClick={async () => {
                if (!confirm('清空所有菜谱、菜单、清单、库存和记录？')) return;
                if (!confirm('真的要清空吗？清空后无法恢复，除非你有备份文件。')) return;
                await db.transaction('rw', db.tables, async () => {
                  for (const t of db.tables) await t.clear();
                  await db.foods.bulkPut(seedFoods());
                  await db.settings.put(DEFAULT_SETTINGS);
                });
                toast('已清空');
              }}
            >
              清空所有数据
            </button>
          </div>
          <span className="hint" style={{ paddingBottom: 12 }}>版本 0.1（第一阶段）</span>
        </Group>
      </main>

      {restore && (
        <Sheet
          title="从备份恢复"
          sub="会用备份覆盖手机上现在的数据"
          onClose={() => setRestore(null)}
          footer={
            <button
              className="btn primary big block"
              onClick={async () => {
                if (!confirm('确定覆盖现在的数据吗？')) return;
                await restoreBackup(restore);
                location.reload();
              }}
            >
              覆盖并恢复
            </button>
          }
        >
          {(() => {
            const s = summarize(restore);
            return (
              <div className="card" style={{ lineHeight: 1.8, fontSize: 15 }}>
                备份时间：{new Date(s.exportedAt).toLocaleString('zh-CN')}
                <br />
                包含 {s.recipes} 道菜谱、{s.plan} 条菜单、{s.shopping} 条购物清单、{s.pantry} 样库存、{s.logs} 条饮食记录
                {s.images ? `、${s.images} 张图片` : '（不含图片，手机上已有的图片会保留）'}
              </div>
            );
          })()}
        </Sheet>
      )}
      {orderOpen && <SectionOrderSheet order={settings.sectionOrder} onClose={() => setOrderOpen(false)} />}
    </>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h2 style={{ margin: 0, padding: '0 4px', fontSize: 13, fontWeight: 500, color: 'var(--muted)' }}>{title}</h2>
      <div className="card" style={{ padding: '0 16px', display: 'flex', flexDirection: 'column' }}>{children}</div>
      {hint && <span className="hint" style={{ padding: '0 4px' }}>{hint}</span>}
    </section>
  );
}

function Line({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className="row" style={{ minHeight: 56, borderBottom: last ? 'none' : undefined }}>
      <span className="row-main row-title">{label}</span>
      {children}
    </div>
  );
}

function SectionOrderSheet({ order, onClose }: { order: string[]; onClose: () => void }) {
  const [list, setList] = useState(order.length ? order : DEFAULT_SETTINGS.sectionOrder);
  const move = (i: number, d: -1 | 1) =>
    setList((l) => {
      const n = [...l];
      const j = i + d;
      if (j < 0 || j >= n.length) return l;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  return (
    <Sheet
      title="购物分区顺序"
      sub="按你逛超市的路线排，清单会照这个顺序显示"
      onClose={onClose}
      footer={<button className="btn primary big block" onClick={async () => { await updateSettings({ sectionOrder: list }); onClose(); }}>保存</button>}
    >
      <div className="card list">
        {list.map((s, i) => (
          <div key={s} className="row">
            <span className="row-main row-title">{s}</span>
            <button className="icon-btn plain" aria-label={`${s} 上移`} disabled={i === 0} onClick={() => move(i, -1)} style={{ transform: 'rotate(90deg)' }}><Icon name="back" size={18} /></button>
            <button className="icon-btn plain" aria-label={`${s} 下移`} disabled={i === list.length - 1} onClick={() => move(i, 1)} style={{ transform: 'rotate(90deg)' }}><Icon name="forward" size={18} /></button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
