// P12 拍照记录：拍一张饭菜照片，十几秒记完。也用来修改已有的拍照记录、估算离线时存下的照片。
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../db/db';
import { SLOTS, type PhotoDraft, type PhotoDraftItem, type Slot } from '../db/types';
import { ai, AiError, errorText, type AiMeal } from '../data/ai';
import { useBlobUrl, useSettings, useToday } from '../data/hooks';
import { discardImages } from '../data/images';
import { deleteMealLog, photoBase64, prepareMealPhoto, saveMealLog, savePendingPhoto, takeMealPhoto } from '../data/meals';
import { slotByTime } from '../logic/dates';
import {
  applyCorrection, diffMeal, EXTRA_PRESETS, fromAi, itemRange, mealKcal, mealRange, OIL_KCAL, PORTIONS, toPrevious,
  type DiffLine, type MealItemIn,
} from '../logic/meal';
import { formatKcal } from '../logic/nutrition';
import { Segmented, Sheet } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { useToast, useToastOffset } from '../ui/Toast';

type Phase = 'loading' | 'error' | 'done';

interface Correction {
  text: string;
  result: AiMeal;
  lines: DiffLine[];
}

export function MealPhotoPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const today = useToday();
  const settings = useSettings();
  const [photo, setPhoto] = useState<{ blobId: string; base64?: string } | null>(null);
  const [isNew] = useState(!id);
  const [date, setDate] = useState(today);
  const [slot, setSlot] = useState<Slot>(() => slotByTime());
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<{ text: string; offline: boolean } | null>(null);
  const [draft, setDraft] = useState<PhotoDraft | null>(null);
  const [missingLog, setMissingLog] = useState(false);
  const [textMode, setTextMode] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [correctionInput, setCorrectionInput] = useState('');
  const [correction, setCorrection] = useState<Correction | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [extraKey, setExtraKey] = useState<string | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoUrl = useBlobUrl(photo?.blobId);
  useToastOffset(110);

  async function estimate(req: { image?: string; text?: string }) {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setPhase('loading');
    setError(null);
    setCorrection(null);
    try {
      const r = await ai.estimateMeal(req, ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (r.items.length === 0) throw new AiError('not_recognized', '没认出来这一餐');
      setDraft({ items: fromAi(r.items), half: false, oilSpoons: 0, notes: r.notes });
      setTextMode(false);
      setPhase('done');
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError({ text: errorText(e), offline: e instanceof AiError && e.code === 'offline' });
      setPhase('error');
    }
  }

  // 打开时：新照片直接估算；已有记录还原调整；待估算的记录读出照片再估算
  useEffect(() => {
    (async () => {
      if (!id) {
        const p = takeMealPhoto();
        if (!p) return navigate('/', { replace: true });
        setPhoto(p);
        return estimate({ image: p.base64 });
      }
      const log = await db.mealLogs.get(id);
      if (!log) return setMissingLog(true);
      setDate(log.date);
      setSlot(log.slot);
      if (log.photoBlobId) setPhoto({ blobId: log.photoBlobId });
      if (log.photoDraft) {
        setDraft(log.photoDraft);
        setPhase('done');
        return;
      }
      const image = log.photoBlobId ? await photoBase64(log.photoBlobId) : undefined;
      if (image) {
        setPhoto({ blobId: log.photoBlobId!, base64: image });
        return estimate({ image });
      }
      setTextMode(true);
      setPhase('error');
      setError({ text: '照片找不到了，用文字记录吧', offline: false });
    })();
    return () => abort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function imageBase64(): Promise<string | undefined> {
    if (!photo) return undefined;
    if (photo.base64) return photo.base64;
    const b64 = await photoBase64(photo.blobId);
    if (b64) setPhoto({ ...photo, base64: b64 });
    return b64;
  }

  async function close() {
    abort.current?.abort();
    if (isNew && photo) {
      if (draft && !confirm('放弃这条记录？')) return;
      await discardImages([photo.blobId]);
    }
    history.length > 1 ? navigate(-1) : navigate('/');
  }

  async function retake(file: File) {
    try {
      const p = await prepareMealPhoto(file);
      // 新记录换照片时，旧照片没用了；已有记录的旧照片等保存后再说，取消时还要用
      if (isNew && photo) await discardImages([photo.blobId]);
      setPhoto(p);
      setDraft(null);
      await estimate({ image: p.base64 });
    } catch (e) {
      toast('图片读不出来，换一张试试：' + String((e as Error).message ?? e));
    }
  }

  async function savePending() {
    if (!photo) return;
    const undo = await savePendingPhoto(photo.blobId, date, slot);
    navigate('/', { replace: true });
    toast('照片先存下了，联网后在今天页点它估算', undo);
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const { undo, kcal } = await saveMealLog({ id, date, slot, draft, photoBlobId: photo?.blobId });
      navigate('/', { replace: true });
      toast(`已记录 约 ${formatKcal(kcal)} kcal`, undo);
    } catch (e) {
      setSaving(false);
      toast('没存上：' + String((e as Error).message ?? e));
    }
  }

  async function remove() {
    if (!id) return;
    const undo = await deleteMealLog(id);
    navigate('/', { replace: true });
    toast('已删除这条记录', undo);
  }

  async function sendCorrection() {
    const text = correctionInput.trim();
    if (!draft || !text) return;
    setCorrecting(true);
    try {
      const result = await ai.estimateMeal({ image: await imageBase64(), correction: text, previous: toPrevious(draft) });
      if (result.items.length === 0) throw new AiError('not_recognized', '没改出来，换个说法试试');
      setCorrection({ text, result, lines: diffMeal(draft, result.items) });
      setCorrectionInput('');
    } catch (e) {
      toast(errorText(e));
    } finally {
      setCorrecting(false);
    }
  }

  const update = (fn: (d: PhotoDraft) => PhotoDraft) => setDraft((d) => (d ? fn(d) : d));
  const updateItem = (key: string, patch: Partial<PhotoDraftItem>) =>
    update((d) => ({ ...d, items: d.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) }));
  const addExtra = (items: MealItemIn[]) => update((d) => ({ ...d, items: [...d.items, ...fromAi(items, true)] }));

  if (missingLog) {
    return (
      <main className="page">
        <button className="back-link btn text" onClick={() => navigate('/')}><Icon name="back" size={20} />今天</button>
        <div className="card">这条记录已经被删除了</div>
      </main>
    );
  }

  const range = draft ? mealRange(draft) : null;
  const editing = draft?.items.find((i) => i.key === editKey);

  return (
    <>
      <header className="navbar">
        <button className="nav-btn" aria-label="关闭" onClick={close}><Icon name="close" /></button>
        <h1>记录这一餐</h1>
        {!isNew ? <button className="nav-btn end" style={{ color: 'var(--destructive)', fontWeight: 400 }} onClick={remove}>删除</button> : <span />}
      </header>

      <main className="page" style={{ paddingTop: 12, gap: 16, paddingBottom: 'calc(110px + var(--safe-bottom))' }}>
        <Segmented label="餐次" value={slot} options={SLOTS} onChange={setSlot} />

        {photo && (
          <button className="meal-photo" aria-label="重拍" onClick={() => fileRef.current?.click()}>
            {photoUrl && <img src={photoUrl} alt="这一餐的照片" />}
            {phase === 'loading' && <span className="meal-photo-mask">正在看这一餐…</span>}
            {phase !== 'loading' && <span className="meal-photo-tag"><Icon name="camera" size={14} />重拍</span>}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void retake(f);
          }}
        />

        {phase === 'loading' && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-busy="true">
            <span style={{ fontSize: 15 }}>正在估算…（通常 5–15 秒）</span>
            {[80, 60, 70].map((w, i) => (
              <div key={i} style={{ height: 14, width: `${w}%`, borderRadius: 7, background: 'var(--track)' }} />
            ))}
            <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={close}>取消</button>
          </div>
        )}

        {phase === 'error' && (
          <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <strong style={{ fontSize: 16 }}>{error?.offline ? '没联网，估算不了' : '没认出来这一餐'}</strong>
            {error && !error.offline && <span className="row-sub">{error.text}</span>}
            {error?.offline && isNew && photo ? (
              <>
                <span className="row-sub">照片可以先存下，联网后在今天页点它再估算。</span>
                <button className="btn primary block" onClick={savePending}>先存下照片</button>
              </>
            ) : textMode ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea
                  className="textarea"
                  rows={2}
                  placeholder="比如：一碗牛肉面，一个卤蛋"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                />
                <button className="btn primary block" disabled={!textInput.trim()} onClick={() => estimate({ text: textInput.trim() })}>
                  估算
                </button>
              </div>
            ) : (
              <div className="bar-row">
                <button className="btn" onClick={() => fileRef.current?.click()}>重拍</button>
                <button className="btn" onClick={() => setTextMode(true)}>用文字记录</button>
              </div>
            )}
            {error?.offline && (
              <button className="btn text" style={{ alignSelf: 'flex-start' }} onClick={async () => estimate({ image: await imageBase64() })}>
                再试一次
              </button>
            )}
          </section>
        )}

        {phase === 'done' && draft && range && (
          <>
            <section className="card" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 14, color: 'var(--muted)' }}>这一餐大约</span>
                <span className="num" style={{ fontSize: 30, fontWeight: 700 }}>
                  {formatKcal(range.min)}–{formatKcal(range.max)} <span style={{ fontSize: 15, fontWeight: 400, color: 'var(--muted)' }}>kcal</span>
                </span>
              </div>
              <button className={'chip' + (draft.half ? ' on' : '')} aria-pressed={draft.half} onClick={() => update((d) => ({ ...d, half: !d.half }))}>
                只吃了一半
              </button>
            </section>

            {settings.oilHint && (
              <div className="banner warn" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                <span>拍照估算通常偏低，尤其是油。看起来油多的话，直接点下面补上。</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button className="btn warn-outline" onClick={() => update((d) => ({ ...d, oilSpoons: d.oilSpoons + 1 }))}>
                    +1 勺油 约 +{OIL_KCAL}
                  </button>
                  {draft.oilSpoons > 0 && (
                    <span style={{ fontSize: 13 }}>
                      已加 {draft.oilSpoons} 勺 ·{' '}
                      <button className="btn text" style={{ minHeight: 32, padding: 0, fontSize: 13 }} onClick={() => update((d) => ({ ...d, oilSpoons: d.oilSpoons - 1 }))}>
                        撤销
                      </button>
                    </span>
                  )}
                </div>
              </div>
            )}
            {!settings.oilHint && draft.oilSpoons > 0 && <span className="hint">另加了 {draft.oilSpoons} 勺油</span>}

            <section className="card list">
              {draft.items.map((it) => {
                const r = itemRange(draft, it);
                return (
                  <div key={it.key} className="meal-item">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                      <button className="meal-item-name" onClick={() => setEditKey(it.key)}>
                        {it.name}
                        {it.extra && <span className="badge gray" style={{ marginLeft: 6 }}>补</span>}
                      </button>
                      <span className="num" style={{ fontSize: 15, fontWeight: 500, flex: 'none' }}>{r.kcalMin === r.kcalMax ? `约 ${r.kcalMin}` : `${r.kcalMin}–${r.kcalMax}`} kcal</span>
                    </div>
                    <span className="hint" style={{ marginTop: -6 }}>
                      估计 {r.gramsMin === r.gramsMax ? r.gramsMin : `${r.gramsMin}–${r.gramsMax}`} g · 点菜名可修改
                    </span>
                    <div className="portion-grid" role="radiogroup" aria-label={`${it.name}的份量`}>
                      {PORTIONS.map((p) => (
                        <button key={p.value} role="radio" aria-checked={it.portion === p.value} onClick={() => updateItem(it.key, { portion: p.value })}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
            {draft.notes.map((n) => <span key={n} className="hint">{n}</span>)}

            <section className="section" style={{ gap: 8 }}>
              <h2 className="section-title" style={{ fontSize: 15 }}>漏了什么？</h2>
              <div className="chips">
                {EXTRA_PRESETS.map((g) => (
                  <button key={g.key} className="chip" onClick={() => setExtraKey(g.key)}>+ {g.label}</button>
                ))}
              </div>
            </section>

            <section className="section" style={{ gap: 8 }}>
              <h2 className="section-title" style={{ fontSize: 15 }}>一句话纠正</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input"
                  style={{ flex: 1 }}
                  placeholder="比如：宫保鸡丁油很多、米饭只吃了半碗"
                  value={correctionInput}
                  onChange={(e) => setCorrectionInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && sendCorrection()}
                />
                <button className="btn primary" disabled={!correctionInput.trim() || correcting} onClick={sendCorrection}>
                  {correcting ? '…' : '发送'}
                </button>
              </div>
              {correction && (
                <div className="card outlined" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <span className="hint">“{correction.text}”</span>
                  {correction.lines.length === 0 ? (
                    <span style={{ fontSize: 15 }}>热量基本没变</span>
                  ) : (
                    correction.lines.map((l) => (
                      <span key={l.name + l.kind} style={{ fontSize: 15 }}>
                        {l.kind === 'removed' ? `去掉 ${l.name}` : l.kind === 'added' ? `加上 ${l.name}` : l.name} 约 {l.delta >= 0 ? '+' : '−'}
                        {Math.abs(l.delta)} kcal
                      </span>
                    ))
                  )}
                  <div className="bar-row">
                    <button className="btn" onClick={() => setCorrection(null)}>不用了</button>
                    <button
                      className="btn primary"
                      onClick={() => {
                        update((d) => applyCorrection(d, correction.result.items, correction.result.notes));
                        setCorrection(null);
                      }}
                    >
                      确认修改
                    </button>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <div className="bottom-bar at-bottom">
        <button className="btn primary big block" disabled={phase !== 'done' || !draft || saving} onClick={save}>
          保存记录{draft ? ` · 约 ${formatKcal(mealKcal(draft))} kcal` : ''}
        </button>
      </div>

      {extraKey && (
        <ExtraSheet
          group={EXTRA_PRESETS.find((g) => g.key === extraKey)!}
          onAdd={(items) => {
            addExtra(items);
            setExtraKey(null);
          }}
          onClose={() => setExtraKey(null)}
        />
      )}
      {editing && (
        <EditItemSheet
          item={editing}
          onSave={(patch) => {
            updateItem(editing.key, patch);
            setEditKey(null);
          }}
          onDelete={() => {
            update((d) => ({ ...d, items: d.items.filter((i) => i.key !== editing.key) }));
            setEditKey(null);
          }}
          onClose={() => setEditKey(null)}
        />
      )}
    </>
  );
}

/** "漏了什么"：常用选项直接加；也可以输入文字让 AI 估算 */
function ExtraSheet({ group, onAdd, onClose }: { group: (typeof EXTRA_PRESETS)[number]; onAdd: (items: MealItemIn[]) => void; onClose: () => void }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title={`补上${group.label}`} sub="选一个常见的，或者自己写" onClose={onClose}>
      <div className="card list">
        {group.options.map((o) => (
          <button key={o.name} className="row button" onClick={() => onAdd([o])}>
            <span className="row-main row-title">{o.name}</span>
            <span className="num" style={{ fontSize: 14, color: 'var(--muted)' }}>约 {o.kcalMin}–{o.kcalMax}</span>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="input" style={{ flex: 1 }} placeholder="比如：一小碟花生米" value={text} onChange={(e) => setText(e.target.value)} />
        <button
          className="btn primary"
          disabled={!text.trim() || busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await ai.estimateMeal({ text: text.trim() });
              if (r.items.length === 0) throw new AiError('not_recognized', '没估出来，换个说法试试');
              onAdd(r.items);
            } catch (e) {
              toast(errorText(e));
              setBusy(false);
            }
          }}
        >
          {busy ? '估算中…' : 'AI 估算'}
        </button>
      </div>
    </Sheet>
  );
}

/** 点菜名：改名后按原来的克数重新估这一道；也可以删掉 */
function EditItemSheet({
  item, onSave, onDelete, onClose,
}: {
  item: PhotoDraftItem;
  onSave: (patch: Partial<PhotoDraftItem>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(item.name);
  const [busy, setBusy] = useState(false);
  const changed = name.trim() && name.trim() !== item.name;
  return (
    <Sheet
      title="修改这一项"
      onClose={onClose}
      footer={
        <div className="bar-row">
          <button className="btn big danger-text" onClick={onDelete}>删掉这一项</button>
          <button
            className="btn primary big"
            disabled={!changed || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const n = name.trim();
                const r = await ai.estimateMeal({ text: `${n}，大约 ${item.gramsMin}–${item.gramsMax} 克` });
                const first = r.items[0];
                if (!first) throw new AiError('not_recognized', '没估出来，换个说法试试');
                const { name: _ignored, ...values } = first;
                onSave({ ...values, name: n });
              } catch (e) {
                toast(errorText(e));
                setBusy(false);
              }
            }}
          >
            {busy ? '估算中…' : '改名并重新估算'}
          </button>
        </div>
      }
    >
      <label className="field">
        <span>菜名</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <span className="hint">改名后会按原来估计的 {item.gramsMin}–{item.gramsMax} g 重新估算这一道的热量</span>
    </Sheet>
  );
}
