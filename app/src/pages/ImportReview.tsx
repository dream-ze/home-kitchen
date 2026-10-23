// P06 截图导入 · 核对（也用于粘贴文字导入）。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ai, errorText, type AiRecipe } from '../data/ai';
import { useFoodMap, useFoods } from '../data/hooks';
import { discardImages } from '../data/images';
import { createFoodFromAi, newRecipe, saveRecipe } from '../data/recipes';
import { takeImportSession, type ImportSession } from '../data/session';
import { LOW_CONFIDENCE, nextKey, reviewToLines, toReview, type ReviewLine } from '../logic/match';
import { detectTimerSec, formatDuration } from '../logic/text';
import { FoodPickerSheet } from '../sheets/FoodPickerSheet';
import { Stepper } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { Thumbs } from '../ui/Thumbs';
import { useToast, useToastOffset } from '../ui/Toast';

type Phase = 'loading' | 'error' | 'done';

export function ImportReviewPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const foods = useFoods();
  const foodMap = useFoodMap();
  const [session] = useState<ImportSession | null>(takeImportSession);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');
  const [result, setResult] = useState<AiRecipe | null>(null);
  const [title, setTitle] = useState('');
  const [servings, setServings] = useState(2);
  const [timeMin, setTimeMin] = useState<number | undefined>();
  const [lines, setLines] = useState<ReviewLine[]>([]);
  const [steps, setSteps] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [menuKey, setMenuKey] = useState<number | null>(null);
  const [picking, setPicking] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useToastOffset(92);

  async function run() {
    if (!session) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setPhase('loading');
    try {
      const r = session.text != null ? await ai.parseText(session.text, ctrl.signal) : await ai.recognizeRecipe(session.images.map((i) => i.base64), ctrl.signal);
      if (ctrl.signal.aborted) return;
      setResult(r);
      setPhase('done');
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(errorText(e));
      setPhase('error');
    }
  }

  useEffect(() => {
    if (!session) {
      navigate('/recipes', { replace: true });
      return;
    }
    run();
    return () => abort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 识别结果到了、食材库也加载好了，再转成可编辑的行
  useEffect(() => {
    if (!result || foods.length === 0 || lines.length || title) return;
    const r = toReview(result, foods);
    setTitle(r.title);
    setServings(r.servings);
    setTimeMin(r.timeMin);
    setLines(r.lines);
    setSteps(r.steps.length ? r.steps : ['']);
    setWarnings(r.warnings);
  }, [result, foods, lines.length, title]);

  const imageIds = useMemo(() => session?.images.map((i) => i.blobId) ?? [], [session]);
  if (!session) return null;

  const real = lines.filter((l) => l.kind === 'line');
  const unsure = real.filter((l) => !l.confirmed);
  // 没把握的行先别新建食材（可能根本不是用料，比如"记得关注我"）
  const unmatched = real.filter((l) => !l.foodId && l.name.trim() && l.confirmed);

  const update = (key: number, patch: Partial<ReviewLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const toStep = (l: ReviewLine) => {
    setLines((ls) => ls.filter((x) => x.key !== l.key));
    setSteps((s) => [...s.filter(Boolean), l.originalText]);
    setMenuKey(null);
  };

  async function cancel() {
    if (phase === 'done' && !confirm('放弃这次识别？')) return;
    abort.current?.abort();
    await discardImages(imageIds);
    navigate('/recipes', { replace: true });
  }

  async function save() {
    if (!title.trim()) {
      toast('先填一下菜名');
      return;
    }
    if (unsure.length && !confirm(`还有 ${unsure.length} 行没确认，先保存吗？`)) return;
    const recipe = {
      ...newRecipe(),
      title: title.trim(),
      servings,
      timeMin,
      lines: reviewToLines(lines, foodMap),
      steps: steps.map((s) => s.trim()).filter(Boolean).map((text) => ({ text, timerSec: detectTimerSec(text) })),
      sourceBlobIds: imageIds,
      source: session!.text != null ? '粘贴的文字' : `截图 ${imageIds.length} 张`,
    };
    await saveRecipe(recipe);
    toast('已收藏');
    navigate(`/recipes/${recipe.id}`, { replace: true });
  }

  async function createAllUnmatched() {
    setCreating(true);
    try {
      for (const l of unmatched) {
        const f = await createFoodFromAi(l.name.trim());
        update(l.key, { foodId: f.id, name: f.name });
      }
      toast(`已新建 ${unmatched.length} 种食材`);
    } finally {
      setCreating(false);
    }
  }

  const pickingLine = lines.find((l) => l.key === picking);

  return (
    <>
      <header className="navbar">
        <button className="nav-btn" onClick={cancel}>取消</button>
        <h1>确认菜谱</h1>
        <button className="nav-btn end" disabled={phase !== 'done'} onClick={save}>保存</button>
      </header>

      <main className="page" style={{ paddingTop: 12, gap: 16, paddingBottom: 'calc(110px + var(--safe-bottom))' }}>
        {imageIds.length > 0 && (
          <section style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <Thumbs ids={imageIds} />
            {phase === 'done' && <span className="hint" style={{ flex: 1 }}>点图片放大，对照原文核对</span>}
          </section>
        )}
        {session.text != null && phase !== 'done' && (
          <div className="card" style={{ fontSize: 14, color: 'var(--ink-2)', whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'hidden' }}>{session.text}</div>
        )}

        {phase === 'loading' && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span style={{ fontSize: 15 }}>正在识别…（通常 5–15 秒）</span>
            {[80, 60, 70].map((w, i) => (
              <div key={i} style={{ height: 14, width: `${w}%`, borderRadius: 7, background: 'var(--track)' }} />
            ))}
            <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={cancel}>取消</button>
          </div>
        )}

        {phase === 'error' && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <strong style={{ fontSize: 16 }}>没认出来</strong>
            <span style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.6 }}>{error}</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn primary" onClick={run}>再试一次</button>
              <button className="btn" onClick={async () => { await discardImages(imageIds); navigate('/recipes/new', { replace: true }); }}>手动输入</button>
            </div>
          </div>
        )}

        {phase === 'done' && (
          <>
            {(unsure.length > 0 || unmatched.length > 0 || warnings.length > 0) && (
              <div className="banner warn" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 6 }}>
                <span style={{ display: 'flex', gap: 8 }}>
                  <Icon name="alert" size={20} />
                  识别出 {real.length} 项用料{unsure.length ? `，有 ${unsure.length} 项需要你确认` : ''}。任何一行都能改成步骤或忽略。
                </span>
                {warnings.map((w) => <span key={w} style={{ fontSize: 13, paddingLeft: 28 }}>· {w}</span>)}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <label className="field" style={{ flex: 1 }}>
                菜名
                <input className="input" style={{ fontSize: 17, fontWeight: 500 }} value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <div className="field">
                份数
                <Stepper label="份数" value={servings} onChange={setServings} min={1} max={12} format={(v) => `${v} 人`} />
              </div>
            </div>

            <section className="section" style={{ gap: 8 }}>
              <div className="section-head">
                <h2 className="section-title" style={{ fontSize: 18 }}>用料</h2>
                {unmatched.length > 0 && (
                  <button className="btn small warn-outline" disabled={creating} onClick={createAllUnmatched}>
                    {creating ? '正在新建…' : `让 AI 新建没见过的 ${unmatched.length} 样`}
                  </button>
                )}
              </div>
              <div className="card" style={{ padding: '10px 10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {lines.map((l) => {
                  if (l.kind === 'ignored') {
                    return (
                      <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '0 4px' }}>
                        <span className="struck" style={{ flex: 1, fontSize: 14 }}>{l.originalText}</span>
                        <button className="btn text" style={{ minHeight: 32, fontSize: 13 }} onClick={() => update(l.key, { kind: 'line', confirmed: true })}>恢复</button>
                      </div>
                    );
                  }
                  if (l.kind === 'header') {
                    return (
                      <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <input
                          className="input"
                          aria-label="分组名"
                          style={{ border: 'none', borderBottom: '1px solid var(--line)', borderRadius: 0, fontWeight: 700, fontSize: 14, color: 'var(--ink-2)' }}
                          value={l.name}
                          onChange={(e) => update(l.key, { name: e.target.value })}
                        />
                        <button className="x-btn" aria-label="忽略这个分组" onClick={() => update(l.key, { kind: 'ignored' })}>×</button>
                      </div>
                    );
                  }
                  const showMenu = !l.confirmed || menuKey === l.key;
                  const unsureRow = !l.confirmed;
                  return (
                    <div
                      key={l.key}
                      style={unsureRow ? { background: 'var(--warn-soft)', borderRadius: 12, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 } : { display: 'flex', flexDirection: 'column', gap: 6 }}
                    >
                      <div className="line-grid">
                        <input className={'input center' + (unsureRow ? ' warn' : '')} aria-label="数量" inputMode="decimal" placeholder="适量" value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value, confirmed: true })} />
                        <input className={'input center' + (unsureRow ? ' warn' : '')} aria-label="单位" placeholder="单位" value={l.unit} onChange={(e) => update(l.key, { unit: e.target.value, confirmed: true })} />
                        <button className={'food-btn' + (!l.foodId ? ' empty' : '')} onClick={() => setPicking(l.key)}>
                          {l.foodId ? foodMap.get(l.foodId)?.name ?? l.name : `${l.name || '食材'} · 选择或新建 ›`}
                        </button>
                        <button className="x-btn" aria-label="更多操作" onClick={() => setMenuKey(menuKey === l.key ? null : l.key)}>⋯</button>
                      </div>
                      {unsureRow && (
                        <span style={{ fontSize: 12, color: 'var(--warn-ink-2)', padding: '0 2px' }}>
                          不太确定：原文写的是“{l.originalText}”{l.confidence < LOW_CONFIDENCE / 2 ? '，可能不是用料' : '，请核对'}
                        </span>
                      )}
                      {showMenu && (
                        <div role="radiogroup" aria-label="这一行是" style={{ display: 'flex', gap: 6, padding: '0 2px' }}>
                          <button role="radio" aria-checked={l.confirmed} className="mini-btn" style={l.confirmed ? { borderColor: 'var(--accent)', color: 'var(--accent-ink)' } : undefined} onClick={() => { update(l.key, { confirmed: true }); setMenuKey(null); }}>是用料</button>
                          <button role="radio" aria-checked={false} className="mini-btn" onClick={() => toStep(l)}>改成步骤</button>
                          <button role="radio" aria-checked={false} className="mini-btn" onClick={() => { update(l.key, { kind: 'ignored' }); setMenuKey(null); }}>忽略这行</button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <button
                  className="btn dashed center"
                  style={{ color: 'var(--ink)' }}
                  onClick={() => setLines((ls) => [...ls, { key: nextKey(), kind: 'line', name: '', qty: '', unit: '', originalText: '', confidence: 1, confirmed: true }])}
                >
                  + 添加用料
                </button>
              </div>
            </section>

            <section className="section" style={{ gap: 8 }}>
              <h2 className="section-title" style={{ fontSize: 18 }}>步骤</h2>
              {steps.map((s, i) => {
                const sec = detectTimerSec(s);
                return (
                  <div key={i} className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span className="step-no">{i + 1}</span>
                      <button className="x-btn" style={{ height: 32 }} aria-label={`删除步骤 ${i + 1}`} onClick={() => setSteps(steps.filter((_, j) => j !== i))}>×</button>
                    </div>
                    <textarea className="textarea" rows={3} aria-label={`步骤 ${i + 1}`} value={s} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? e.target.value : x)))} />
                    {sec && (
                      <span className="badge green" style={{ alignSelf: 'flex-start', display: 'flex', gap: 4, alignItems: 'center' }}>
                        <Icon name="clock" size={14} strokeWidth={2} />计时 {formatDuration(sec)}
                      </span>
                    )}
                  </div>
                );
              })}
              <button className="btn dashed center" style={{ color: 'var(--ink)' }} onClick={() => setSteps([...steps, ''])}>+ 添加步骤</button>
            </section>
          </>
        )}
      </main>

      {phase === 'done' && (
        <div className="bottom-bar at-bottom">
          <button className="btn primary big block" onClick={save}>保存到菜谱</button>
        </div>
      )}

      {pickingLine && (
        <FoodPickerSheet
          initialQuery={pickingLine.foodId ? '' : pickingLine.name}
          onClose={() => setPicking(null)}
          onPick={(f) => {
            update(pickingLine.key, { foodId: f.id, name: f.name, unit: pickingLine.unit || (f.baseUnit === '个' ? '个' : '') });
            setPicking(null);
          }}
        />
      )}
    </>
  );
}
