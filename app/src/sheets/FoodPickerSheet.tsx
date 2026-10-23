// S02 选择或新建食材。第一阶段新建时手动填营养（可留空）；第二阶段改为 AI 估算。
import { useMemo, useState } from 'react';
import { DEFAULT_SECTIONS, LOCATIONS, type BaseUnit, type Food, type Location } from '../db/types';
import { createFood } from '../data/recipes';
import { useFoods, useSettings } from '../data/hooks';
import { searchFoods } from '../logic/search';
import { ai, errorText, type AiNutrition } from '../data/ai';
import { useToast } from '../ui/Toast';
import { Segmented, Sheet } from '../ui/controls';
import { Icon } from '../ui/Icon';

const SECTION_DEFAULTS: Record<string, { loc: Location; days: number; kind: 'staple' | 'tracked' }> = {
  蔬菜水果: { loc: 'fridge', days: 5, kind: 'tracked' },
  肉蛋豆制品: { loc: 'fridge', days: 3, kind: 'tracked' },
  水产: { loc: 'freezer', days: 90, kind: 'tracked' },
  乳制品: { loc: 'fridge', days: 7, kind: 'tracked' },
  主食干货: { loc: 'room', days: 180, kind: 'tracked' },
  调料: { loc: 'room', days: 365, kind: 'staple' },
  其他: { loc: 'room', days: 30, kind: 'tracked' },
};

export function FoodPickerSheet({
  initialQuery = '', onPick, onClose, title = '选择食材', stapleOnly,
}: {
  initialQuery?: string;
  onPick: (food: Food) => void;
  onClose: () => void;
  title?: string;
  stapleOnly?: boolean;
}) {
  const allFoods = useFoods();
  const foods = stapleOnly ? allFoods.filter((f) => f.kind === 'staple') : allFoods;
  const [q, setQ] = useState(initialQuery);
  const [creating, setCreating] = useState(false);
  const results = useMemo(
    () => (q.trim() ? searchFoods(foods, q, 30) : [...foods].sort((a, b) => a.section.localeCompare(b.section, 'zh') || a.name.localeCompare(b.name, 'zh')).slice(0, 60)),
    [foods, q],
  );
  const exact = foods.some((f) => f.name === q.trim() || f.aliases.includes(q.trim()));

  if (creating) {
    return <NewFoodSheet name={q.trim()} staple={stapleOnly} onClose={onClose} onBack={() => setCreating(false)} onCreated={onPick} />;
  }

  return (
    <Sheet title={title} onClose={onClose}>
      <label className="searchbox">
        <Icon name="search" size={18} />
        <span className="sr-only">搜索食材</span>
        <input type="search" placeholder="食材名，拼音首字母也行" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {q.trim() && !exact && (
        <button className="btn dashed block" onClick={() => setCreating(true)}>+ 新建食材「{q.trim()}」</button>
      )}
      <div className="card list">
        {results.length === 0 && <div className="row"><span className="row-sub">没有找到</span></div>}
        {results.map((f) => (
          <button key={f.id} className="row button" onClick={() => onPick(f)}>
            <span className="row-main">
              <span className="row-title">{f.name}{f.aliases.length ? <span className="row-sub"> · {f.aliases.slice(0, 2).join('、')}</span> : null}</span>
              <span className="row-sub">{f.section}{f.kind === 'staple' ? ' · 常备品' : ''}</span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function NewFoodSheet({
  name: initialName, staple, onClose, onBack, onCreated,
}: {
  name: string;
  staple?: boolean;
  onClose: () => void;
  onBack: () => void;
  onCreated: (f: Food) => void;
}) {
  const settings = useSettings();
  const sections = settings.sectionOrder.length ? settings.sectionOrder : DEFAULT_SECTIONS;
  const [name, setName] = useState(initialName);
  const [section, setSection] = useState(staple ? '调料' : '蔬菜水果');
  const d = SECTION_DEFAULTS[section] ?? SECTION_DEFAULTS['其他'];
  const [kind, setKind] = useState<'staple' | 'tracked'>(staple ? 'staple' : d.kind);
  const [baseUnit, setBaseUnit] = useState<BaseUnit>('g');
  const [gPer, setGPer] = useState('100');
  const [loc, setLoc] = useState<Location>(d.loc);
  const [days, setDays] = useState(String(d.days));
  const [kcal, setKcal] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiData, setAiData] = useState<AiNutrition | null>(null);
  const [filling, setFilling] = useState(false);
  const toast = useToast();

  async function fillByAi() {
    setFilling(true);
    try {
      const n = await ai.estimateNutrition(name.trim());
      setAiData(n);
      if (sections.includes(n.section)) setSection(n.section);
      if (!staple) setKind(n.kind);
      setBaseUnit(n.baseUnit);
      setGPer(String(Math.round(n.gPerBase)));
      setLoc(n.defaultLocation);
      setDays(String(n.shelfDays[n.defaultLocation] ?? days));
      setKcal(String(Math.round(n.per100.kcal)));
      toast('AI 填好了，核对一下就能保存');
    } catch (e) {
      toast(errorText(e));
    } finally {
      setFilling(false);
    }
  }

  function pickSection(s: string) {
    setSection(s);
    const sd = SECTION_DEFAULTS[s] ?? SECTION_DEFAULTS['其他'];
    if (!staple) setKind(sd.kind);
    setLoc(sd.loc);
    setDays(String(sd.days));
  }

  async function save() {
    setBusy(true);
    // 用了 AI 的结果且热量没改过，就把蛋白质等完整数据也存上
    const useAi = aiData && kcal.trim() === String(Math.round(aiData.per100.kcal));
    const food = await createFood({
      name: name.trim(),
      aliases: useAi ? aiData.aliases.filter((a) => a && a !== name.trim()) : [],
      section,
      kind,
      baseUnit,
      gPerBase: baseUnit === '个' ? Math.max(1, Number(gPer) || 100) : 1,
      conversions: useAi ? aiData.conversions.filter((c) => c.unit && c.toBase > 0) : [],
      per100: useAi ? aiData.per100 : kcal.trim() ? { kcal: Number(kcal) || 0, protein: 0, fat: 0, carb: 0 } : null,
      nutritionSource: useAi ? 'ai' : 'manual',
      shelfDays: { [loc]: Math.max(1, Number(days) || 7) },
      defaultLocation: loc,
    });
    onCreated(food);
  }

  return (
    <Sheet
      title="新建食材"
      sub="以后可以在冰箱里继续用到它"
      onClose={onClose}
      footer={
        <div className="bar-row">
          <button className="btn" onClick={onBack}>返回</button>
          <button className="btn primary" disabled={!name.trim() || busy} onClick={save}>保存</button>
        </div>
      }
    >
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: 1 }}>名称<input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <button className="btn" disabled={!name.trim() || filling} onClick={fillByAi}>{filling ? '填写中…' : '让 AI 填写'}</button>
        </div>
        <div className="field">
          分区
          <div className="chips">
            {sections.map((s) => (
              <button key={s} className={'chip' + (s === section ? ' on' : '')} aria-pressed={s === section} onClick={() => pickSection(s)}>{s}</button>
            ))}
          </div>
        </div>
        {!staple && (
          <div className="field">
            类型
            <Segmented label="类型" value={kind} onChange={setKind} options={[{ key: 'tracked', label: '记数量和到期日' }, { key: 'staple', label: '常备品（只记有没有）' }]} />
          </div>
        )}
        {kind === 'tracked' && (
          <>
            <div className="field">
              按什么计量
              <Segmented label="计量单位" value={baseUnit} onChange={setBaseUnit} options={[{ key: 'g', label: '克' }, { key: 'ml', label: '毫升' }, { key: '个', label: '个' }]} />
            </div>
            {baseUnit === '个' && (
              <label className="field">1 个大约多少克<input className="input" inputMode="decimal" value={gPer} onChange={(e) => setGPer(e.target.value)} /></label>
            )}
            <div className="field">
              默认放在
              <Segmented label="默认存放位置" value={loc} onChange={setLoc} options={LOCATIONS} />
            </div>
            <label className="field">一般能放几天<input className="input" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} /></label>
          </>
        )}
        <label className="field">
          每 100 克热量（kcal，可以先不填）
          <input className="input" inputMode="decimal" placeholder="不填就不计入热量" value={kcal} onChange={(e) => setKcal(e.target.value)} />
        </label>
      </div>
    </Sheet>
  );
}
