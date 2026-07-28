import React, { useState, useEffect, useRef, useCallback } from "react";
import { Plus, X, ChevronLeft, ChevronRight, Settings2, CalendarDays, Target, Music2, Stamp, Printer, RefreshCw, Minus } from "lucide-react";

/* ============================================================
   定数
============================================================ */
const DAYS = [
  { key: "mon", label: "月" },
  { key: "tue", label: "火" },
  { key: "wed", label: "水" },
  { key: "thu", label: "木" },
  { key: "fri", label: "金" },
];
const PERIOD_NUMS = [1, 2, 3, 4, 5, 6, 7];
const ROWS = [
  { type: "period", num: 1 },
  { type: "period", num: 2 },
  { type: "period", num: 3 },
  { type: "break", label: "中休み" },
  { type: "period", num: 4 },
  { type: "period", num: 5 },
  { type: "break", label: "給食" },
  { type: "break", label: "昼休み" },
  { type: "period", num: 6 },
  { type: "period", num: 7 },
];
const PERSPECTIVES = [
  { key: "知", label: "知：知識・技能" },
  { key: "思", label: "思：思考・判断・表現" },
  { key: "主", label: "主：主体的に学習に取り組む態度" },
];
const PERSPECTIVE_COLOR = { 知: "#2B6E6E", 思: "#8A5A2B", 主: "#B5453D" };
const GRADES = ["1年", "2年", "3年", "4年", "5年", "6年", "その他"];

const INK = "#26324A";
const PAPER = "#F7F4EC";
const PAPER_DARK = "#EFEAE0";
const LINE = "#D8D0BE";
const ACCENT = "#2B6E6E";
const HANKO = "#B5453D";

/* ============================================================
   ヘルパー関数
============================================================ */
function circled(n) {
  if (n < 1) return "";
  if (n <= 20) return String.fromCodePoint(0x2460 + n - 1);
  if (n <= 35) return String.fromCodePoint(0x3251 + n - 21);
  if (n <= 50) return String.fromCodePoint(0x32b1 + n - 36);
  return `(${n})`;
}
function pad(n) {
  return String(n).padStart(2, "0");
}
function toDateStr(dt) {
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
function toMonday(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return toDateStr(dt);
}
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return toDateStr(dt);
}
function formatWeekRange(monday) {
  const fri = addDays(monday, 4);
  const [y1, m1, d1] = monday.split("-");
  const [, m2, d2] = fri.split("-");
  return `${y1}年${Number(m1)}月${Number(d1)}日（月）〜${Number(m2)}月${Number(d2)}日（金）`;
}
function emptyTimetable() {
  const t = {};
  DAYS.forEach((d) => {
    t[d.key] = {};
    PERIOD_NUMS.forEach((p) => {
      t[d.key][p] = null;
    });
  });
  return t;
}
function buildWeekFromTimetable(timetable) {
  const lessons = {};
  DAYS.forEach((d) => {
    lessons[d.key] = {};
    PERIOD_NUMS.forEach((p) => {
      const cls = timetable?.[d.key]?.[p] || null;
      lessons[d.key][p] = cls ? { class: cls, content: "", skip: false, skipReason: "" } : null;
    });
  });
  return { lessons, reflection: "", goal: "", stamps: { principal: false, vice: false, tantou: false } };
}
function computeLessonNumbers(weeks) {
  const weekStarts = Object.keys(weeks).sort();
  const counters = {};
  const numbers = {};
  for (const ws of weekStarts) {
    const week = weeks[ws];
    numbers[ws] = {};
    for (const d of DAYS) {
      numbers[ws][d.key] = {};
      for (const p of PERIOD_NUMS) {
        const slot = week?.lessons?.[d.key]?.[p];
        if (slot && slot.class && !slot.skip) {
          counters[slot.class] = (counters[slot.class] || 0) + 1;
          numbers[ws][d.key][p] = counters[slot.class];
        }
      }
    }
  }
  return { numbers, maxByClass: counters };
}
function inferGrade(name) {
  const m = String(name).match(/^(\d+)\s*年/);
  return m ? `${m[1]}年` : "その他";
}
/** クラス名から学年を求める（設定済みなら設定値、なければ名前から推測） */
function classGrade(config, className) {
  const found = config.classes.find((c) => c.name === className);
  if (found) return found.grade;
  return inferGrade(className);
}
function computeMaxByGrade(config, maxByClass) {
  const result = {};
  config.classes.forEach((c) => {
    const m = maxByClass[c.name] || 0;
    result[c.grade] = Math.max(result[c.grade] || 0, m);
  });
  return result;
}
/** 旧バージョン（クラス名の文字列配列）からの移行 */
function migrateClasses(rawClasses) {
  let changed = false;
  const next = (rawClasses || []).map((c) => {
    if (typeof c === "string") {
      changed = true;
      const m = c.match(/^(\d+)\s*年/);
      const grade = m ? `${m[1]}年` : "その他";
      const rest = m ? c.slice(m[0].length).trim() : c;
      return { name: c, grade, suffix: rest || c };
    }
    return c;
  });
  return { next, changed };
}
/** めあてがクラス名で保存されていた旧データを学年キーへ移行 */
function migrateObjectivesToGrades(config, objectives) {
  let changed = false;
  const next = { ...objectives };
  config.classes.forEach((cls) => {
    const key = cls.name;
    if (key === cls.grade) return;
    if (next[key] && typeof next[key] === "object") {
      const grade = cls.grade;
      const bucket = { ...(next[grade] || {}) };
      Object.keys(next[key]).forEach((k) => {
        if (k === "_meta") return;
        if (bucket[k] === undefined) {
          bucket[k] = next[key][k];
          changed = true;
        }
      });
      if (next[key]._meta) {
        const curExtra = bucket._meta?.extra || 0;
        const oldExtra = next[key]._meta.extra || 0;
        bucket._meta = { extra: Math.max(curExtra, oldExtra) };
        changed = true;
      }
      next[grade] = bucket;
      delete next[key];
      changed = true;
    }
  });
  return { next, changed };
}

/* ============================================================
   ストレージ ヘルパー
============================================================ */
async function loadKey(key, fallback) {
  try {
    const res = await window.storage.get(key, false);
    if (res && res.value) return JSON.parse(res.value);
    return fallback;
  } catch (e) {
    return fallback;
  }
}
async function saveKey(key, value) {
  try {
    await window.storage.set(key, JSON.stringify(value), false);
  } catch (e) {
    console.error("保存に失敗しました", key, e);
  }
}

/* ============================================================
   フォント読み込み
============================================================ */
function useFonts() {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;700&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap";
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);
}

/* ============================================================
   スタッフライン（五線）飾り
============================================================ */
function StaffLine({ width = 220 }) {
  return (
    <svg width={width} height="26" viewBox={`0 0 ${width} 26`} style={{ display: "block" }}>
      {[3, 8, 13, 18, 23].map((y) => (
        <line key={y} x1="0" y1={y} x2={width} y2={y} stroke={LINE} strokeWidth="1" />
      ))}
      <circle cx="10" cy="18" r="4.2" fill={ACCENT} />
      <line x1="14" y1="18" x2="14" y2="2" stroke={ACCENT} strokeWidth="1.6" />
    </svg>
  );
}

/* ============================================================
   ハンコ（印）ボタン
============================================================ */
function HankoButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        background: "none",
        border: "none",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: "50%",
          border: `2px solid ${HANKO}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: active ? HANKO : "transparent",
          color: active ? "#fff" : HANKO,
          fontFamily: "'Shippori Mincho', serif",
          fontWeight: 700,
          fontSize: 15,
          transition: "all .15s ease",
        }}
      >
        {active ? "印" : ""}
      </div>
      <span style={{ fontSize: 11, color: INK, letterSpacing: 1 }}>{label}</span>
    </button>
  );
}

/* ============================================================
   メイン アプリ
============================================================ */
export default function MusicWeeklyPlanner() {
  useFonts();
  const [tab, setTab] = useState("weekly");
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState({ classes: [], timetable: emptyTimetable() });
  const [weeks, setWeeks] = useState({});
  const [objectives, setObjectives] = useState({});
  const [currentMonday, setCurrentMonday] = useState(toMonday(toDateStr(new Date())));
  const [objGrade, setObjGrade] = useState(null);

  const weeksTimer = useRef(null);
  const objTimer = useRef(null);

  /* 初期ロード（旧データの移行を含む） */
  useEffect(() => {
    (async () => {
      const [c, w, o] = await Promise.all([
        loadKey("config", { classes: [], timetable: emptyTimetable() }),
        loadKey("weeks", {}),
        loadKey("objectives", {}),
      ]);
      const { next: migratedClasses, changed: classesChanged } = migrateClasses(c.classes);
      const finalConfig = { ...c, classes: migratedClasses };
      const { next: migratedObjectives, changed: objChanged } = migrateObjectivesToGrades(finalConfig, o);
      setConfig(finalConfig);
      setWeeks(w);
      setObjectives(migratedObjectives);
      setLoading(false);
      if (classesChanged) saveKey("config", finalConfig);
      if (objChanged) saveKey("objectives", migratedObjectives);
    })();
  }, []);

  /* 週の自動生成 */
  useEffect(() => {
    if (loading) return;
    if (!weeks[currentMonday]) {
      const nw = { ...weeks, [currentMonday]: buildWeekFromTimetable(config.timetable) };
      setWeeks(nw);
      saveKey("weeks", nw);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonday, loading]);

  /* objGrade 初期値（クラスが登録されている学年の中から最初のもの） */
  useEffect(() => {
    if (!objGrade) {
      const firstGrade = config.classes[0]?.grade;
      if (firstGrade) setObjGrade(firstGrade);
    }
  }, [config.classes, objGrade]);

  const persistConfig = (next) => {
    setConfig(next);
    saveKey("config", next);
  };
  const persistWeeksDebounced = (next) => {
    setWeeks(next);
    clearTimeout(weeksTimer.current);
    weeksTimer.current = setTimeout(() => saveKey("weeks", next), 500);
  };
  const persistWeeksNow = (next) => {
    setWeeks(next);
    clearTimeout(weeksTimer.current);
    saveKey("weeks", next);
  };
  const persistObjectivesDebounced = (next) => {
    setObjectives(next);
    clearTimeout(objTimer.current);
    objTimer.current = setTimeout(() => saveKey("objectives", next), 500);
  };
  const persistObjectivesNow = (next) => {
    setObjectives(next);
    clearTimeout(objTimer.current);
    saveKey("objectives", next);
  };

  const { numbers, maxByClass } = computeLessonNumbers(weeks);
  const maxByGrade = computeMaxByGrade(config, maxByClass);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: PAPER, fontFamily: "'Zen Kaku Gothic New', sans-serif", color: INK }}>
        読み込み中…
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: PAPER, fontFamily: "'Zen Kaku Gothic New', sans-serif", color: INK, paddingBottom: 60 }}>
      <style>{`
        * { box-sizing: border-box; }
        select, textarea, input { font-family: 'Zen Kaku Gothic New', sans-serif; }
        textarea { resize: vertical; }
        ::placeholder { color: #A79E8C; }
        button { font-family: 'Zen Kaku Gothic New', sans-serif; }
        .clamp2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        @media print {
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
          body * { visibility: hidden; }
          .print-page, .print-page * { visibility: visible !important; }
          .print-page {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 210mm !important;
            min-height: 297mm !important;
            margin: 0 !important;
            box-shadow: none !important;
          }
          @page { size: A4; margin: 0; }
        }
      `}</style>

      {/* ヘッダー */}
      <header className="no-print" style={{ padding: "28px 20px 14px", borderBottom: `1px solid ${LINE}` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Music2 size={28} color={ACCENT} />
            <div>
              <h1 style={{ fontFamily: "'Shippori Mincho', serif", fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: 1 }}>
                音楽科 週案帳
              </h1>
              <div style={{ fontSize: 12, color: "#7A7263", marginTop: 2 }}>Weekly Music Lesson Planner</div>
            </div>
          </div>
          <StaffLine width={200} />
        </div>

        {/* タブ */}
        <nav style={{ maxWidth: 1100, margin: "20px auto 0", display: "flex", gap: 8 }}>
          <TabButton icon={<Settings2 size={16} />} label="設定" active={tab === "settings"} onClick={() => setTab("settings")} />
          <TabButton icon={<CalendarDays size={16} />} label="週案" active={tab === "weekly"} onClick={() => setTab("weekly")} />
          <TabButton icon={<Target size={16} />} label="めあて一覧" active={tab === "objectives"} onClick={() => setTab("objectives")} />
          <TabButton icon={<Printer size={16} />} label="印刷プレビュー" active={tab === "print"} onClick={() => setTab("print")} />
        </nav>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px" }}>
        {tab === "settings" && <SettingsTab config={config} persistConfig={persistConfig} />}
        {tab === "weekly" && (
          <WeeklyTab
            config={config}
            weeks={weeks}
            currentMonday={currentMonday}
            setCurrentMonday={setCurrentMonday}
            numbers={numbers}
            objectives={objectives}
            persistWeeksDebounced={persistWeeksDebounced}
            persistWeeksNow={persistWeeksNow}
          />
        )}
        {tab === "objectives" && (
          <ObjectivesTab
            config={config}
            objectives={objectives}
            maxByGrade={maxByGrade}
            objGrade={objGrade}
            setObjGrade={setObjGrade}
            persistObjectivesDebounced={persistObjectivesDebounced}
            persistObjectivesNow={persistObjectivesNow}
          />
        )}
        {tab === "print" && (
          <PrintTab
            config={config}
            weeks={weeks}
            currentMonday={currentMonday}
            setCurrentMonday={setCurrentMonday}
            numbers={numbers}
            objectives={objectives}
          />
        )}
      </main>
    </div>
  );
}

/* ============================================================
   タブボタン
============================================================ */
function TabButton({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "9px 18px",
        borderRadius: "10px 10px 0 0",
        border: `1px solid ${LINE}`,
        borderBottom: active ? `2px solid ${PAPER}` : `1px solid ${LINE}`,
        background: active ? "#FFFFFF" : PAPER_DARK,
        color: active ? ACCENT : "#7A7263",
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
        marginBottom: -1,
        fontSize: 14,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

/* ============================================================
   設定タブ
============================================================ */
function SettingsTab({ config, persistConfig }) {
  const [newGrade, setNewGrade] = useState("1年");
  const [newSuffix, setNewSuffix] = useState("");

  const addClass = () => {
    const suffix = newSuffix.trim();
    if (!suffix) return;
    const name = `${newGrade}${suffix}`;
    if (config.classes.some((c) => c.name === name)) return;
    persistConfig({ ...config, classes: [...config.classes, { name, grade: newGrade, suffix }] });
    setNewSuffix("");
  };
  const removeClass = (name) => {
    persistConfig({ ...config, classes: config.classes.filter((c) => c.name !== name) });
  };
  const setTimetableCell = (day, period, value) => {
    const t = { ...config.timetable, [day]: { ...config.timetable[day], [period]: value || null } };
    persistConfig({ ...config, timetable: t });
  };

  const grouped = GRADES.map((g) => ({ grade: g, list: config.classes.filter((c) => c.grade === g) })).filter((g) => g.list.length > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* クラス管理 */}
      <section style={cardStyle}>
        <h2 style={sectionTitle}>担当クラスの設定</h2>
        <p style={hintText}>
          受け持っているクラスを、学年を選んでから登録してください。めあては学年ごとにまとめて管理されます（同じ学年の複数クラスで共通のめあてを使えます）。
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
          {grouped.map(({ grade, list }) => (
            <div key={grade} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: ACCENT, minWidth: 42 }}>{grade}</span>
              {list.map((c) => (
                <span
                  key={c.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: PAPER_DARK,
                    border: `1px solid ${LINE}`,
                    borderRadius: 20,
                    padding: "6px 6px 6px 14px",
                    fontSize: 14,
                  }}
                >
                  {c.name}
                  <button onClick={() => removeClass(c.name)} style={{ border: "none", background: "none", cursor: "pointer", display: "flex", color: "#9A8F7A" }}>
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          ))}
          {config.classes.length === 0 && <span style={{ color: "#A79E8C", fontSize: 13 }}>まだクラスが登録されていません</span>}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={newGrade} onChange={(e) => setNewGrade(e.target.value)} style={{ ...selectStyle, width: "auto", minWidth: 90 }}>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <input
            value={newSuffix}
            onChange={(e) => setNewSuffix(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addClass()}
            placeholder="例：2組"
            style={{ ...inputStyle, minWidth: 120 }}
          />
          <button onClick={addClass} style={primaryBtn}>
            <Plus size={16} /> 追加
          </button>
        </div>
      </section>

      {/* 時間割設定 */}
      <section style={cardStyle}>
        <h2 style={sectionTitle}>固定時間割の設定</h2>
        <p style={hintText}>各曜日・各時間に担当するクラスを選択してください。新しく作成する週にはこの内容が反映されます（既存の週には影響しません）。</p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
            <thead>
              <tr>
                <th style={thStyle}></th>
                {DAYS.map((d) => (
                  <th key={d.key} style={thStyle}>
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, idx) =>
                row.type === "break" ? (
                  <tr key={idx}>
                    <td style={{ ...tdLabel, background: PAPER_DARK }}>{row.label}</td>
                    <td colSpan={DAYS.length} style={{ ...tdBase, background: PAPER_DARK, color: "#9A8F7A", textAlign: "center", fontSize: 12 }}>
                      {row.label}
                    </td>
                  </tr>
                ) : (
                  <tr key={idx}>
                    <td style={tdLabel}>{row.num}</td>
                    {DAYS.map((d) => (
                      <td key={d.key} style={tdBase}>
                        <select
                          value={config.timetable?.[d.key]?.[row.num] || ""}
                          onChange={(e) => setTimetableCell(d.key, row.num, e.target.value)}
                          style={selectStyle}
                        >
                          <option value="">―</option>
                          {config.classes.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    ))}
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ============================================================
   週案タブ
============================================================ */
function WeeklyTab({ config, weeks, currentMonday, setCurrentMonday, numbers, objectives, persistWeeksDebounced, persistWeeksNow }) {
  const week = weeks[currentMonday] || buildWeekFromTimetable(config.timetable);

  const updateSlot = (day, period, patch, debounce = true) => {
    const w = weeks[currentMonday] || buildWeekFromTimetable(config.timetable);
    const existing = w.lessons[day][period] || { class: "", content: "", skip: false, skipReason: "" };
    const nextSlot = { ...existing, ...patch };
    const nw = {
      ...weeks,
      [currentMonday]: { ...w, lessons: { ...w.lessons, [day]: { ...w.lessons[day], [period]: nextSlot } } },
    };
    (debounce ? persistWeeksDebounced : persistWeeksNow)(nw);
  };
  const clearSlot = (day, period) => {
    const w = weeks[currentMonday] || buildWeekFromTimetable(config.timetable);
    const nw = {
      ...weeks,
      [currentMonday]: { ...w, lessons: { ...w.lessons, [day]: { ...w.lessons[day], [period]: null } } },
    };
    persistWeeksNow(nw);
  };
  const updateWeekField = (field, value, debounce = true) => {
    const w = weeks[currentMonday] || buildWeekFromTimetable(config.timetable);
    const nw = { ...weeks, [currentMonday]: { ...w, [field]: value } };
    (debounce ? persistWeeksDebounced : persistWeeksNow)(nw);
  };
  const toggleStamp = (key) => {
    const w = weeks[currentMonday] || buildWeekFromTimetable(config.timetable);
    const nw = { ...weeks, [currentMonday]: { ...w, stamps: { ...w.stamps, [key]: !w.stamps?.[key] } } };
    persistWeeksNow(nw);
  };
  const applyTimetableToWeek = () => {
    const w = weeks[currentMonday] || buildWeekFromTimetable(config.timetable);
    const lessons = {};
    DAYS.forEach((d) => {
      lessons[d.key] = { ...w.lessons[d.key] };
      PERIOD_NUMS.forEach((p) => {
        const cls = config.timetable?.[d.key]?.[p] || null;
        const existing = lessons[d.key][p];
        if (cls && !existing) {
          lessons[d.key][p] = { class: cls, content: "", skip: false, skipReason: "" };
        }
      });
    });
    persistWeeksNow({ ...weeks, [currentMonday]: { ...w, lessons } });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 週ナビゲーション + ハンコ */}
      <div style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setCurrentMonday(addDays(currentMonday, -7))} style={navBtn}>
            <ChevronLeft size={18} />
          </button>
          <div style={{ textAlign: "center", minWidth: 220 }}>
            <div style={{ fontFamily: "'Shippori Mincho', serif", fontSize: 18, fontWeight: 700 }}>{formatWeekRange(currentMonday)}</div>
            <input
              type="date"
              value={currentMonday}
              onChange={(e) => setCurrentMonday(toMonday(e.target.value))}
              style={{ marginTop: 6, border: `1px solid ${LINE}`, borderRadius: 6, padding: "3px 8px", fontSize: 12, color: "#7A7263" }}
            />
          </div>
          <button onClick={() => setCurrentMonday(addDays(currentMonday, 7))} style={navBtn}>
            <ChevronRight size={18} />
          </button>
          <button onClick={applyTimetableToWeek} style={{ ...primaryBtn, background: "#fff", color: ACCENT, border: `1px solid ${ACCENT}` }} title="固定時間割で空いているコマに授業を反映します（既に入力済みのコマは変更しません）">
            <RefreshCw size={14} /> 時間割を反映
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <Stamp size={16} color="#9A8F7A" />
          <HankoButton label="校長" active={!!week.stamps?.principal} onClick={() => toggleStamp("principal")} />
          <HankoButton label="副校長" active={!!week.stamps?.vice} onClick={() => toggleStamp("vice")} />
          <HankoButton label="担当" active={!!week.stamps?.tantou} onClick={() => toggleStamp("tantou")} />
        </div>
      </div>

      {config.classes.length === 0 && (
        <div style={{ ...cardStyle, color: "#9A8F7A", fontSize: 14 }}>
          「設定」タブでまず担当クラスと固定時間割を登録してください。
        </div>
      )}

      {/* 週案グリッド */}
      <section style={{ ...cardStyle, overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 50 }}></th>
              {DAYS.map((d) => (
                <th key={d.key} style={thStyle}>
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, idx) =>
              row.type === "break" ? (
                <tr key={idx}>
                  <td style={{ ...tdLabel, background: PAPER_DARK }}>{row.label}</td>
                  <td colSpan={DAYS.length} style={{ ...tdBase, background: PAPER_DARK, color: "#9A8F7A", textAlign: "center", fontSize: 12 }}>
                    {row.label}
                  </td>
                </tr>
              ) : (
                <tr key={idx}>
                  <td style={tdLabel}>{row.num}</td>
                  {DAYS.map((d) => {
                    const slot = week.lessons?.[d.key]?.[row.num];
                    const num = numbers?.[currentMonday]?.[d.key]?.[row.num];
                    const grade = slot?.class ? classGrade(config, slot.class) : null;
                    const objText = grade ? objectives?.[grade]?.[num]?.text : "";
                    const objPersp = grade ? objectives?.[grade]?.[num]?.perspective : "";
                    return (
                      <td key={d.key} style={{ ...tdBase, verticalAlign: "top", minWidth: 160 }}>
                        <select
                          value={slot?.class || ""}
                          onChange={(e) => (e.target.value ? updateSlot(d.key, row.num, { class: e.target.value, content: slot?.content || "", skip: false }, false) : clearSlot(d.key, row.num))}
                          style={{ ...selectStyle, marginBottom: 6, fontWeight: 600 }}
                        >
                          <option value="">―</option>
                          {config.classes.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </select>

                        {slot?.class && (
                          <>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  minWidth: 22,
                                  height: 22,
                                  padding: "0 3px",
                                  borderRadius: "50%",
                                  background: slot.skip ? "#E4DFD2" : ACCENT,
                                  color: slot.skip ? "#9A8F7A" : "#fff",
                                  fontSize: 13,
                                  fontWeight: 700,
                                }}
                                title="授業回数"
                              >
                                {num ? circled(num) : "-"}
                              </span>
                              <label style={{ fontSize: 11, color: "#9A8F7A", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                                <input type="checkbox" checked={!!slot.skip} onChange={(e) => updateSlot(d.key, row.num, { skip: e.target.checked }, false)} />
                                実施しない
                              </label>
                            </div>

                            <textarea
                              value={slot.content || ""}
                              onChange={(e) => updateSlot(d.key, row.num, { content: e.target.value })}
                              placeholder="授業内容"
                              rows={3}
                              style={{ ...textareaStyle, marginBottom: 6 }}
                            />

                            <div
                              style={{
                                fontSize: 11,
                                background: PAPER_DARK,
                                border: `1px dashed ${LINE}`,
                                borderRadius: 6,
                                padding: "5px 7px",
                                minHeight: 30,
                                color: objText ? INK : "#A79E8C",
                              }}
                            >
                              {objPersp && (
                                <span style={{ color: PERSPECTIVE_COLOR[objPersp], fontWeight: 700, marginRight: 4 }}>
                                  【{objPersp}】
                                </span>
                              )}
                              {objText || "めあて未設定（「めあて一覧」で入力）"}
                            </div>
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              )
            )}
          </tbody>
        </table>
      </section>

      {/* 振り返り・目標 */}
      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={cardStyle}>
          <h3 style={{ ...sectionTitle, fontSize: 15 }}>今週の目標</h3>
          <textarea
            value={week.goal || ""}
            onChange={(e) => updateWeekField("goal", e.target.value)}
            rows={3}
            placeholder="今週、指導の中で意識したいことなど"
            style={textareaStyle}
          />
        </div>
        <div style={cardStyle}>
          <h3 style={{ ...sectionTitle, fontSize: 15 }}>今週の振り返り</h3>
          <textarea
            value={week.reflection || ""}
            onChange={(e) => updateWeekField("reflection", e.target.value)}
            rows={3}
            placeholder="授業の様子、成果と課題など"
            style={textareaStyle}
          />
        </div>
      </section>
    </div>
  );
}

/* ============================================================
   めあて一覧タブ
============================================================ */
function ObjectivesTab({ config, objectives, maxByGrade, objGrade, setObjGrade, persistObjectivesDebounced, persistObjectivesNow }) {
  if (config.classes.length === 0) {
    return <div style={{ ...cardStyle, color: "#9A8F7A" }}>「設定」タブで担当クラスを登録すると、ここにめあてを入力できます。</div>;
  }
  const gradesPresent = GRADES.filter((g) => config.classes.some((c) => c.grade === g));
  const grade = objGrade || gradesPresent[0];
  const classesInGrade = config.classes.filter((c) => c.grade === grade).map((c) => c.name);

  const known = Object.keys(objectives?.[grade] || {})
    .filter((k) => k !== "_meta")
    .map(Number);
  const extra = objectives?.[grade]?._meta?.extra || 0;
  const maxNum = Math.max(maxByGrade[grade] || 0, known.length ? Math.max(...known) : 0);
  const displayCount = maxNum + 3 + extra;
  const rows = Array.from({ length: displayCount }, (_, i) => i + 1);

  const updateObj = (num, patch, debounce = true) => {
    const cur = objectives?.[grade]?.[num] || { perspective: "", text: "" };
    const next = {
      ...objectives,
      [grade]: { ...(objectives[grade] || {}), [num]: { ...cur, ...patch } },
    };
    (debounce ? persistObjectivesDebounced : persistObjectivesNow)(next);
  };
  const changeExtra = (delta) => {
    const curMeta = objectives?.[grade]?._meta || { extra: 0 };
    const nextExtra = Math.max(0, (curMeta.extra || 0) + delta);
    const next = { ...objectives, [grade]: { ...(objectives[grade] || {}), _meta: { ...curMeta, extra: nextExtra } } };
    persistObjectivesNow(next);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>学年：</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {gradesPresent.map((g) => (
            <button
              key={g}
              onClick={() => setObjGrade(g)}
              style={{
                padding: "7px 16px",
                borderRadius: 20,
                border: `1px solid ${g === grade ? ACCENT : LINE}`,
                background: g === grade ? ACCENT : "#fff",
                color: g === grade ? "#fff" : INK,
                fontWeight: g === grade ? 700 : 500,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <section style={cardStyle}>
        <p style={hintText}>
          ここで入力しためあては、同じ学年に属するすべてのクラス（{classesInGrade.join("、")}）の週案に、回数が一致するコマへ自動的に表示されます。回数は週案に入力された授業から自動的に連動します。
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((num) => {
            const o = objectives?.[grade]?.[num] || { perspective: "", text: "" };
            const isPlanned = num <= (maxByGrade[grade] || 0);
            return (
              <div
                key={num}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  border: `1px solid ${LINE}`,
                  borderRadius: 10,
                  padding: 12,
                  background: isPlanned ? "#fff" : PAPER_DARK,
                }}
              >
                <div
                  style={{
                    minWidth: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: isPlanned ? ACCENT : "#D8D0BE",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: 14,
                    flexShrink: 0,
                  }}
                >
                  {circled(num)}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                  <select
                    value={o.perspective || ""}
                    onChange={(e) => updateObj(num, { perspective: e.target.value }, false)}
                    style={{ ...selectStyle, maxWidth: 260 }}
                  >
                    <option value="">評価観点を選択</option>
                    {PERSPECTIVES.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={o.text || ""}
                    onChange={(e) => updateObj(num, { text: e.target.value })}
                    placeholder="具体的なめあてを入力（例：拍の流れにのって強弱の変化を感じ取りながら演奏する）"
                    style={inputStyle}
                  />
                </div>
                {!isPlanned && (
                  <span style={{ fontSize: 11, color: "#A79E8C", whiteSpace: "nowrap", marginTop: 8 }}>未実施</span>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 14 }}>
          <button onClick={() => changeExtra(1)} style={{ ...primaryBtn, background: "#fff", color: ACCENT, border: `1px solid ${ACCENT}` }}>
            <Plus size={14} /> 回を追加
          </button>
          {extra > 0 && (
            <button onClick={() => changeExtra(-1)} style={{ ...primaryBtn, background: "#fff", color: "#9A8F7A", border: `1px solid ${LINE}` }}>
              <Minus size={14} /> 追加分を1つ減らす
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

/* ============================================================
   印刷プレビュー タブ（A4・1枚）
============================================================ */
function PrintTab({ config, weeks, currentMonday, setCurrentMonday, numbers, objectives }) {
  const week = weeks[currentMonday] || buildWeekFromTimetable(config.timetable);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
      <div className="no-print" style={{ ...cardStyle, width: "100%", maxWidth: 900, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setCurrentMonday(addDays(currentMonday, -7))} style={navBtn}>
            <ChevronLeft size={18} />
          </button>
          <span style={{ fontWeight: 700 }}>{formatWeekRange(currentMonday)}</span>
          <button onClick={() => setCurrentMonday(addDays(currentMonday, 7))} style={navBtn}>
            <ChevronRight size={18} />
          </button>
        </div>
        <div style={{ fontSize: 12.5, color: "#8A8272", lineHeight: 1.6 }}>
          「印刷 / PDF出力」を押すと印刷ダイアログが開きます。送信先で <strong>PDFに保存</strong> を選ぶとPDFとして保存できます。
          <br />
          うまくダイアログが開かない場合は、画面右上のアイコンでこのアプリを別ウィンドウ（フルスクリーン）で開いてから、もう一度お試しいただくか、キーボードの <strong>Ctrl+P</strong>（Macは<strong>⌘+P</strong>）をお使いください。
        </div>
        <button onClick={() => window.print()} style={primaryBtn}>
          <Printer size={16} /> 印刷 / PDF出力
        </button>
      </div>

      <div
        className="print-page"
        style={{
          width: "210mm",
          minHeight: "297mm",
          background: "#fff",
          padding: "12mm",
          boxSizing: "border-box",
          boxShadow: "0 0 14px rgba(0,0,0,0.15)",
          color: INK,
          fontFamily: "'Zen Kaku Gothic New', sans-serif",
        }}
      >
        {/* ヘッダー：タイトル・週・印欄（右上） */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "3mm" }}>
          <div>
            <div style={{ fontFamily: "'Shippori Mincho', serif", fontSize: 20, fontWeight: 700 }}>音楽科　週案</div>
            <div style={{ fontSize: 11.5, color: "#555", marginTop: "1mm" }}>{formatWeekRange(currentMonday)}</div>
          </div>
          <div style={{ display: "flex", gap: "4mm" }}>
            {["校長", "副校長", "担当"].map((label) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1mm" }}>
                <div style={{ width: "16mm", height: "16mm", border: "1px solid #999" }} />
                <span style={{ fontSize: 9 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 授業グリッド */}
        <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "7%" }} />
            {DAYS.map((d) => (
              <col key={d.key} style={{ width: `${93 / DAYS.length}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th style={printTh}></th>
              {DAYS.map((d) => (
                <th key={d.key} style={printTh}>
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, idx) =>
              row.type === "break" ? (
                <tr key={idx}>
                  <td style={{ ...printTdLabel, background: "#F0EDE4" }}>{row.label}</td>
                  <td colSpan={DAYS.length} style={{ ...printTd, background: "#F0EDE4", textAlign: "center", color: "#888", fontSize: 8.5, padding: "1mm" }}>
                    {row.label}
                  </td>
                </tr>
              ) : (
                <tr key={idx}>
                  <td style={printTdLabel}>{row.num}</td>
                  {DAYS.map((d) => {
                    const slot = week.lessons?.[d.key]?.[row.num];
                    const num = numbers?.[currentMonday]?.[d.key]?.[row.num];
                    const grade = slot?.class ? classGrade(config, slot.class) : null;
                    const objText = grade ? objectives?.[grade]?.[num]?.text : "";
                    const objPersp = grade ? objectives?.[grade]?.[num]?.perspective : "";
                    return (
                      <td key={d.key} style={{ ...printTd, verticalAlign: "top" }}>
                        {slot?.class && (
                          <>
                            <div style={{ display: "flex", alignItems: "center", gap: "1mm", marginBottom: "0.5mm" }}>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: "4mm",
                                  height: "4mm",
                                  borderRadius: "50%",
                                  background: slot.skip ? "#ccc" : ACCENT,
                                  color: "#fff",
                                  fontSize: 8,
                                  fontWeight: 700,
                                  flexShrink: 0,
                                }}
                              >
                                {num ? circled(num) : "-"}
                              </span>
                              <span style={{ fontSize: 9, fontWeight: 700 }}>{slot.class}</span>
                            </div>
                            {objText && (
                              <div className="clamp2" style={{ fontSize: 8, color: PERSPECTIVE_COLOR[objPersp] || "#555", marginBottom: "0.5mm" }}>
                                {objPersp ? `【${objPersp}】` : ""}
                                {objText}
                              </div>
                            )}
                            <div className="clamp2" style={{ fontSize: 8, color: "#333" }}>
                              {slot.content}
                            </div>
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              )
            )}
          </tbody>
        </table>

        {/* 目標・振り返り */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4mm", marginTop: "4mm" }}>
          <div style={{ border: "1px solid #999", borderRadius: 3, padding: "2mm" }}>
            <div style={{ fontSize: 9, fontWeight: 700, marginBottom: "1mm" }}>今週の目標</div>
            <div style={{ fontSize: 9, whiteSpace: "pre-wrap", minHeight: "14mm" }}>{week.goal}</div>
          </div>
          <div style={{ border: "1px solid #999", borderRadius: 3, padding: "2mm" }}>
            <div style={{ fontSize: 9, fontWeight: 700, marginBottom: "1mm" }}>今週の振り返り</div>
            <div style={{ fontSize: 9, whiteSpace: "pre-wrap", minHeight: "14mm" }}>{week.reflection}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
const printTh = { border: "1px solid #999", background: "#F0EDE4", fontSize: 9, padding: "1mm", fontWeight: 700 };
const printTd = { border: "1px solid #999", padding: "1mm 1.2mm" };
const printTdLabel = { border: "1px solid #999", textAlign: "center", fontSize: 9, fontWeight: 700, color: "#555" };

/* ============================================================
   共通スタイル
============================================================ */
const cardStyle = {
  background: "#fff",
  border: `1px solid ${LINE}`,
  borderRadius: 12,
  padding: 20,
};
const sectionTitle = {
  fontFamily: "'Shippori Mincho', serif",
  fontSize: 17,
  fontWeight: 700,
  margin: "0 0 6px",
};
const hintText = { fontSize: 12.5, color: "#8A8272", margin: "0 0 14px", lineHeight: 1.6 };
const inputStyle = {
  flex: 1,
  border: `1px solid ${LINE}`,
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 14,
  color: INK,
  width: "100%",
};
const selectStyle = {
  width: "100%",
  border: `1px solid ${LINE}`,
  borderRadius: 6,
  padding: "4px 6px",
  fontSize: 13,
  color: INK,
  background: "#fff",
};
const textareaStyle = {
  width: "100%",
  border: `1px solid ${LINE}`,
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 12.5,
  color: INK,
  lineHeight: 1.5,
};
const primaryBtn = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  background: ACCENT,
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "8px 16px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const navBtn = {
  width: 32,
  height: 32,
  borderRadius: "50%",
  border: `1px solid ${LINE}`,
  background: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  color: INK,
};
const thStyle = {
  border: `1px solid ${LINE}`,
  background: PAPER_DARK,
  padding: "8px 6px",
  fontSize: 13,
  fontWeight: 700,
};
const tdBase = { border: `1px solid ${LINE}`, padding: 8 };
const tdLabel = {
  border: `1px solid ${LINE}`,
  padding: 8,
  textAlign: "center",
  fontWeight: 700,
  color: "#7A7263",
  background: "#fff",
  fontSize: 13,
};
