/* ============================================================
   音楽科 週案帳 - app.js
   UI・機能は元のHTML版から変更していません。
   データの保存先だけを「JSONファイル」から「Firebase Firestore」に
   置き換え、Googleアカウントでのログインでユーザーごとに分離しています。
============================================================ */

function isNarrow() { return window.innerWidth < 720; }
let resizeTimer = null;
let wasNarrow = isNarrow();
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    // スマホでキーボードが開閉すると innerHeight だけが変化して resize が発火することがあるため、
    // 実際に「スマホ表示⇔PC表示」の境界をまたいだ時だけ再描画する（そうしないと入力中にキーボードが閉じてしまう）
    const nowNarrow = isNarrow();
    if (nowNarrow !== wasNarrow) {
      wasNarrow = nowNarrow;
      if (typeof render === "function") render();
    }
  }, 200);
});

/* ============================================================
   定数
============================================================ */
const ALL_DAYS = [
  { key: "mon", label: "月" },
  { key: "tue", label: "火" },
  { key: "wed", label: "水" },
  { key: "thu", label: "木" },
  { key: "fri", label: "金" },
  { key: "sat", label: "土" },
];
function visibleDays(weekOrCfg) {
  return weekOrCfg?.showSaturday ? ALL_DAYS : ALL_DAYS.filter((d) => d.key !== "sat");
}
const WEEKDAY_ONLY = ALL_DAYS.filter((d) => d.key !== "sat");
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
  { key: "知", label: "知：知識" },
  { key: "技", label: "技：技能" },
  { key: "思", label: "思：思考・判断・表現" },
  { key: "主", label: "主：主体的に学習に取り組む態度" },
];
const PERSPECTIVE_COLOR = { 知: "#2B6E6E", 技: "#4A6FA5", 思: "#8A5A2B", 主: "#B5453D" };
const GRADES = ["1年", "2年", "3年", "4年", "5年", "6年", "その他"];
const WEEKDAY_KANJI = ["日", "月", "火", "水", "木", "金", "土"];

/* ============================================================
   ヘルパー関数
============================================================ */
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}
function circled(n) {
  if (n < 1) return "";
  if (n <= 20) return String.fromCodePoint(0x2460 + n - 1);
  if (n <= 35) return String.fromCodePoint(0x3251 + n - 21);
  if (n <= 50) return String.fromCodePoint(0x32b1 + n - 36);
  return `(${n})`;
}
function pad(n) { return String(n).padStart(2, "0"); }
function toDateStr(dt) { return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`; }
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
function formatWeekRange(monday, week) {
  const days = visibleDays(week);
  const lastOffset = days.length - 1;
  const last = addDays(monday, lastOffset);
  const [y1, m1, d1] = monday.split("-");
  const [, m2, d2] = last.split("-");
  const lastLabel = days[days.length - 1].label;
  return `${y1}年${Number(m1)}月${Number(d1)}日（月）〜${Number(m2)}月${Number(d2)}日（${lastLabel}）`;
}
/** 印刷様式の見出し用の週範囲（月～日、常に日曜まで表示） */
function formatWeekRangeShort(monday) {
  const sunday = addDays(monday, 6);
  const [, m1, d1] = monday.split("-");
  const [, m2, d2] = sunday.split("-");
  return `${Number(m1)}月${Number(d1)}日　～　${Number(m2)}月${Number(d2)}日`;
}
function formatDayHeader(monday, dayIndex) {
  const dateStr = addDays(monday, dayIndex);
  const [, m, d] = dateStr.split("-");
  const dt = new Date(dateStr);
  return `${Number(m)}月${Number(d)}日(${WEEKDAY_KANJI[dt.getDay()]})`;
}
function addMonths(yearMonth, n) {
  const [y, m] = yearMonth.split("-").map(Number);
  const dt = new Date(y, m - 1 + n, 1);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`;
}
function daysInMonth(yearMonth) {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}
const DAY_KEY_BY_JSDAY = { 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat" }; // 0(日)は授業日ではないためキー無し
function lessonAtDate(dateStr, period) {
  const dt = new Date(dateStr);
  const dayKey = DAY_KEY_BY_JSDAY[dt.getDay()];
  if (!dayKey) return null;
  const monday = toMonday(dateStr);
  const week = state.weeks[monday];
  if (!week) return null;
  if (dayKey === "sat" && !week.showSaturday) return null;
  return week.lessons?.[dayKey]?.[period] || null;
}
function emptyTimetable() {
  const t = {};
  ALL_DAYS.forEach((d) => { t[d.key] = {}; PERIOD_NUMS.forEach((p) => { t[d.key][p] = null; }); });
  return t;
}
const BREAK_LABELS = ROWS.filter((r) => r.type === "break").map((r) => r.label);
function emptyBreakNotes() {
  const b = {};
  ALL_DAYS.forEach((d) => {
    b[d.key] = {};
    BREAK_LABELS.forEach((label) => { b[d.key][label] = ""; });
  });
  return b;
}
function getBreakNote(week, day, label) {
  return week?.breakNotes?.[day]?.[label] || "";
}
/** 固定時間割を反映しない、空の週を作る（週を移動しただけでは時間割が自動で入らないようにするため） */
function buildEmptyWeek() {
  const lessons = {};
  ALL_DAYS.forEach((d) => {
    lessons[d.key] = {};
    PERIOD_NUMS.forEach((p) => { lessons[d.key][p] = null; });
  });
  return { lessons, breakNotes: emptyBreakNotes(), reflection: "", goal: "", showSaturday: false };
}
function computeLessonNumbers(weeks) {
  const weekStarts = Object.keys(weeks).sort();
  const counters = {}; // 個別クラスの回数（クラスごと）
  const jointCounters = {}; // 学年合同の回数（学年ごと・個別クラスの回数とは完全に別カウント）
  const numbers = {};
  const jointNumbers = {};
  const dateByClassNumber = {}; // { クラス名: { 回数: "YYYY-MM-DD" } }（学期での絞り込みに使用）
  const dateByGradeJointNumber = {}; // { 学年: { 合同回数: "YYYY-MM-DD" } }
  for (const ws of weekStarts) {
    const week = weeks[ws];
    numbers[ws] = {};
    jointNumbers[ws] = {};
    ALL_DAYS.forEach((d, dayIndex) => {
      numbers[ws][d.key] = {};
      jointNumbers[ws][d.key] = {};
      PERIOD_NUMS.forEach((p) => {
        const slot = week?.lessons?.[d.key]?.[p];
        if (!slot || slot.skip) return;
        const dateStr = addDays(ws, dayIndex);
        if (slot.gradeWide) {
          jointCounters[slot.gradeWide] = (jointCounters[slot.gradeWide] || 0) + 1;
          const n = jointCounters[slot.gradeWide];
          jointNumbers[ws][d.key][p] = n;
          if (!dateByGradeJointNumber[slot.gradeWide]) dateByGradeJointNumber[slot.gradeWide] = {};
          dateByGradeJointNumber[slot.gradeWide][n] = dateStr;
        } else if (slot.class) {
          counters[slot.class] = (counters[slot.class] || 0) + 1;
          const n = counters[slot.class];
          numbers[ws][d.key][p] = n;
          if (!dateByClassNumber[slot.class]) dateByClassNumber[slot.class] = {};
          dateByClassNumber[slot.class][n] = dateStr;
        }
      });
    });
  }
  return { numbers, maxByClass: counters, jointNumbers, maxJointByGrade: jointCounters, dateByClassNumber, dateByGradeJointNumber };
}
function computeHoursByClassAndMonth(weeks, config) {
  const result = {};
  const monthsSet = new Set();
  Object.keys(weeks).forEach((ws) => {
    const week = weeks[ws];
    ALL_DAYS.forEach((d, dayIndex) => {
      PERIOD_NUMS.forEach((p) => {
        const slot = week?.lessons?.[d.key]?.[p];
        if (!slot || slot.skip) return;
        const dateStr = addDays(ws, dayIndex);
        const [y, m] = dateStr.split("-");
        const mk = `${y}-${m}`;
        if (slot.gradeWide) {
          const classesInGrade = (config?.classes || []).filter((c) => c.grade === slot.gradeWide).map((c) => c.name);
          classesInGrade.forEach((cn) => {
            monthsSet.add(mk);
            if (!result[cn]) result[cn] = {};
            result[cn][mk] = (result[cn][mk] || 0) + 1;
          });
        } else if (slot.class) {
          monthsSet.add(mk);
          if (!result[slot.class]) result[slot.class] = {};
          result[slot.class][mk] = (result[slot.class][mk] || 0) + 1;
        }
      });
    });
  });
  const months = Array.from(monthsSet).sort();
  return { result, months };
}
function inferGrade(name) {
  const m = String(name).match(/^(\d+)\s*年/);
  return m ? `${m[1]}年` : "その他";
}
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
        if (bucket[k] === undefined) { bucket[k] = next[key][k]; changed = true; }
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
/** 旧バージョン（クラスごとの必要時数）から学年ごとの必要時数へ移行する */
function migrateGradeRequiredHours(classes, existing) {
  const result = { ...(existing || {}) };
  classes.forEach((c) => {
    if (result[c.grade] == null && c.requiredHours != null && c.requiredHours !== "") {
      result[c.grade] = c.requiredHours;
    }
  });
  return result;
}

function defaultConfig() {
  return { classes: [], timetable: emptyTimetable(), gradeRequiredHours: {} };
}
/** 三学期制の標準的な月の割り当て（4〜7月=1学期、9〜12月=2学期、1〜3月=3学期、8月は夏休みのため学期なし） */
const TERM_MONTHS = { 1: [4, 5, 6, 7], 2: [9, 10, 11, 12], 3: [1, 2, 3] };
function termOfDate(dateStr) {
  if (!dateStr) return null;
  const month = Number(dateStr.split("-")[1]);
  for (const term of Object.keys(TERM_MONTHS)) {
    if (TERM_MONTHS[term].includes(month)) return Number(term);
  }
  return null;
}
/** ある学年の「N回目」の授業が実際にあった代表日を求める（学年内のいずれかのクラスの実績日を使う） */
function getGradeRepDate(config, dateByClassNumber, grade, num) {
  const classesInGrade = config.classes.filter((c) => c.grade === grade).map((c) => c.name);
  for (const cn of classesInGrade) {
    if (dateByClassNumber[cn] && dateByClassNumber[cn][num]) return dateByClassNumber[cn][num];
  }
  return null;
}

/* ============================================================
   状態
============================================================ */
const state = {
  loading: true,
  user: null,
  tab: "weekly",
  config: defaultConfig(),
  weeks: {},
  objectives: {},
  jointObjectives: {},
  currentMonday: toMonday(toDateStr(new Date())),
  monthView: toDateStr(new Date()).slice(0, 7),
  objGrade: null,
  objMode: "normal",
  objTerm: "all",
  ui: { newGrade: "1年", newSuffix: "", settingsDay: "mon", weekDay: "mon" },
  loginError: "",
  loginBusy: false,
};
let dirty = false;
let lastSavedAt = null;
let saving = false;
let autosaveTimer = null;

function snapshotData() {
  return { version: 1, config: state.config, weeks: state.weeks, objectives: state.objectives, jointObjectives: state.jointObjectives };
}
function updateSaveStatusDom() {
  const el = document.getElementById("save-status-text");
  if (!el) return;
  let text;
  if (saving) text = "保存中…";
  else if (dirty) text = "未保存の変更があります";
  else if (lastSavedAt) text = `同期済み：${pad(lastSavedAt.getHours())}:${pad(lastSavedAt.getMinutes())}`;
  else text = "";
  el.textContent = text;
  el.classList.toggle("dirty", dirty && !saving);
}
async function doAutosave() {
  if (!state.user) return;
  saving = true;
  updateSaveStatusDom();
  try {
    await FirebaseService.saveUserData(state.user.uid, snapshotData());
    dirty = false;
    lastSavedAt = new Date();
  } catch (e) {
    console.error("Firestoreへの保存に失敗しました", e);
  } finally {
    saving = false;
    updateSaveStatusDom();
  }
}
function markDirty() {
  dirty = true;
  updateSaveStatusDom();
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(doAutosave, 800);
}
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
function ensureWeek() {
  if (!state.weeks[state.currentMonday]) {
    state.weeks[state.currentMonday] = buildEmptyWeek();
    markDirty();
  }
}

/* ============================================================
   認証・データ読み込み
============================================================ */
async function startAppForUser(user) {
  state.user = user;
  state.loading = true;
  render();
  let data = null;
  try {
    data = await FirebaseService.loadUserData(user.uid);
  } catch (e) {
    console.error("Firestoreからの読み込みに失敗しました", e);
  }
  if (data) {
    const { next: migratedClasses } = migrateClasses(data.config?.classes || []);
    state.config = {
      classes: migratedClasses,
      timetable: data.config?.timetable || emptyTimetable(),
      gradeRequiredHours: migrateGradeRequiredHours(migratedClasses, data.config?.gradeRequiredHours),
    };
    state.weeks = data.weeks || {};
    const { next: migratedObjectives } = migrateObjectivesToGrades(state.config, data.objectives || {});
    state.objectives = migratedObjectives;
    state.jointObjectives = data.jointObjectives || {};
  } else {
    state.config = defaultConfig();
    state.weeks = {};
    state.objectives = {};
    state.jointObjectives = {};
  }
  if (state.config.classes[0]) state.objGrade = state.config.classes[0].grade;
  state.loading = false;
  ensureWeek();
  render();
}

async function init() {
  FirebaseService.onAuthChange(async (user) => {
    if (user) {
      await startAppForUser(user);
    } else {
      state.user = null;
      state.loading = false;
      render();
    }
  });
}

/* ============================================================
   レンダリング
============================================================ */
let didPlayEntrance = false;
function render() {
  const app = document.getElementById("app");
  if (state.loading) {
    app.innerHTML = `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;">読み込み中…</div>`;
    return;
  }
  if (!state.user) {
    didPlayEntrance = false;
    app.innerHTML = renderLoginScreen();
    return;
  }
  ensureWeek();
  const entranceClass = didPlayEntrance ? "" : "app-enter";
  didPlayEntrance = true;
  app.innerHTML = `<div class="${entranceClass}">${renderHeader()}<main>${renderTabContent()}</main></div>`;
  updateSaveStatusDom();
  if (state.tab === "print") adjustPrintScale();
}
function adjustPrintScale() {
  const page = document.querySelector(".print-page");
  const wrapper = document.getElementById("print-wrapper");
  if (!page || !wrapper) return;
  const pxWidth = 793.7; // 210mm at 96dpi
  const pxHeight = 1122.5; // 297mm at 96dpi
  const available = wrapper.clientWidth;
  const scale = Math.min(1, available / pxWidth);
  page.style.transformOrigin = "top left";
  page.style.transform = `scale(${scale})`;
  wrapper.style.height = `${pxHeight * scale}px`;
}

function renderLoginScreen() {
  const err = state.loginError ? `<div style="color:var(--warn);font-size:12.5px;margin-bottom:14px;">${esc(state.loginError)}</div>` : "";
  const busy = state.loginBusy;
  return `
  <div class="login-screen">
    <div class="login-card">
      <span style="font-size:34px;color:var(--accent);">♪</span>
      <h1>音楽科 週案帳</h1>
      <div class="sub">Weekly Music Lesson Planner</div>
      ${err}
      <form data-role="pin-form" style="display:flex;flex-direction:column;gap:10px;">
        <input
          type="password"
          inputmode="numeric"
          autocomplete="current-password"
          class="input"
          style="text-align:center;letter-spacing:4px;font-size:18px;"
          placeholder="PINコード"
          id="pin-input"
          ${busy ? "disabled" : ""}
        />
        <button type="submit" class="btn btn-primary" style="justify-content:center;" ${busy ? "disabled" : ""}>
          ${busy ? "確認中…" : "ログイン"}
        </button>
      </form>
      <button data-role="pin-forgot" style="background:none;border:none;color:var(--muted2);font-size:12px;margin-top:16px;text-decoration:underline;">
        PINを忘れた場合はこちら
      </button>
      <div class="login-note">
        初めてお使いの場合は、ここで決めたPINがそのまま登録されます。<br/>
        次回からは同じPINでログインしてください（6文字以上の数字や合言葉がおすすめです）。<br/>
        このデータは他の人からは見えません。PC・スマホ・タブレットのどこからでも同じ内容を編集できます。
      </div>
    </div>
  </div>`;
}

function renderHeader() {
  const tabs = [
    { key: "settings", label: "設定" },
    { key: "weekly", label: "週案" },
    { key: "objectives", label: "めあて一覧" },
    { key: "hours", label: "時数" },
    { key: "month", label: "月間予定" },
    { key: "print", label: "印刷プレビュー" },
  ];

  return `
  <header class="no-print">
    <div class="header-inner">
      <div class="brand">
        <span style="font-size:26px;color:var(--accent);">♪</span>
        <div>
          <h1>音楽科 週案帳</h1>
          <div class="sub">Weekly Music Lesson Planner</div>
        </div>
      </div>
      <div class="user-bar">
        <span class="save-status" id="save-status-text"></span>
        <button class="btn btn-outline" data-role="signout">🔒 ログアウト</button>
      </div>
    </div>
    <nav class="tabs">
      ${tabs.map((t) => `<button class="tab-btn ${state.tab === t.key ? "active" : ""}" data-role="tab" data-tab="${t.key}">${t.label}</button>`).join("")}
    </nav>
  </header>`;
}

function renderTabContent() {
  if (state.tab === "settings") return renderSettingsTab();
  if (state.tab === "weekly") return renderWeeklyTab();
  if (state.tab === "objectives") return renderObjectivesTab();
  if (state.tab === "hours") return renderHoursTab();
  if (state.tab === "month") return renderMonthTab();
  if (state.tab === "print") return renderPrintTab();
  return "";
}

/* ---------------- 設定タブ ---------------- */
function renderSettingsTab() {
  const cfg = state.config;
  const days = WEEKDAY_ONLY;
  const grouped = GRADES.map((g) => ({ grade: g, list: cfg.classes.filter((c) => c.grade === g) })).filter((g) => g.list.length > 0);

  const classesHtml = grouped
    .map(
      (g) => `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <span style="font-size:12px;font-weight:700;color:var(--accent);min-width:42px;">${esc(g.grade)}</span>
      <span style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--muted2);background:var(--paper-dark);border:1px solid var(--line);border-radius:8px;padding:4px 8px;">
        必要時数（学年共通）
        <input type="number" min="0" class="input" style="width:56px;padding:3px 5px;font-size:12px;" value="${cfg.gradeRequiredHours?.[g.grade] ?? ""}" data-role="grade-hours" data-grade="${esc(g.grade)}" />
      </span>
      ${g.list
        .map(
          (c) => `
        <span class="chip">
          ${esc(c.name)}
          <button data-role="remove-class" data-name="${esc(c.name)}">✕</button>
        </span>`
        )
        .join("")}
    </div>`
    )
    .join("");

  const timetableRows = ROWS.map((row) => {
    if (row.type === "break") {
      return `<tr class="break"><td class="row-label">${row.label}</td><td colspan="${days.length}">${row.label}</td></tr>`;
    }
    return `<tr><td class="row-label">${row.num}</td>${days.map(
      (d) => `<td>
        <select class="select" data-role="timetable-cell" data-day="${d.key}" data-period="${row.num}">
          <option value="">―</option>
          ${cfg.classes
            .map((c) => `<option value="${esc(c.name)}" ${cfg.timetable?.[d.key]?.[row.num] === c.name ? "selected" : ""}>${esc(c.name)}</option>`)
            .join("")}
        </select>
      </td>`
    ).join("")}</tr>`;
  }).join("");

  const timetableSection = isNarrow() ? renderTimetableMobile(cfg) : `
    <div style="overflow-x:auto;">
      <table class="grid" style="min-width:560px;">
        <thead><tr><th></th>${days.map((d) => `<th>${d.label}</th>`).join("")}</tr></thead>
        <tbody>${timetableRows}</tbody>
      </table>
    </div>`;

  return `
  <section class="card">
    <h2 class="section-title">担当クラスの設定</h2>
    <p class="hint">受け持っているクラスを、学年を選んでから登録してください。めあては学年ごとにまとめて管理されます（同じ学年の複数クラスで共通のめあてを使えます）。「必要時数（学年共通）」は、その学年で年間に指導すべき時数です。同じ学年のクラスはすべて同じ値が使われます。「時数」タブで残り時数・達成率が自動計算されます（空欄のままでも構いません）。</p>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px;">
      ${classesHtml || `<span style="color:var(--muted2);font-size:13px;">まだクラスが登録されていません</span>`}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      <select id="new-grade" class="select" style="width:auto;min-width:90px;">
        ${GRADES.map((g) => `<option value="${g}" ${state.ui.newGrade === g ? "selected" : ""}>${g}</option>`).join("")}
      </select>
      <input id="new-suffix" class="input" type="number" min="1" style="min-width:70px;width:80px;" placeholder="例：2" value="${esc(state.ui.newSuffix)}" data-role="new-suffix" />
      <span style="font-size:14px;color:var(--muted);">組</span>
      <button class="btn btn-primary" data-role="add-class">＋ 追加</button>
    </div>
  </section>

  <section class="card">
    <h2 class="section-title">固定時間割の設定</h2>
    <p class="hint">各曜日・各時間に担当するクラスを選択してください。ここで設定した内容は自動では反映されず、「週案」タブの「⟲ 時間割を反映」ボタンを押したときだけ、その週に反映されます。土曜授業がある週は、「週案」タブでその週ごとにチェックを入れて追加できます。</p>
    ${timetableSection}
  </section>`;
}
function renderTimetableMobile(cfg) {
  const days = WEEKDAY_ONLY;
  const day = days.find((d) => d.key === state.ui.settingsDay) ? state.ui.settingsDay : "mon";
  const rowsHtml = ROWS.map((row) => {
    if (row.type === "break") {
      return `<div class="mobile-period-card break-card">${row.label}</div>`;
    }
    return `
    <div class="mobile-period-card">
      <div class="mobile-period-label">${row.num}時間目</div>
      <select class="select" data-role="timetable-cell" data-day="${day}" data-period="${row.num}">
        <option value="">―</option>
        ${cfg.classes.map((c) => `<option value="${esc(c.name)}" ${cfg.timetable?.[day]?.[row.num] === c.name ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
      </select>
    </div>`;
  }).join("");
  return `
    <div class="day-tabs">
      ${days.map((d) => `<button class="day-tab-btn ${d.key === day ? "active" : ""}" data-role="settings-day" data-day="${d.key}">${d.label}</button>`).join("")}
    </div>
    ${rowsHtml}`;
}

/* ---------------- 週案タブ ---------------- */
function classAndGradeWideOptions(cfg, selectedValue) {
  const gradesPresent = GRADES.filter((g) => cfg.classes.some((c) => c.grade === g));
  const individual = cfg.classes
    .map((c) => `<option value="cls:${esc(c.name)}" ${selectedValue === `cls:${c.name}` ? "selected" : ""}>${esc(c.name)}</option>`)
    .join("");
  const gradeWide = gradesPresent
    .map((g) => `<option value="grade:${esc(g)}" ${selectedValue === `grade:${g}` ? "selected" : ""}>🎵 ${esc(g)}合同（全クラス）</option>`)
    .join("");
  return `<option value="">―</option>${individual}${gradeWide ? `<optgroup label="学年合同">${gradeWide}</optgroup>` : ""}`;
}
function renderSlotEditorInner(cfg, week, numbers, jointNumbers, dayKey, periodNum) {
  const slot = week.lessons?.[dayKey]?.[periodNum];
  const isJoint = !!slot?.gradeWide;
  const num = isJoint
    ? jointNumbers?.[state.currentMonday]?.[dayKey]?.[periodNum]
    : numbers?.[state.currentMonday]?.[dayKey]?.[periodNum];
  const grade = isJoint ? slot.gradeWide : slot?.class ? classGrade(cfg, slot.class) : null;
  const objStore = isJoint ? state.jointObjectives : state.objectives;
  const objText = grade ? objStore?.[grade]?.[num]?.text : "";
  const objPersp = grade ? objStore?.[grade]?.[num]?.perspective : "";
  const selectedValue = slot?.gradeWide ? `grade:${slot.gradeWide}` : slot?.class ? `cls:${slot.class}` : "";

  const classSelect = `
    <select class="select" style="margin-bottom:6px;font-weight:600;" data-role="slot-class" data-day="${dayKey}" data-period="${periodNum}">
      ${classAndGradeWideOptions(cfg, selectedValue)}
    </select>`;

  let detail = "";
  if (slot?.class || slot?.gradeWide) {
    const badgeLabel = num ? (isJoint ? `合${circled(num)}` : circled(num)) : "-";
    detail = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <span class="badge-circle ${slot.skip ? "skip" : ""} ${isJoint ? "joint" : ""}" title="${isJoint ? "学年合同の回数（個別クラスの回数とは別カウント）" : "授業回数"}">${badgeLabel}</span>
        <label style="font-size:11px;color:var(--muted2);display:flex;align-items:center;gap:4px;">
          <input type="checkbox" data-role="slot-skip" data-day="${dayKey}" data-period="${periodNum}" ${slot.skip ? "checked" : ""} /> 実施しない
        </label>
      </div>
      <textarea class="textarea" style="margin-bottom:6px;" rows="3" placeholder="授業内容" data-role="slot-content" data-day="${dayKey}" data-period="${periodNum}">${esc(slot.content || "")}</textarea>
      <div class="obj-preview ${objText ? "has-text" : ""}">
        ${objPersp ? `<span style="color:${PERSPECTIVE_COLOR[objPersp] || "#555"};font-weight:700;margin-right:4px;">【${objPersp}】</span>` : ""}
        ${esc(objText) || `めあて未設定（「めあて一覧」${isJoint ? "の学年合同タブ" : ""}で入力）`}
      </div>`;
  }
  return classSelect + detail;
}

function shortMD(dateStr) {
  const [, m, d] = dateStr.split("-");
  return `${Number(m)}/${Number(d)}`;
}
function renderWeeklyTab() {
  const cfg = state.config;
  const week = state.weeks[state.currentMonday] || buildEmptyWeek();
  const { numbers, jointNumbers } = computeLessonNumbers(state.weeks);

  const gridSection = isNarrow() ? renderWeeklyMobile(cfg, week, numbers, jointNumbers) : renderWeeklyDesktop(cfg, week, numbers, jointNumbers);

  const noClassNotice = cfg.classes.length === 0 ? `<div class="card" style="color:var(--muted2);font-size:14px;">「設定」タブでまず担当クラスと固定時間割を登録してください。</div>` : "";

  return `
  <div class="card" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
      <button class="nav-btn" data-role="week-nav" data-delta="-7">‹</button>
      <div style="text-align:center;min-width:180px;">
        <div style="font-family:'Shippori Mincho', serif;font-size:16px;font-weight:700;">${formatWeekRange(state.currentMonday, week)}</div>
        <input type="date" id="week-date-input" value="${state.currentMonday}" style="margin-top:6px;border:1px solid var(--line);border-radius:6px;padding:3px 8px;font-size:12px;color:#7A7263;" />
      </div>
      <button class="nav-btn" data-role="week-nav" data-delta="7">›</button>
      <button class="btn btn-outline" data-role="apply-timetable" title="固定時間割で空いているコマに授業を反映します（既に入力済みのコマは変更しません）">⟲ 時間割を反映</button>
    </div>
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted);white-space:nowrap;">
      <input type="checkbox" data-role="toggle-week-saturday" ${week.showSaturday ? "checked" : ""} /> この週は土曜授業がある
    </label>
  </div>

  ${noClassNotice}

  ${gridSection}

  <section class="two-col-responsive" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
    <div class="card">
      <h3 class="section-title" style="font-size:15px;">今週の目標</h3>
      <textarea class="textarea" rows="3" placeholder="今週、指導の中で意識したいことなど" data-role="week-field" data-field="goal">${esc(week.goal || "")}</textarea>
    </div>
    <div class="card">
      <h3 class="section-title" style="font-size:15px;">今週の振り返り</h3>
      <textarea class="textarea" rows="3" placeholder="授業の様子、成果と課題など" data-role="week-field" data-field="reflection">${esc(week.reflection || "")}</textarea>
    </div>
  </section>`;
}
function renderWeeklyDesktop(cfg, week, numbers, jointNumbers) {
  const days = visibleDays(week);
  const gridRows = ROWS.map((row) => {
    if (row.type === "break") {
      const cells = days.map(
        (d) => `<td style="vertical-align:top;">
          <input class="input" style="font-size:12px;padding:6px 8px;" placeholder="メモ" value="${esc(getBreakNote(week, d.key, row.label))}" data-role="break-note" data-day="${d.key}" data-label="${esc(row.label)}" />
        </td>`
      ).join("");
      return `<tr class="break"><td class="row-label">${row.label}</td>${cells}</tr>`;
    }
    const cells = days.map((d) => `<td style="vertical-align:top;min-width:160px;">${renderSlotEditorInner(cfg, week, numbers, jointNumbers, d.key, row.num)}</td>`).join("");
    return `<tr><td class="row-label">${row.num}</td>${cells}</tr>`;
  }).join("");
  const headerCells = days
    .map((d, i) => `<th>${d.label}<br/><span style="font-weight:400;font-size:10.5px;color:#9A8F7A;">${shortMD(addDays(state.currentMonday, i))}</span></th>`)
    .join("");
  return `
  <section class="card" style="overflow-x:auto;">
    <table class="grid" style="min-width:900px;">
      <thead><tr><th style="width:50px;"></th>${headerCells}</tr></thead>
      <tbody>${gridRows}</tbody>
    </table>
  </section>`;
}
function renderWeeklyMobile(cfg, week, numbers, jointNumbers) {
  const days = visibleDays(week);
  const day = days.find((d) => d.key === state.ui.weekDay) ? state.ui.weekDay : "mon";
  const rowsHtml = ROWS.map((row) => {
    if (row.type === "break") {
      return `
      <div class="mobile-period-card break-card" style="text-align:left;">
        <div class="mobile-period-label">${row.label}</div>
        <input class="input" style="font-size:12px;padding:6px 8px;" placeholder="メモ" value="${esc(getBreakNote(week, day, row.label))}" data-role="break-note" data-day="${day}" data-label="${esc(row.label)}" />
      </div>`;
    }
    return `
    <div class="mobile-period-card">
      <div class="mobile-period-label">${row.num}時間目</div>
      ${renderSlotEditorInner(cfg, week, numbers, jointNumbers, day, row.num)}
    </div>`;
  }).join("");
  const dayTabs = days
    .map((d, i) => `<button class="day-tab-btn ${d.key === day ? "active" : ""}" data-role="week-day" data-day="${d.key}">${d.label}<br/><span style="font-size:9.5px;opacity:.8;">${shortMD(addDays(state.currentMonday, i))}</span></button>`)
    .join("");
  return `
  <section class="card">
    <div class="day-tabs">
      ${dayTabs}
    </div>
    ${rowsHtml}
  </section>`;
}

/* ---------------- めあて一覧タブ ---------------- */
function getGradeRows(store, grade, count) {
  const arr = [];
  for (let n = 1; n <= count; n++) {
    const v = store?.[grade]?.[n];
    arr.push(v ? { perspective: v.perspective || "", text: v.text || "" } : { perspective: "", text: "" });
  }
  return arr;
}
function setGradeRows(store, grade, arr) {
  const meta = store[grade]?._meta;
  const obj = {};
  arr.forEach((item, idx) => {
    if (item && (item.perspective || item.text)) obj[idx + 1] = item;
  });
  if (meta) obj._meta = meta;
  store[grade] = obj;
}
function insertObjectiveAt(store, grade, atNum, currentMax) {
  const arr = getGradeRows(store, grade, currentMax);
  arr.splice(atNum - 1, 0, { perspective: "", text: "" });
  setGradeRows(store, grade, arr);
  const meta = store[grade]._meta || { extra: 0 };
  store[grade]._meta = { ...meta, extra: (meta.extra || 0) + 1 };
}
function deleteObjectiveAt(store, grade, atNum, currentMax) {
  const arr = getGradeRows(store, grade, currentMax);
  arr.splice(atNum - 1, 1);
  setGradeRows(store, grade, arr);
}

function renderObjectivesTab() {
  const cfg = state.config;
  if (cfg.classes.length === 0) {
    return `<div class="card" style="color:var(--muted2);">「設定」タブで担当クラスを登録すると、ここにめあてを入力できます。</div>`;
  }
  const { maxByClass, maxJointByGrade, dateByClassNumber, dateByGradeJointNumber } = computeLessonNumbers(state.weeks);
  const maxByGrade = computeMaxByGrade(cfg, maxByClass);
  const gradesPresent = GRADES.filter((g) => cfg.classes.some((c) => c.grade === g));
  const grade = state.objGrade && gradesPresent.includes(state.objGrade) ? state.objGrade : gradesPresent[0];
  const classesInGrade = cfg.classes.filter((c) => c.grade === grade).map((c) => c.name);

  const mode = state.objMode === "joint" ? "joint" : "normal";
  const store = mode === "joint" ? state.jointObjectives : state.objectives;
  const maxForGrade = mode === "joint" ? maxJointByGrade[grade] || 0 : maxByGrade[grade] || 0;
  const term = state.objTerm || "all"; // "all" | "1" | "2" | "3"

  const known = Object.keys(store?.[grade] || {}).filter((k) => k !== "_meta").map(Number);
  const extra = store?.[grade]?._meta?.extra || 0;
  const maxNum = Math.max(maxForGrade, known.length ? Math.max(...known) : 0);
  const displayCount = maxNum + 3 + extra;
  const allNums = Array.from({ length: displayCount }, (_, i) => i + 1);

  function dateForNum(num) {
    return mode === "joint" ? dateByGradeJointNumber[grade]?.[num] : getGradeRepDate(cfg, dateByClassNumber, grade, num);
  }
  // 学期で絞り込む。ただし「未実施（今後の回）」は日付が未定なので、どの学期を見ていても常に表示する
  const rows = term === "all" ? allNums : allNums.filter((num) => num > maxForGrade || termOfDate(dateForNum(num)) === Number(term));

  const rowsHtml = rows
    .map((num) => {
      const o = store?.[grade]?.[num] || { perspective: "", text: "" };
      const isPlanned = num <= maxForGrade;
      const numLabel = mode === "joint" ? `合${circled(num)}` : circled(num);
      return `
      <div class="obj-row ${isPlanned ? "" : "future"}">
        <div class="obj-num ${isPlanned ? "" : "future"}">${numLabel}</div>
        <div style="display:flex;flex-direction:column;gap:6px;flex:1;">
          <select class="select" style="max-width:280px;" data-role="obj-perspective" data-store="${mode}" data-grade="${esc(grade)}" data-num="${num}">
            <option value="">評価観点を選択</option>
            ${PERSPECTIVES.map((p) => `<option value="${p.key}" ${o.perspective === p.key ? "selected" : ""}>${p.label}</option>`).join("")}
          </select>
          <input class="input" placeholder="具体的なめあてを入力（例：拍の流れにのって強弱の変化を感じ取りながら演奏する）" value="${esc(o.text || "")}" data-role="obj-text" data-store="${mode}" data-grade="${esc(grade)}" data-num="${num}" />
        </div>
        ${!isPlanned ? `<span style="font-size:11px;color:var(--muted2);white-space:nowrap;margin-top:8px;">未実施</span>` : ""}
        <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;">
          <button class="btn btn-muted" style="padding:4px 8px;font-size:11px;" title="この位置に1回分を挿入し、以降を繰り下げる" data-role="obj-insert" data-store="${mode}" data-grade="${esc(grade)}" data-num="${num}" data-max="${displayCount}">➕挿入</button>
          <button class="btn btn-muted" style="padding:4px 8px;font-size:11px;color:var(--warn);" title="この回を削除し、以降を繰り上げる" data-role="obj-delete" data-store="${mode}" data-grade="${esc(grade)}" data-num="${num}" data-max="${displayCount}">🗑削除</button>
        </div>
      </div>`;
    })
    .join("");

  const modeHint = mode === "joint"
    ? `ここは<strong>学年合同の授業</strong>専用のめあてです。週案タブでクラスの代わりに「🎵 ${esc(grade)}合同」を選んだコマにだけ表示されます。通常の各クラスの回数・めあてとは別にカウントされます。各回の「➕挿入」でその位置に1回分を追加し、以降を繰り下げられます。「🗑削除」でその回を消し、以降を繰り上げられます（週案側の実際の授業予定は変わりません）。`
    : `ここで入力しためあては、同じ学年に属するすべてのクラス（${esc(classesInGrade.join("、"))}）の週案に、回数が一致するコマへ自動的に表示されます。回数は週案に入力された授業から自動的に連動します。児童の様子に合わせて内容を差し替えたいときは、各回の「➕挿入」でその位置に1回分を追加して以降を繰り下げたり、「🗑削除」でその回を消して以降を繰り上げたりできます（週案側の実際の授業予定・日付は変わりません。あくまで「何回目に何を教えるか」の並びだけを調整します）。`;

  return `
  <div class="card" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
    <span style="font-size:14px;font-weight:600;">種類：</span>
    <div style="display:flex;gap:8px;">
      <button class="pill-btn ${mode === "normal" ? "active" : ""}" data-role="obj-mode" data-mode="normal">通常のめあて</button>
      <button class="pill-btn ${mode === "joint" ? "active" : ""}" data-role="obj-mode" data-mode="joint">学年合同のめあて</button>
    </div>
  </div>

  <div class="card" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
    <span style="font-size:14px;font-weight:600;">学年：</span>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      ${gradesPresent.map((g) => `<button class="pill-btn ${g === grade ? "active" : ""}" data-role="obj-grade" data-grade="${g}">${g}</button>`).join("")}
    </div>
  </div>

  <div class="card" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
    <span style="font-size:14px;font-weight:600;">学期：</span>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      ${["all", "1", "2", "3"].map((t) => `<button class="pill-btn ${term === t ? "active" : ""}" data-role="obj-term" data-term="${t}">${t === "all" ? "すべて" : `${t}学期`}</button>`).join("")}
    </div>
  </div>

  <section class="card">
    <p class="hint">${modeHint}${term !== "all" ? " 学期で絞り込んで表示していますが、丸数字の回数は学期ごとではなく年間の通し番号のままです。今後の回（未実施）はどの学期を見ていても表示されます。" : ""}</p>
    <div style="display:flex;flex-direction:column;gap:10px;">${rowsHtml}</div>
    <div style="display:flex;justify-content:center;gap:10px;margin-top:14px;">
      <button class="btn btn-outline" data-role="obj-extra" data-store="${mode}" data-grade="${esc(grade)}" data-delta="1">＋ 回を追加</button>
      ${extra > 0 ? `<button class="btn btn-muted" data-role="obj-extra" data-store="${mode}" data-grade="${esc(grade)}" data-delta="-1">− 追加分を1つ減らす</button>` : ""}
    </div>
  </section>`;
}

/* ---------------- 時数タブ ---------------- */
function renderHoursTab() {
  const cfg = state.config;
  if (cfg.classes.length === 0) {
    return `<div class="card" style="color:var(--muted2);">「設定」タブで担当クラスを登録すると、時数を確認できます。</div>`;
  }
  const { result, months } = computeHoursByClassAndMonth(state.weeks, state.config);
  if (months.length === 0) {
    return `<div class="card" style="color:var(--muted2);">まだ授業の記録がありません。週案タブで授業を入力すると、ここに時数が自動集計されます。</div>`;
  }
  const grouped = GRADES.map((g) => ({ grade: g, list: cfg.classes.filter((c) => c.grade === g) })).filter((g) => g.list.length > 0);

  const monthTotals = {};
  months.forEach((m) => { monthTotals[m] = 0; });
  let grandTotal = 0;

  // そのクラス自身の月別記録（個別授業＋学年合同の両方を含む）を合計する。
  // 他のクラスの回数に合わせて調整されることは一切なく、純粋にそのクラス自身の実施回数だけを積み上げる。
  function classTotal(className) {
    return Object.values(result[className] || {}).reduce((a, b) => a + b, 0);
  }

  function progressInfo(c) {
    const total = classTotal(c.name);
    const required = cfg.gradeRequiredHours?.[c.grade];
    if (required == null || required === "") return { remaining: null, percent: null };
    const remaining = required - total;
    const percent = required > 0 ? Math.round((total / required) * 1000) / 10 : null;
    return { remaining, percent };
  }

  const bodyRows = grouped
    .map((g) => {
      const gradeHeader = `<tr><td colspan="${months.length + 5}" style="background:var(--paper-dark);font-weight:700;font-size:12px;color:var(--accent);padding:5px 10px;">${esc(g.grade)}</td></tr>`;
      const gradeRows = g.list
        .map((c) => {
          const rowTotal = classTotal(c.name);
          grandTotal += rowTotal;
          const cells = months
            .map((m) => {
              const v = result[c.name]?.[m] || 0;
              monthTotals[m] += v;
              return `<td style="text-align:center;">${v || ""}</td>`;
            })
            .join("");
          const { remaining, percent } = progressInfo(c);
          const remainingCell = remaining == null ? "－" : remaining > 0 ? `残り${remaining}` : `${remaining === 0 ? "達成" : `+${-remaining}超過`}`;
          const percentColor = percent == null ? "var(--muted2)" : percent >= 100 ? "var(--accent)" : percent >= 70 ? "#8A5A2B" : "var(--warn)";
          return `<tr>
            <td style="padding:6px 10px;">${esc(c.name)}</td>
            ${cells}
            <td style="text-align:center;font-weight:700;">${rowTotal}</td>
            <td style="text-align:center;color:var(--muted2);">${cfg.gradeRequiredHours?.[c.grade] ?? "－"}</td>
            <td style="text-align:center;">${remainingCell}</td>
            <td style="text-align:center;font-weight:700;color:${percentColor};">${percent == null ? "－" : `${percent}%`}</td>
          </tr>`;
        })
        .join("");
      return gradeHeader + gradeRows;
    })
    .join("");

  const totalRow = `<tr style="background:var(--paper-dark);font-weight:700;"><td style="padding:6px 10px;">合計</td>${months
    .map((m) => `<td style="text-align:center;">${monthTotals[m]}</td>`)
    .join("")}<td style="text-align:center;">${grandTotal}</td><td></td><td></td><td></td></tr>`;

  const monthHeaders = months
    .map((m) => {
      const [y, mm] = m.split("-");
      return `<th>${y}年${Number(mm)}月</th>`;
    })
    .join("");

  if (isNarrow()) {
    const cardsHtml = grouped
      .map(
        (g) => `
      <div style="font-size:12px;font-weight:700;color:var(--accent);margin:10px 0 6px;">${esc(g.grade)}</div>
      ${g.list
        .map((c) => {
          const rowTotal = classTotal(c.name);
          const { remaining, percent } = progressInfo(c);
          const monthList = months
            .map((m) => {
              const v = result[c.name]?.[m] || 0;
              const [y, mm] = m.split("-");
              return `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px dashed var(--line);font-size:12.5px;"><span>${y}年${Number(mm)}月</span><span>${v || 0}回</span></div>`;
            })
            .join("");
          const percentColor = percent == null ? "var(--muted2)" : percent >= 100 ? "var(--accent)" : percent >= 70 ? "#8A5A2B" : "var(--warn)";
          return `
          <div class="mobile-period-card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <span style="font-weight:700;">${esc(c.name)}</span>
              <span style="font-weight:700;color:var(--accent);">総計 ${rowTotal}回</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px;">
              <span>必要時数：${cfg.gradeRequiredHours?.[c.grade] ?? "－"}</span>
              <span>${remaining == null ? "" : remaining > 0 ? `残り${remaining}` : remaining === 0 ? "達成" : `+${-remaining}超過`}</span>
              <span style="font-weight:700;color:${percentColor};">${percent == null ? "" : `${percent}%`}</span>
            </div>
            ${monthList}
          </div>`;
        })
        .join("")}`
      )
      .join("");
    const monthTotalList = months
      .map((m) => {
        const [y, mm] = m.split("-");
        return `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px dashed var(--line);font-size:12.5px;"><span>${y}年${Number(mm)}月</span><span>${monthTotals[m]}回</span></div>`;
      })
      .join("");
    return `
    <section class="card">
      <h2 class="section-title">時数集計</h2>
      <p class="hint">週案に入力された授業（「実施しない」にしたものは除く）をもとに、クラスごと・月ごとの実施時数を自動で集計します。必要時数は「設定」タブで登録できます。</p>
      ${cardsHtml}
      <div style="font-size:12px;font-weight:700;color:var(--accent);margin:10px 0 6px;">全クラス合計</div>
      <div class="mobile-period-card">
        <div style="font-weight:700;color:var(--accent);margin-bottom:6px;">総計 ${grandTotal}回</div>
        ${monthTotalList}
      </div>
    </section>`;
  }

  return `
  <section class="card" style="overflow-x:auto;">
    <h2 class="section-title">時数集計</h2>
    <p class="hint">週案に入力された授業（「実施しない」にしたものは除く）をもとに、クラスごと・月ごとの実施時数を自動で集計します。必要時数は「設定」タブで登録できます。</p>
    <table class="grid" style="min-width:${420 + months.length * 70}px;">
      <thead><tr><th style="text-align:left;">クラス</th>${monthHeaders}<th>総計</th><th>必要時数</th><th>残り</th><th>達成率</th></tr></thead>
      <tbody>${bodyRows}${totalRow}</tbody>
    </table>
  </section>`;
}

/* ---------------- 印刷プレビュー タブ（A4縦・行の高さ均一） ---------------- */
/* ---------------- 月間予定タブ ---------------- */
function renderMonthTab() {
  const cfg = state.config;
  if (cfg.classes.length === 0) {
    return `<div class="card" style="color:var(--muted2);">「設定」タブでまず担当クラスを登録してください。</div>`;
  }
  const ym = state.monthView;
  const [y, m] = ym.split("-");
  const lastDay = daysInMonth(ym);
  const dayNums = Array.from({ length: lastDay }, (_, i) => i + 1);

  const headerCells = PERIOD_NUMS.map((p) => `<th>${p}</th>`).join("");

  const bodyRows = dayNums
    .map((d) => {
      const dateStr = `${ym}-${pad(d)}`;
      const dt = new Date(dateStr);
      const jsDay = dt.getDay();
      const kanji = WEEKDAY_KANJI[jsDay];
      const rowCls = jsDay === 0 ? "month-sun" : jsDay === 6 ? "month-sat" : "";
      const cells = PERIOD_NUMS.map((p) => {
        const slot = lessonAtDate(dateStr, p);
        if (!slot || (!slot.class && !slot.gradeWide)) return `<td class="${rowCls}"></td>`;
        const label = slot.gradeWide ? `${slot.gradeWide}合同` : slot.class;
        return `<td class="${rowCls}" style="font-weight:600;${slot.skip ? "color:var(--muted2);text-decoration:line-through;" : ""}">${esc(label)}</td>`;
      }).join("");
      return `<tr><td class="row-label ${rowCls}">${d}<span style="font-weight:400;font-size:9px;margin-left:2px;">(${kanji})</span></td>${cells}</tr>`;
    })
    .join("");

  return `
  <div class="card" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
    <button class="nav-btn" data-role="month-nav" data-delta="-1">‹</button>
    <span style="font-family:'Shippori Mincho', serif;font-size:17px;font-weight:700;">${y}年${Number(m)}月</span>
    <button class="nav-btn" data-role="month-nav" data-delta="1">›</button>
    <span style="font-size:12px;color:var(--muted2);">土曜日は「週案」タブでその週の「土曜授業がある」にチェックが入っている場合のみ表示されます。</span>
  </div>

  <section class="card" style="overflow-x:auto;">
    <table class="grid month-grid">
      <thead><tr><th style="width:56px;"></th>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </section>`;
}


/* ---------------- 印刷プレビュー タブ（A4縦・行の高さ均一） ---------------- */
function renderPrintTab() {
  const cfg = state.config;
  const week = state.weeks[state.currentMonday] || buildEmptyWeek();
  const days = visibleDays(week);
  const { numbers, jointNumbers } = computeLessonNumbers(state.weeks);

  const bodyRows = ROWS.map((row) => {
    if (row.type === "break") {
      const cells = days.map((d) => {
        const note = getBreakNote(week, d.key, row.label);
        return `<td class="print-break-cell">${note ? `<div class="clamp2 print-break-note">${esc(note)}</div>` : ""}</td>`;
      }).join("");
      return `<tr><td class="print-break-cell print-row-label">${esc(row.label)}</td>${cells}</tr>`;
    }
    const p = row.num;
    const cells = days.map((d) => {
      const slot = week.lessons?.[d.key]?.[p];
      if (!slot?.class && !slot?.gradeWide) return `<td class="print-period-cell"></td>`;
      const isJoint = !!slot.gradeWide;
      const num = isJoint ? jointNumbers?.[state.currentMonday]?.[d.key]?.[p] : numbers?.[state.currentMonday]?.[d.key]?.[p];
      const grade = isJoint ? slot.gradeWide : classGrade(cfg, slot.class);
      const displayName = isJoint ? `${slot.gradeWide}合同` : slot.class;
      const objStore = isJoint ? state.jointObjectives : state.objectives;
      const objText = objStore?.[grade]?.[num]?.text || "";
      const objPersp = objStore?.[grade]?.[num]?.perspective || "";
      const numLabel = num ? (isJoint ? `合${num}` : `${num}`) : "";
      return `<td class="print-period-cell">
        <div class="print-lesson-line1">${esc(displayName)}　音楽${slot.skip ? `<span class="print-badge skip">実施なし</span>` : ""}</div>
        <div class="clamp2 print-lesson-line2">${esc(slot.content)}${numLabel ? ` (${numLabel})` : ""}</div>
        ${objText ? `<div class="clamp2 print-lesson-line3" style="color:${PERSPECTIVE_COLOR[objPersp] || "#333"};">${objPersp ? `${objPersp}　` : ""}${esc(objText)}</div>` : ""}
      </td>`;
    }).join("");
    return `<tr><td class="print-period-cell print-row-label">${p}</td>${cells}</tr>`;
  }).join("");

  const combinedReflection = [week.goal, week.reflection].filter((t) => t && t.trim()).join("\n");

  return `
  <div class="print-toolbar no-print card">
    <div style="display:flex;align-items:center;gap:10px;">
      <button class="nav-btn" data-role="print-nav" data-delta="-7">‹</button>
      <span style="font-weight:700;">${formatWeekRange(state.currentMonday, week)}</span>
      <button class="nav-btn" data-role="print-nav" data-delta="7">›</button>
    </div>
    <div style="font-size:12.5px;color:var(--muted);line-height:1.6;">
      「印刷 / PDF出力」を押すと印刷ダイアログが開きます。送信先で <strong>PDFに保存</strong> を選ぶとPDFとして保存できます。<br/>
      うまく開かない場合は、キーボードの <strong>Ctrl+P</strong>（Macは<strong>⌘+P</strong>）をお使いください。
    </div>
    <button class="btn btn-primary" data-role="do-print">🖶 印刷 / PDF出力</button>
  </div>

  <div class="print-page-wrapper" id="print-wrapper">
  <div class="print-page">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2mm;">
      <div style="font-family:'Shippori Mincho', serif;font-size:15px;font-weight:700;">音楽科　週案（予定・めあて）</div>
      <div style="display:flex;gap:3mm;">
        ${["校長印", "副校長印", "担当印"]
          .map((label) => `<div style="display:flex;flex-direction:column;align-items:center;gap:0.8mm;"><div class="print-hanko-box"></div><span style="font-size:8px;">${label}</span></div>`)
          .join("")}
      </div>
    </div>
    <div style="text-align:center;font-size:11px;margin-bottom:2mm;">${formatWeekRangeShort(state.currentMonday)}</div>

    <table>
      <colgroup><col style="width:6%;" />${days.map(() => `<col style="width:${94 / days.length}%;" />`).join("")}</colgroup>
      <thead><tr><th class="print-th"></th>${days.map((d, i) => `<th class="print-th">${formatDayHeader(state.currentMonday, i)}</th>`).join("")}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-top:4mm;">
      <div class="print-goal-box">
        <div style="font-size:9px;font-weight:700;margin-bottom:1mm;">振り返り・目標</div>
        <div style="font-size:9px;white-space:pre-wrap;min-height:40mm;">${esc(combinedReflection)}</div>
      </div>
      <div class="print-goal-box">
        <div style="font-size:9px;font-weight:700;margin-bottom:1mm;">管理職からのコメント</div>
        <div style="font-size:9px;white-space:pre-wrap;min-height:40mm;"></div>
      </div>
    </div>
  </div>
  </div>`;
}

/* ============================================================
   イベント処理（イベント委任）
============================================================ */
function addClass() {
  const grade = state.ui.newGrade || "1年";
  const suffix = (state.ui.newSuffix || "").trim();
  if (!suffix) return;
  const name = `${grade}${suffix}組`;
  if (state.config.classes.some((c) => c.name === name)) return;
  state.config.classes.push({ name, grade, suffix });
  state.ui.newSuffix = "";
  markDirty();
}
function applyTimetableToWeek() {
  const w = state.weeks[state.currentMonday] || buildEmptyWeek();
  const lessons = {};
  ALL_DAYS.forEach((d) => {
    lessons[d.key] = { ...w.lessons[d.key] };
    PERIOD_NUMS.forEach((p) => {
      const cls = state.config.timetable?.[d.key]?.[p] || null;
      const existing = lessons[d.key][p];
      if (cls && !existing) lessons[d.key][p] = { class: cls, gradeWide: null, content: "", skip: false, skipReason: "" };
    });
  });
  state.weeks[state.currentMonday] = { ...w, lessons };
  markDirty();
}

document.getElementById("app").addEventListener("click", (e) => {
  const el = e.target.closest("[data-role]");
  if (!el) return;
  const role = el.dataset.role;
  if (role === "pin-forgot") {
    FirebaseService.sendPinResetEmail()
      .then(() => { alert("登録済みのメールアドレスに、PIN再設定用のメールを送信しました。"); })
      .catch((err) => { alert(`送信に失敗しました（${err.message}）`); });
  }
  else if (role === "signout") {
    FirebaseService.signOut();
  }
  else if (role === "tab") { state.tab = el.dataset.tab; render(); }
  else if (role === "week-nav" || role === "print-nav") {
    state.currentMonday = addDays(state.currentMonday, Number(el.dataset.delta));
    ensureWeek();
    render();
  }
  else if (role === "month-nav") {
    state.monthView = addMonths(state.monthView, Number(el.dataset.delta));
    render();
  }
  else if (role === "apply-timetable") { applyTimetableToWeek(); render(); }
  else if (role === "remove-class") {
    state.config.classes = state.config.classes.filter((c) => c.name !== el.dataset.name);
    markDirty();
    render();
  }
  else if (role === "add-class") { addClass(); render(); }
  else if (role === "obj-grade") { state.objGrade = el.dataset.grade; render(); }
  else if (role === "obj-mode") { state.objMode = el.dataset.mode; render(); }
  else if (role === "obj-term") { state.objTerm = el.dataset.term; render(); }
  else if (role === "obj-extra") {
    const grade = el.dataset.grade;
    const store = el.dataset.store === "joint" ? state.jointObjectives : state.objectives;
    const curMeta = store?.[grade]?._meta || { extra: 0 };
    const nextExtra = Math.max(0, (curMeta.extra || 0) + Number(el.dataset.delta));
    store[grade] = { ...(store[grade] || {}), _meta: { ...curMeta, extra: nextExtra } };
    markDirty();
    render();
  }
  else if (role === "obj-insert") {
    const grade = el.dataset.grade;
    const num = Number(el.dataset.num);
    const max = Number(el.dataset.max);
    const store = el.dataset.store === "joint" ? state.jointObjectives : state.objectives;
    store[grade] = store[grade] || {};
    insertObjectiveAt(store, grade, num, max);
    markDirty();
    render();
  }
  else if (role === "obj-delete") {
    const grade = el.dataset.grade;
    const num = Number(el.dataset.num);
    const max = Number(el.dataset.max);
    const store = el.dataset.store === "joint" ? state.jointObjectives : state.objectives;
    const current = store?.[grade]?.[num];
    const hasContent = current && (current.perspective || current.text);
    if (hasContent && !confirm(`第${num}回のめあてを削除すると、それ以降の回がひとつずつ繰り上がります。よろしいですか？`)) return;
    store[grade] = store[grade] || {};
    deleteObjectiveAt(store, grade, num, max);
    markDirty();
    render();
  }
  else if (role === "settings-day") { state.ui.settingsDay = el.dataset.day; render(); }
  else if (role === "week-day") { state.ui.weekDay = el.dataset.day; render(); }
  else if (role === "do-print") { window.print(); }
});

document.getElementById("app").addEventListener("change", (e) => {
  const el = e.target.closest("[data-role]");
  if (el) {
    const role = el.dataset.role;
    if (role === "slot-class") {
      const day = el.dataset.day, period = el.dataset.period;
      const w = state.weeks[state.currentMonday];
      const existing = w.lessons[day][period] || { content: "", skip: false, skipReason: "" };
      if (!el.value) {
        w.lessons[day][period] = null;
      } else if (el.value.startsWith("grade:")) {
        w.lessons[day][period] = { ...existing, class: null, gradeWide: el.value.slice(6), skip: false };
      } else if (el.value.startsWith("cls:")) {
        w.lessons[day][period] = { ...existing, class: el.value.slice(4), gradeWide: null, skip: false };
      }
      markDirty();
      render();
      return;
    }
    if (role === "slot-skip") {
      const day = el.dataset.day, period = el.dataset.period;
      const w = state.weeks[state.currentMonday];
      w.lessons[day][period] = { ...w.lessons[day][period], skip: el.checked };
      markDirty();
      render();
      return;
    }
    if (role === "timetable-cell") {
      const day = el.dataset.day, period = el.dataset.period;
      state.config.timetable[day][period] = el.value || null;
      markDirty();
      render();
      return;
    }
    if (role === "toggle-week-saturday") {
      const w = state.weeks[state.currentMonday];
      w.showSaturday = el.checked;
      markDirty();
      render();
      return;
    }
    if (role === "grade-hours") {
      const grade = el.dataset.grade;
      const v = el.value === "" ? null : Math.max(0, Number(el.value));
      state.config.gradeRequiredHours = { ...(state.config.gradeRequiredHours || {}) };
      if (v == null) delete state.config.gradeRequiredHours[grade];
      else state.config.gradeRequiredHours[grade] = v;
      markDirty();
      return;
    }
    if (role === "obj-perspective") {
      const grade = el.dataset.grade;
      const num = el.dataset.num;
      const store = el.dataset.store === "joint" ? state.jointObjectives : state.objectives;
      const cur = store?.[grade]?.[num] || { perspective: "", text: "" };
      store[grade] = { ...(store[grade] || {}), [num]: { ...cur, perspective: el.value } };
      markDirty();
      return;
    }
  }
  if (e.target.id === "new-grade") { state.ui.newGrade = e.target.value; }
});

document.getElementById("app").addEventListener("input", (e) => {
  const el = e.target;
  if (el.id === "week-date-input") {
    state.currentMonday = toMonday(el.value);
    ensureWeek();
    render();
    return;
  }
  const role = el.dataset.role;
  if (role === "slot-content") {
    const day = el.dataset.day, period = el.dataset.period;
    const w = state.weeks[state.currentMonday];
    w.lessons[day][period] = { ...w.lessons[day][period], content: el.value };
    markDirty();
  }
  else if (role === "week-field") {
    const w = state.weeks[state.currentMonday];
    w[el.dataset.field] = el.value;
    markDirty();
  }
  else if (role === "break-note") {
    const day = el.dataset.day, label = el.dataset.label;
    const w = state.weeks[state.currentMonday];
    if (!w.breakNotes) w.breakNotes = emptyBreakNotes();
    if (!w.breakNotes[day]) w.breakNotes[day] = {};
    w.breakNotes[day][label] = el.value;
    markDirty();
  }
  else if (role === "obj-text") {
    const grade = el.dataset.grade;
    const num = el.dataset.num;
    const store = el.dataset.store === "joint" ? state.jointObjectives : state.objectives;
    const cur = store?.[grade]?.[num] || { perspective: "", text: "" };
    store[grade] = { ...(store[grade] || {}), [num]: { ...cur, text: el.value } };
    markDirty();
  }
  else if (role === "new-suffix") { state.ui.newSuffix = el.value; }
});

document.getElementById("app").addEventListener("keydown", (e) => {
  if (e.target.dataset && e.target.dataset.role === "new-suffix" && e.key === "Enter") {
    addClass();
    render();
  }
});

document.getElementById("app").addEventListener("submit", (e) => {
  const form = e.target.closest('[data-role="pin-form"]');
  if (!form) return;
  e.preventDefault();
  const input = document.getElementById("pin-input");
  const pin = input ? input.value : "";
  state.loginError = "";
  state.loginBusy = true;
  render();
  FirebaseService.signInWithPin(pin).then((result) => {
    state.loginBusy = false;
    if (!result.ok) {
      state.loginError = result.message;
      render();
    }
    // 成功時は onAuthChange が発火して自動的にアプリ画面へ切り替わる
  });
});

init();
