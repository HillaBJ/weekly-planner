// ===== הלו״ז השבועי שלי =====
// שלב 1: לוח שבועי + ניווט. שלב 2: בלוקים (יצירה/עריכה/מחיקה) ושמירה ב-localStorage.

// ---------- שמירת נתונים ----------

const STORAGE_KEY = "weeklyPlanner.v1";

// הגדרות ברירת מחדל (בשלב 5 הן יהיו ניתנות לשינוי)
const DEFAULT_SETTINGS = {
  dayStart: "07:00",
  dayEnd: "22:00",
  slotMinutes: 15,
  showWeekend: true, // שישי ושבת מוצגים כברירת מחדל
};

// המבנה המלא לפי האפיון. בשלב 2 משתמשים רק ב-blocks, השאר מוכן לשלבים הבאים.
function defaultData() {
  return { version: 1, blocks: [], series: [], savedBlocks: [], settings: { ...DEFAULT_SETTINGS } };
}

// טוען את הנתונים. אם הם פגומים — שומר עותק גיבוי (לא דורס!) ומתחיל מאפס.
function loadData() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw);
    const base = defaultData();
    return {
      ...base,
      ...parsed,
      blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
      series: Array.isArray(parsed.series) ? parsed.series : [],
      savedBlocks: Array.isArray(parsed.savedBlocks) ? parsed.savedBlocks : [],
      settings: { ...base.settings, ...parsed.settings },
    };
  } catch (err) {
    try { if (raw) localStorage.setItem(`${STORAGE_KEY}.corrupt.${Date.now()}`, raw); } catch (e) { /* ignore */ }
    return defaultData();
  }
}

// שומר את כל הנתונים. נקרא אחרי כל שינוי.
function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    alert("לא הצלחתי לשמור את הנתונים בדפדפן. ייתכן שהדפדפן חוסם שמירה.");
  }
}

const data = loadData();
const settings = data.settings;

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

// השבוע המוצג: התאריך של יום ראשון באותו שבוע
let weekStart = getSunday(new Date());

// ---------- פונקציות עזר לתאריכים ----------

// מחזיר את יום ראשון של השבוע שבו נמצא התאריך (בשעה 00:00)
function getSunday(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - d.getDay()); // getDay(): 0 = ראשון
  return d;
}

// תאריך + מספר ימים (מטפל נכון גם במעבר שעון קיץ/חורף)
function addDays(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

// "07:00" -> 420 (דקות מתחילת היום)
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function pad(n) { return String(n).padStart(2, "0"); }

// 420 -> "07:00"
function toHHMM(min) { return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`; }

// Date -> "2026-10-31"
function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// "2026-10-31" -> Date (שעה 00:00 מקומית)
function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

const monthDay = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric" });
const monthName = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long" });
const monthShort = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short" });

// ---------- בניית המסך ----------

function render() {
  const dayCount = settings.showWeekend ? 7 : 5;
  const today = new Date();

  // כמה עמודות יש ברשת
  document.documentElement.style.setProperty("--days", dayCount);

  // כותרת: טווח התאריכים של השבוע
  const lastDay = addDays(weekStart, dayCount - 1);
  // באותו חודש: "25–29 באוקטובר". בין חודשים: "30 באוק׳ – 3 בנוב׳"
  const sameMonth = weekStart.getMonth() === lastDay.getMonth();
  document.getElementById("week-range").textContent = sameMonth
    ? `${weekStart.getDate()}–${monthName.format(lastDay)}`
    : `${monthShort.format(weekStart)} – ${monthShort.format(lastDay)}`;

  renderDayHeaders(dayCount, today);
  renderBoard(dayCount, today);
}

// שורת הכותרות: שם היום + תאריך. היום הנוכחי מודגש.
function renderDayHeaders(dayCount, today) {
  const row = document.getElementById("day-headers");
  row.innerHTML = "<div></div>"; // תא ריק מעל עמודת השעות

  for (let i = 0; i < dayCount; i++) {
    const date = addDays(weekStart, i);
    const head = document.createElement("div");
    head.className = "day-head" + (isSameDay(date, today) ? " today" : "");
    head.innerHTML = `${DAY_NAMES[i]}<span class="date">${monthDay.format(date)}</span>`;
    row.appendChild(head);
  }
}

// לוח השעות: עמודת שעות + משבצות זמן לכל יום
function renderBoard(dayCount, today) {
  const board = document.getElementById("board");
  board.innerHTML = "";

  const startMin = toMinutes(settings.dayStart);
  const endMin = toMinutes(settings.dayEnd);
  const slotCount = Math.ceil((endMin - startMin) / settings.slotMinutes);

  // כל המשבצות הן בגובה אחד שנקבע ב-CSS; כאן רק מתאימים לגודל המשבצת שנבחר
  const slotScale = settings.slotMinutes / 15;
  board.style.setProperty("--slot-scale", slotScale);

  // עמודת השעות: שעה כתובה רק בשעות העגולות
  const timeCol = document.createElement("div");
  timeCol.className = "time-col";
  for (let i = 0; i < slotCount; i++) {
    const min = startMin + i * settings.slotMinutes;
    if (min % 60 === 0) {
      const label = document.createElement("div");
      label.className = "time-label";
      label.textContent = `${pad(min / 60)}:00`;
      label.style.top = `calc(${i} * var(--slot-h) * ${slotScale})`;
      timeCol.appendChild(label);
    }
  }
  timeCol.style.height = `calc(${slotCount} * var(--slot-h) * ${slotScale})`;
  board.appendChild(timeCol);

  // עמודה לכל יום
  for (let d = 0; d < dayCount; d++) {
    const date = addDays(weekStart, d);
    const col = document.createElement("div");
    col.className = "day-col" + (isSameDay(date, today) ? " today" : "");

    for (let i = 0; i < slotCount; i++) {
      const min = startMin + i * settings.slotMinutes;
      const slot = document.createElement("div");
      slot.className = "slot" + (min % 60 === 0 ? " hour" : "");
      slot.style.height = `calc(var(--slot-h) * ${slotScale})`;
      slot.dataset.date = dateKey(date);
      slot.dataset.time = toHHMM(min);
      col.appendChild(slot);
    }

    // הבלוקים של היום הזה
    for (const block of data.blocks) {
      if (block.date === dateKey(date)) {
        const el = createBlockElement(block, startMin, endMin);
        if (el) col.appendChild(el);
      }
    }
    board.appendChild(col);
  }
}

// ---------- בלוקים על הלוח ----------

// צבע הטקסט (שחור/לבן) לפי בהירות הרקע, כדי שתמיד יהיה קריא
function textColorFor(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#1f2328" : "#ffffff";
}

// בונה אלמנט של בלוק. גובה דקה אחת = --slot-h / 15 (נקבע ב-CSS).
// בלוק שחורג מטווח השעות נחתך; בלוק שכולו מחוץ לטווח לא מוצג (סימון ⬆/⬇ יגיע בשלב 5).
function createBlockElement(block, rangeStart, rangeEnd) {
  const start = Math.max(toMinutes(block.start), rangeStart);
  const end = Math.min(toMinutes(block.end), rangeEnd);
  if (end <= start) return null;

  const el = document.createElement("div");
  el.className = "block";
  el.dataset.id = block.id;
  el.style.top = `calc(var(--slot-h) / 15 * ${start - rangeStart})`;
  el.style.height = `calc(var(--slot-h) / 15 * ${end - start})`;
  el.style.background = block.color;
  el.style.color = textColorFor(block.color);

  const title = document.createElement("span");
  title.className = "b-title";
  title.textContent = block.title;
  el.appendChild(title);

  // פרטים נוספים: מוצגים רק בטלפון לרוחב / במחשב (נקבע ב-CSS)
  const time = document.createElement("span");
  time.className = "b-time";
  time.textContent = `${block.start}–${block.end}`;
  el.appendChild(time);

  if (block.note) {
    const note = document.createElement("span");
    note.className = "b-note";
    note.textContent = block.note;
    el.appendChild(note);
  }
  return el;
}

// ---------- ניווט ----------

document.getElementById("btn-prev").addEventListener("click", () => {
  weekStart = addDays(weekStart, -7);
  render();
});
document.getElementById("btn-next").addEventListener("click", () => {
  weekStart = addDays(weekStart, 7);
  render();
});
// "היום": חוזר לשבוע הנוכחי (היום מודגש) וגולל לשעה הנוכחית
document.getElementById("btn-today").addEventListener("click", () => {
  weekStart = getSunday(new Date());
  render();
  scrollToNow();
});

// גולל את הלוח כך שהשעה הנוכחית תופיע בערך שליש מהחלק העליון של המסך
function scrollToNow() {
  const now = new Date();
  const startMin = toMinutes(settings.dayStart);
  const endMin = toMinutes(settings.dayEnd);
  const nowMin = Math.min(Math.max(now.getHours() * 60 + now.getMinutes(), startMin), endMin);

  const board = document.getElementById("board");
  const slot = board.querySelector(".slot");
  if (!slot) return;
  const y = board.offsetTop + ((nowMin - startMin) / settings.slotMinutes) * slot.offsetHeight;
  const topBarHeight = document.querySelector(".top").offsetHeight;
  window.scrollTo({ top: Math.max(0, y - topBarHeight - window.innerHeight / 3), behavior: "smooth" });
}

// ---------- חלון הבלוק (יצירה / עריכה) ----------

const PALETTE = ["#f28b82", "#fbbc04", "#fff475", "#a7d67a", "#4caf8f",
                 "#6ecff6", "#5b8def", "#a78bfa", "#f78fb3", "#9aa0a6"];
const DEFAULT_COLOR = "#5b8def";

const modal = document.getElementById("modal");
const form = document.getElementById("block-form");
const fTitle = document.getElementById("f-title");
const fDate = document.getElementById("f-date");
const fStart = document.getElementById("f-start");
const fEnd = document.getElementById("f-end");
const fColor = document.getElementById("f-color");
const fNote = document.getElementById("f-note");
const fError = document.getElementById("f-error");
const btnDelete = document.getElementById("btn-delete");
const palette = document.getElementById("f-palette");

let editingId = null; // null = בלוק חדש

// בונה רשימת שעות בקפיצות של רבע שעה, בתוך טווח הלוח
function fillTimeSelect(select, fromMin, toMin) {
  select.innerHTML = "";
  for (let m = fromMin; m <= toMin; m += 15) {
    const opt = document.createElement("option");
    opt.value = toHHMM(m);
    opt.textContent = toHHMM(m);
    select.appendChild(opt);
  }
}

// מסמן את עיגול הצבע הנבחר בפלטה
function markSelectedColor() {
  for (const sw of palette.children) {
    sw.classList.toggle("selected", sw.dataset.color === fColor.value.toLowerCase());
  }
}

// בונים את הפלטה פעם אחת
for (const color of PALETTE) {
  const sw = document.createElement("button");
  sw.type = "button";
  sw.className = "swatch";
  sw.dataset.color = color;
  sw.style.background = color;
  sw.setAttribute("aria-label", `צבע ${color}`);
  sw.addEventListener("click", () => { fColor.value = color; markSelectedColor(); });
  palette.appendChild(sw);
}
fColor.addEventListener("input", markSelectedColor);

// פותח את החלון. block = בלוק קיים לעריכה, או תאריך+שעה לבלוק חדש.
function openModal({ block = null, date = null, start = null } = {}) {
  const rangeStart = toMinutes(settings.dayStart);
  const rangeEnd = toMinutes(settings.dayEnd);
  editingId = block ? block.id : null;

  document.getElementById("modal-title").textContent = block ? "עריכת בלוק" : "בלוק חדש";
  btnDelete.hidden = !block;
  fError.textContent = "";

  // ימי השבוע המוצג
  fDate.innerHTML = "";
  const dayCount = settings.showWeekend ? 7 : 5;
  for (let i = 0; i < dayCount; i++) {
    const d = addDays(weekStart, i);
    const opt = document.createElement("option");
    opt.value = dateKey(d);
    opt.textContent = `${DAY_NAMES[i]} ${monthDay.format(d)}`;
    fDate.appendChild(opt);
  }

  fillTimeSelect(fStart, rangeStart, rangeEnd - 15);
  fillTimeSelect(fEnd, rangeStart + 15, rangeEnd);

  if (block) {
    fTitle.value = block.title;
    fDate.value = block.date;
    fStart.value = block.start;
    fEnd.value = block.end;
    fColor.value = block.color;
    fNote.value = block.note || "";
  } else {
    // בלוק חדש: סיום ברירת מחדל = שעה אחרי ההתחלה (לא יותר מסוף הלוח)
    fTitle.value = "";
    fDate.value = date;
    fStart.value = start;
    fEnd.value = toHHMM(Math.min(toMinutes(start) + 60, rangeEnd));
    fColor.value = DEFAULT_COLOR;
    fNote.value = "";
  }
  markSelectedColor();

  modal.hidden = false;
  if (!block) fTitle.focus();
}

function closeModal() {
  modal.hidden = true;
  editingId = null;
}

// כששעת ההתחלה משתנה — מזיזים את הסיום כך שאורך הבלוק נשמר
let lastStartMin = 0;
fStart.addEventListener("focus", () => { lastStartMin = toMinutes(fStart.value); });
fStart.addEventListener("change", () => {
  const rangeEnd = toMinutes(settings.dayEnd);
  const duration = toMinutes(fEnd.value) - lastStartMin;
  const newStart = toMinutes(fStart.value);
  if (duration > 0) fEnd.value = toHHMM(Math.min(newStart + duration, rangeEnd));
  lastStartMin = newStart;
});

// שמירה
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const title = fTitle.value.trim();
  if (!title) { fError.textContent = "צריך לכתוב כותרת"; fTitle.focus(); return; }
  if (toMinutes(fEnd.value) <= toMinutes(fStart.value)) {
    fError.textContent = "שעת הסיום חייבת להיות אחרי שעת ההתחלה";
    return;
  }

  const values = {
    title,
    date: fDate.value,
    start: fStart.value,
    end: fEnd.value,
    color: fColor.value,
    note: fNote.value.trim(),
  };

  if (editingId) {
    Object.assign(data.blocks.find((b) => b.id === editingId), values);
  } else {
    data.blocks.push({ id: newId(), ...values, done: false, seriesId: "" });
  }
  saveData();
  closeModal();
  render();
});

// ---------- מחיקה + "בטל" ----------

const toast = document.getElementById("toast");
const toastText = document.getElementById("toast-text");
const toastUndo = document.getElementById("toast-undo");
let toastTimer = null;
let undoAction = null;

function showToast(text, onUndo) {
  toastText.textContent = text;
  undoAction = onUndo;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 6000);
}

function hideToast() {
  toast.hidden = true;
  undoAction = null;
}

toastUndo.addEventListener("click", () => {
  if (undoAction) undoAction();
  hideToast();
});

btnDelete.addEventListener("click", () => {
  const index = data.blocks.findIndex((b) => b.id === editingId);
  if (index < 0) return;
  const [removed] = data.blocks.splice(index, 1);
  saveData();
  closeModal();
  render();
  showToast("הבלוק נמחק", () => {
    data.blocks.push(removed);
    saveData();
    render();
  });
});

// ---------- לחיצות על הלוח ----------

document.getElementById("board").addEventListener("click", (e) => {
  const blockEl = e.target.closest(".block");
  if (blockEl) {
    openModal({ block: data.blocks.find((b) => b.id === blockEl.dataset.id) });
    return;
  }
  const slot = e.target.closest(".slot");
  if (slot) openModal({ date: slot.dataset.date, start: slot.dataset.time });
});

// סגירת החלון: כפתור "ביטול", לחיצה על הרקע או Escape
document.getElementById("btn-cancel").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeModal(); });

render();
