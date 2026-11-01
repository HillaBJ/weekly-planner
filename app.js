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

    // הבלוקים של היום הזה (חופפים מוצגים זה לצד זה)
    const dayBlocks = data.blocks.filter((b) => b.date === dateKey(date));
    const layout = layoutOverlaps(dayBlocks);
    for (const block of dayBlocks) {
      const el = createBlockElement(block, startMin, endMin, layout.get(block.id));
      if (el) col.appendChild(el);
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
// place = { lane, lanes }: באיזה "נתיב" מתוך כמה הבלוק יושב (לבלוקים חופפים)
function createBlockElement(block, rangeStart, rangeEnd, place = { lane: 0, lanes: 1 }) {
  const start = Math.max(toMinutes(block.start), rangeStart);
  const end = Math.min(toMinutes(block.end), rangeEnd);
  if (end <= start) return null;

  const el = document.createElement("div");
  el.className = "block";
  el.dataset.id = block.id;
  el.style.top = `calc(var(--slot-h) / 15 * ${start - rangeStart})`;
  el.style.height = `calc(var(--slot-h) / 15 * ${end - start})`;
  el.style.insetInlineStart = `calc(${place.lane} * 100% / ${place.lanes} + 1px)`;
  el.style.width = `calc(100% / ${place.lanes} - 2px)`;
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

  // ידית בתחתית הבלוק לשינוי אורך
  const handle = document.createElement("div");
  handle.className = "resize-handle";
  handle.innerHTML = "<i></i>";
  el.appendChild(handle);
  return el;
}

// בלוקים שחופפים בזמן מתחלקים ל"נתיבים" זה לצד זה.
// מחזיר Map: id -> { lane, lanes } (lanes = כמה נתיבים יש בקבוצה החופפת)
function layoutOverlaps(dayBlocks) {
  const items = dayBlocks
    .map((b) => ({ b, s: toMinutes(b.start), e: toMinutes(b.end) }))
    .sort((x, y) => x.s - y.s || y.e - x.e);

  const layout = new Map();
  let cluster = [];      // קבוצה של בלוקים שחופפים זה לזה (ישירות או בשרשרת)
  let clusterEnd = -1;

  const flush = () => {
    const laneEnds = []; // מתי כל נתיב מתפנה
    for (const it of cluster) {
      let lane = laneEnds.findIndex((end) => end <= it.s);
      if (lane < 0) { lane = laneEnds.length; laneEnds.push(it.e); } else { laneEnds[lane] = it.e; }
      it.lane = lane;
    }
    for (const it of cluster) layout.set(it.b.id, { lane: it.lane, lanes: laneEnds.length });
    cluster = [];
  };

  for (const it of items) {
    if (cluster.length && it.s >= clusterEnd) flush();
    clusterEnd = cluster.length ? Math.max(clusterEnd, it.e) : it.e;
    cluster.push(it);
  }
  if (cluster.length) flush();
  return layout;
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

// בונה פלטת צבעים בתוך container, מחוברת לשדה צבע (input). מחזיר פונקציה שמסמנת את הצבע הנבחר.
function setupPalette(container, input) {
  const mark = () => {
    for (const sw of container.children) {
      sw.classList.toggle("selected", sw.dataset.color === input.value.toLowerCase());
    }
  };
  for (const color of PALETTE) {
    const sw = document.createElement("button");
    sw.type = "button";
    sw.className = "swatch";
    sw.dataset.color = color;
    sw.style.background = color;
    sw.setAttribute("aria-label", `צבע ${color}`);
    sw.addEventListener("click", () => { input.value = color; mark(); });
    container.appendChild(sw);
  }
  input.addEventListener("input", mark);
  return mark;
}
const markSelectedColor = setupPalette(palette, fColor);

const btnDuplicate = document.getElementById("btn-duplicate");
const btnFav = document.getElementById("btn-fav");
const savedPicker = document.getElementById("saved-picker");

// פותח את החלון. block = בלוק קיים לעריכה, או תאריך+שעה לבלוק חדש.
function openModal({ block = null, date = null, start = null } = {}) {
  const rangeStart = toMinutes(settings.dayStart);
  const rangeEnd = toMinutes(settings.dayEnd);
  editingId = block ? block.id : null;

  document.getElementById("modal-title").textContent = block ? "עריכת בלוק" : "בלוק חדש";
  btnDelete.hidden = !block;
  btnDuplicate.hidden = !block;
  btnFav.hidden = !block;
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
  renderSavedPicker();

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
  undoAction = onUndo || null;
  toastUndo.hidden = !onUndo;   // הודעה בלי "בטל" (למשל "כבר קיים")
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

// ---------- גרירה ושינוי אורך ----------
// עכבר: גוררים מיד (אחרי תזוזה קטנה). מגע: לחיצה ארוכה מתחילה גרירה,
// כדי שהחלקת אצבע רגילה תמשיך לגלול את הלוח. ידית שינוי האורך עובדת מיד גם במגע.

const DRAG_THRESHOLD = 5;      // פיקסלים: עד כמה אפשר לזוז בעכבר לפני שזו "גרירה"
const LONG_PRESS_MS = 450;     // כמה זמן להחזיק אצבע כדי להתחיל גרירה
const LONG_PRESS_SLOP = 10;    // תזוזת אצבע גדולה מזה = גלילה, לא גרירה
const EDGE_ZONE = 70;          // אזור בקצה המסך שבו גרירה מפעילה גלילה אוטומטית

const boardEl = document.getElementById("board");
let drag = null;               // מצב הגרירה הנוכחית (null = אין)
let suppressClick = false;     // אחרי גרירה לא פותחים את חלון העריכה

// תיבה צפה שמראה את היום והשעות החדשים בזמן גרירה (חשוב כשהבלוק צר בטלפון)
const dragTip = document.createElement("div");
dragTip.className = "drag-tip";
dragTip.hidden = true;
document.body.appendChild(dragTip);

boardEl.addEventListener("pointerdown", (e) => {
  if (drag) return;
  if (e.pointerType === "mouse" && e.button !== 0) return;
  const el = e.target.closest(".block");
  if (!el) return;
  const block = data.blocks.find((b) => b.id === el.dataset.id);
  if (!block) return;

  const mode = e.target.closest(".resize-handle") ? "resize" : "move";
  const rect = el.getBoundingClientRect();
  drag = {
    el, block, mode,
    pointerId: e.pointerId,
    touch: e.pointerType !== "mouse",
    startX: e.clientX, startY: e.clientY,
    x: e.clientX, y: e.clientY,
    // איפה תפסנו את הבלוק, כדי שלא יקפוץ מתחת לאצבע
    grabOffsetY: e.clientY - (mode === "resize" ? rect.bottom : rect.top),
    duration: toMinutes(block.end) - toMinutes(block.start),
    active: false, target: null, timer: null, raf: 0,
  };

  // מגע + גרירת בלוק: מחכים ללחיצה ארוכה
  if (drag.touch && mode === "move") drag.timer = setTimeout(activateDrag, LONG_PRESS_MS);

  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onDragEnd);
  window.addEventListener("pointercancel", onDragCancel);
});

function onDragMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  drag.x = e.clientX;
  drag.y = e.clientY;

  if (!drag.active) {
    const dist = Math.hypot(drag.x - drag.startX, drag.y - drag.startY);
    if (drag.touch && drag.mode !== "resize") {
      // האצבע זזה לפני הלחיצה הארוכה = המשתמשת גוללת. מבטלים ומשאירים לדפדפן לגלול.
      if (dist > LONG_PRESS_SLOP) endDrag();
    } else if (dist > DRAG_THRESHOLD) {
      activateDrag();
    }
    return;
  }
  e.preventDefault();
  updateDrag();
}

// מתחיל גרירה בפועל
function activateDrag() {
  if (!drag || drag.active) return;
  clearTimeout(drag.timer);
  drag.active = true;
  if (drag.mode === "new") {
    // גרירה מ"הבלוקים שלי": נוצר בלוק צף, והמגירה נעלמת כדי שיראו את הלוח
    drag.el = makeGhost(drag.saved);
    drawer.classList.add("drag-away");
  }
  drag.el.classList.add("dragging");
  document.body.classList.add("is-dragging");
  window.getSelection()?.removeAllRanges();
  if (drag.touch && navigator.vibrate) navigator.vibrate(30); // רטט קצר = "תפסתי"
  updateDrag();
  drag.raf = requestAnimationFrame(autoScrollTick);
}

// מחשב את המיקום החדש (נצמד למשבצות) ומזיז את הבלוק על המסך
function updateDrag() {
  const rangeStart = toMinutes(settings.dayStart);
  const rangeEnd = toMinutes(settings.dayEnd);
  const grid = settings.slotMinutes;
  const cols = [...boardEl.querySelectorAll(".day-col")];
  const el = drag.el;

  // בלוק שנגרר מהמגירה: אם האצבע מחוץ ללוח, אין יעד (שחרור כאן מבטל)
  if (drag.mode === "new" && !pointerOverBoard()) {
    el.remove();
    drag.target = null;
    dragTip.hidden = true;
    return;
  }

  // העמודה (היום) הקרובה ביותר לאצבע
  const col = drag.mode === "resize"
    ? el.parentElement
    : cols.reduce((best, c) => {
        const r = c.getBoundingClientRect(), br = best.getBoundingClientRect();
        return Math.abs(drag.x - (r.left + r.right) / 2) < Math.abs(drag.x - (br.left + br.right) / 2) ? c : best;
      });
  const colRect = col.getBoundingClientRect();
  const pxPerMin = colRect.height / ((rangeEnd - rangeStart) || 1);
  const dayIndex = cols.indexOf(col);

  // שעה (בדקות) לפי מיקום האצבע, מעוגלת למשבצת
  const minuteAt = (y) => rangeStart + Math.round((y - colRect.top) / pxPerMin / grid) * grid;

  let start = drag.block ? toMinutes(drag.block.start) : 0;
  let end = drag.block ? toMinutes(drag.block.end) : 0;
  if (drag.mode !== "resize") {
    start = minuteAt(drag.y - drag.grabOffsetY);
    start = Math.min(Math.max(start, rangeStart), Math.max(rangeStart, rangeEnd - drag.duration));
    end = Math.min(start + drag.duration, rangeEnd);
    if (el.parentElement !== col) col.appendChild(el);
    el.style.insetInlineStart = "1px";   // בזמן גרירה הבלוק תופס את כל רוחב העמודה
    el.style.width = "calc(100% - 2px)";
  } else {
    end = Math.min(Math.max(minuteAt(drag.y - drag.grabOffsetY), start + grid), rangeEnd);
  }

  const visibleStart = Math.max(start, rangeStart);
  el.style.top = `calc(var(--slot-h) / 15 * ${visibleStart - rangeStart})`;
  el.style.height = `calc(var(--slot-h) / 15 * ${end - visibleStart})`;

  drag.target = { date: dateKey(addDays(weekStart, dayIndex)), start: toHHMM(start), end: toHHMM(end) };
  showDragTip(`${DAY_NAMES[dayIndex]} <span dir="ltr">${drag.target.start}–${drag.target.end}</span>`);
}

function showDragTip(html) {
  dragTip.innerHTML = html;
  dragTip.hidden = false;
  const w = dragTip.offsetWidth;
  const left = Math.min(Math.max(drag.x - w / 2, 6), window.innerWidth - w - 6);
  const top = Math.max(drag.y - 64, document.querySelector(".top").getBoundingClientRect().bottom + 4);
  dragTip.style.left = `${left}px`;
  dragTip.style.top = `${top}px`;
}

// גלילה אוטומטית כשגוררים קרוב לקצה העליון או התחתון של המסך
function autoScrollTick() {
  if (!drag || !drag.active) return;
  const topEdge = document.querySelector(".top").getBoundingClientRect().bottom;
  let dy = 0;
  if (drag.y < topEdge + EDGE_ZONE) dy = -Math.ceil(14 * Math.min(1, (topEdge + EDGE_ZONE - drag.y) / EDGE_ZONE));
  else if (drag.y > window.innerHeight - EDGE_ZONE) dy = Math.ceil(14 * Math.min(1, (drag.y - (window.innerHeight - EDGE_ZONE)) / EDGE_ZONE));
  if (dy) {
    window.scrollBy(0, dy);
    updateDrag(); // האצבע במקום, הלוח זז — מחשבים מחדש
  }
  drag.raf = requestAnimationFrame(autoScrollTick);
}

// שחרור: שומרים את המיקום החדש
function onDragEnd(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  if (drag.mode === "new") { finishNewDrag(); return; }
  if (drag.active && drag.target) {
    const { block, target } = drag;
    if (target.date !== block.date || target.start !== block.start || target.end !== block.end) {
      Object.assign(block, target);
      saveData();
    }
    holdClick();
    endDrag();
    render();
    return;
  }
  endDrag();
}

// ביטול (Escape או שהדפדפן לקח את המחווה): הבלוק חוזר למקומו
function onDragCancel(e) {
  if (!drag || (e && e.pointerId !== drag.pointerId)) return;
  const wasActive = drag.active;
  endDrag();
  if (wasActive) { holdClick(); render(); }
}

// מנקה את מצב הגרירה
function endDrag() {
  if (!drag) return;
  clearTimeout(drag.timer);
  cancelAnimationFrame(drag.raf);
  if (drag.el) {
    drag.el.classList.remove("dragging");
    if (drag.mode === "new") drag.el.remove();   // הבלוק הצף נעלם (אם נשמר — render() יצייר אותו מחדש)
  }
  drawer.classList.remove("drag-away");
  document.body.classList.remove("is-dragging");
  dragTip.hidden = true;
  window.removeEventListener("pointermove", onDragMove);
  window.removeEventListener("pointerup", onDragEnd);
  window.removeEventListener("pointercancel", onDragCancel);
  drag = null;
}

// אחרי גרירה הדפדפן שולח גם "לחיצה" — מתעלמים ממנה כדי לא לפתוח את חלון העריכה
function holdClick() {
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 150);
}

// באמצע גרירה במגע — לא נותנים לדפדפן לגלול את הדף מתחת לאצבע
document.addEventListener("touchmove", (e) => {
  if (drag && drag.active) e.preventDefault();
}, { passive: false });

// לחיצה ארוכה על בלוק: בלי תפריט הקשר ובלי בחירת טקסט
boardEl.addEventListener("contextmenu", (e) => { if (e.target.closest(".block")) e.preventDefault(); });
boardEl.addEventListener("selectstart", (e) => { if (e.target.closest && e.target.closest(".block")) e.preventDefault(); });

// ---------- שכפול ושמירה כבלוק קבוע ----------

// שכפול: עותק באותו מקום (מוצג ליד המקור), אפשר לגרור אותו משם. "בוצע" לא מועתק.
btnDuplicate.addEventListener("click", () => {
  const original = data.blocks.find((b) => b.id === editingId);
  if (!original) return;
  const copy = { ...original, id: newId(), done: false, seriesId: "" };
  data.blocks.push(copy);
  saveData();
  closeModal();
  render();
  flashBlock(copy.id);
  showToast("הבלוק שוכפל", () => {
    data.blocks = data.blocks.filter((b) => b.id !== copy.id);
    saveData();
    render();
  });
});

// מסמן לרגע בלוק חדש כדי שיהיה ברור איזה מהם העותק
function flashBlock(id) {
  const el = boardEl.querySelector(`.block[data-id="${id}"]`);
  if (el) el.classList.add("flash");
}

// שמירה כבלוק קבוע: כותרת, צבע, משך והערה (בלי יום ושעה). לוקח את מה שמוצג כרגע בחלון.
btnFav.addEventListener("click", () => {
  const title = fTitle.value.trim();
  const duration = toMinutes(fEnd.value) - toMinutes(fStart.value);
  if (!title) { fError.textContent = "צריך לכתוב כותרת"; fTitle.focus(); return; }
  if (duration <= 0) { fError.textContent = "שעת הסיום חייבת להיות אחרי שעת ההתחלה"; return; }
  fError.textContent = "";

  const item = { title, color: fColor.value, durationMinutes: duration, note: fNote.value.trim() };
  const exists = data.savedBlocks.some((s) =>
    s.title === item.title && s.color.toLowerCase() === item.color.toLowerCase() &&
    s.durationMinutes === item.durationMinutes && (s.note || "") === item.note);
  if (exists) { showToast("כבר קיים ב״הבלוקים שלי״"); return; }

  const saved = { id: newId(), ...item };
  data.savedBlocks.push(saved);
  saveData();
  showToast("נשמר ב״הבלוקים שלי״", () => {
    data.savedBlocks = data.savedBlocks.filter((s) => s.id !== saved.id);
    saveData();
  });
});

// שורת בלוקים שמורים בראש חלון "בלוק חדש": לחיצה ממלאת את השדות
function renderSavedPicker() {
  savedPicker.innerHTML = "";
  savedPicker.hidden = editingId !== null || data.savedBlocks.length === 0;
  if (savedPicker.hidden) return;

  const label = document.createElement("div");
  label.className = "picker-label";
  label.textContent = "בלוקים שמורים:";
  savedPicker.appendChild(label);

  const chips = document.createElement("div");
  chips.className = "chips";
  for (const s of data.savedBlocks) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    const dot = document.createElement("span");
    dot.className = "chip-dot";
    dot.style.background = s.color;
    chip.append(dot, document.createTextNode(s.title));
    chip.addEventListener("click", () => applySavedToForm(s));
    chips.appendChild(chip);
  }
  savedPicker.appendChild(chips);
}

function applySavedToForm(s) {
  fTitle.value = s.title;
  fColor.value = s.color;
  fNote.value = s.note || "";
  fEnd.value = toHHMM(Math.min(toMinutes(fStart.value) + s.durationMinutes, toMinutes(settings.dayEnd)));
  markSelectedColor();
}

// ---------- "הבלוקים שלי": מגירה ----------

const drawer = document.getElementById("drawer");
const savedList = document.getElementById("saved-list");
const savedEmpty = document.getElementById("saved-empty");

function openDrawer() { renderSavedList(); drawer.hidden = false; }
function closeDrawer() { drawer.hidden = true; }

document.getElementById("btn-saved").addEventListener("click", openDrawer);
document.getElementById("drawer-close").addEventListener("click", closeDrawer);
drawer.addEventListener("click", (e) => { if (e.target === drawer) closeDrawer(); }); // לחיצה על הרקע

// "45 דקות", "שעה", "שעתיים", "3 שעות", "1:30 שעות"
function durationLabel(min) {
  if (min < 60) return `${min} דקות`;
  const h = Math.floor(min / 60), m = min % 60;
  if (m) return `${h}:${pad(m)} שעות`;
  return h === 1 ? "שעה" : h === 2 ? "שעתיים" : `${h} שעות`;
}

function renderSavedList() {
  savedList.innerHTML = "";
  savedEmpty.hidden = data.savedBlocks.length > 0;

  for (const s of data.savedBlocks) {
    const card = document.createElement("div");
    card.className = "saved-card";
    card.dataset.id = s.id;

    const dot = document.createElement("span");
    dot.className = "saved-dot";
    dot.style.background = s.color;

    const info = document.createElement("div");
    info.className = "saved-info";
    const name = document.createElement("div");
    name.className = "saved-name";
    name.textContent = s.title;
    const meta = document.createElement("div");
    meta.className = "saved-meta";
    meta.textContent = durationLabel(s.durationMinutes) + (s.note ? ` · ${s.note}` : "");
    info.append(name, meta);

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "icon-btn";
    edit.textContent = "✎";
    edit.setAttribute("aria-label", `עריכת ${s.title}`);
    edit.addEventListener("click", () => openSavedModal(s));

    const del = document.createElement("button");
    del.type = "button";
    del.className = "icon-btn";
    del.textContent = "✕";
    del.setAttribute("aria-label", `מחיקת ${s.title}`);
    del.addEventListener("click", () => deleteSaved(s));

    card.append(dot, info, edit, del);
    savedList.appendChild(card);
  }
}

function deleteSaved(s) {
  const index = data.savedBlocks.findIndex((x) => x.id === s.id);
  if (index < 0) return;
  data.savedBlocks.splice(index, 1);
  saveData();
  renderSavedList();
  showToast("הבלוק השמור נמחק", () => {
    data.savedBlocks.splice(index, 0, s);   // חוזר לאותו מקום ברשימה
    saveData();
    renderSavedList();
  });
}

// ---------- עריכת בלוק שמור ----------

const savedModal = document.getElementById("saved-modal");
const sTitle = document.getElementById("s-title");
const sDuration = document.getElementById("s-duration");
const sColor = document.getElementById("s-color");
const sNote = document.getElementById("s-note");
const sError = document.getElementById("s-error");
const markSavedColor = setupPalette(document.getElementById("s-palette"), sColor);
let editingSavedId = null;

for (let m = 15; m <= 600; m += 15) {
  const opt = document.createElement("option");
  opt.value = m;
  opt.textContent = durationLabel(m);
  sDuration.appendChild(opt);
}

function openSavedModal(s) {
  editingSavedId = s.id;
  sTitle.value = s.title;
  sDuration.value = s.durationMinutes;
  sColor.value = s.color;
  sNote.value = s.note || "";
  sError.textContent = "";
  markSavedColor();
  savedModal.hidden = false;
}

function closeSavedModal() { savedModal.hidden = true; editingSavedId = null; }

document.getElementById("saved-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const title = sTitle.value.trim();
  if (!title) { sError.textContent = "צריך לכתוב כותרת"; sTitle.focus(); return; }
  Object.assign(data.savedBlocks.find((x) => x.id === editingSavedId), {
    title, durationMinutes: Number(sDuration.value), color: sColor.value, note: sNote.value.trim(),
  });
  saveData();
  closeSavedModal();
  renderSavedList();
});
document.getElementById("s-cancel").addEventListener("click", closeSavedModal);
savedModal.addEventListener("click", (e) => { if (e.target === savedModal) closeSavedModal(); });

// ---------- גרירה מהמגירה אל הלוח ----------
// עכבר: גוררים מיד. מגע: לחיצה ארוכה ואז גרירה (כמו בגרירת בלוקים), כדי שגלילת הרשימה תמשיך לעבוד.

savedList.addEventListener("pointerdown", (e) => {
  if (drag) return;
  if (e.pointerType === "mouse" && e.button !== 0) return;
  if (e.target.closest("button")) return;                 // כפתורי עריכה/מחיקה
  const card = e.target.closest(".saved-card");
  const saved = card && data.savedBlocks.find((s) => s.id === card.dataset.id);
  if (!saved) return;

  drag = {
    mode: "new", saved, el: null,
    pointerId: e.pointerId,
    touch: e.pointerType !== "mouse",
    startX: e.clientX, startY: e.clientY,
    x: e.clientX, y: e.clientY,
    grabOffsetY: 8,                                        // הבלוק נוחת מעט מתחת לראש האצבע
    duration: saved.durationMinutes,
    active: false, target: null, timer: null, raf: 0,
  };
  if (drag.touch) drag.timer = setTimeout(activateDrag, LONG_PRESS_MS);

  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onDragEnd);
  window.addEventListener("pointercancel", onDragCancel);
});

savedList.addEventListener("contextmenu", (e) => { if (e.target.closest(".saved-card")) e.preventDefault(); });

// בלוק צף שמוצג בזמן הגרירה (אותו מראה של בלוק רגיל)
function makeGhost(saved) {
  const el = document.createElement("div");
  el.className = "block";
  el.style.background = saved.color;
  el.style.color = textColorFor(saved.color);
  const title = document.createElement("span");
  title.className = "b-title";
  title.textContent = saved.title;
  el.appendChild(title);
  return el;
}

// האם האצבע/העכבר נמצאים מעל אזור הלוח (ולא מתחת לכותרת הקבועה)
function pointerOverBoard() {
  const b = boardEl.getBoundingClientRect();
  const top = Math.max(b.top, document.querySelector(".top").getBoundingClientRect().bottom);
  return drag.x >= b.left && drag.x <= b.right && drag.y >= top && drag.y <= Math.min(b.bottom, window.innerHeight);
}

// שחרור של בלוק שנגרר מהמגירה: נוצר בלוק חדש בלוח, או שהגרירה מתבטלת והמגירה חוזרת
function finishNewDrag() {
  const { saved, target, active } = drag;
  endDrag();
  if (!active) return;                  // לחיצה רגילה בלי גרירה — לא עושים כלום
  holdClick();
  if (!target) return;                  // שוחרר מחוץ ללוח: המגירה חוזרת

  data.blocks.push({
    id: newId(), title: saved.title, date: target.date, start: target.start, end: target.end,
    color: saved.color, note: saved.note || "", done: false, seriesId: "",
  });
  saveData();
  closeDrawer();
  render();
}

// ---------- לחיצות על הלוח ----------

boardEl.addEventListener("click", (e) => {
  if (suppressClick) return;
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
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (drag) onDragCancel();          // באמצע גרירה: מבטלים אותה
  else if (!savedModal.hidden) closeSavedModal();
  else if (!modal.hidden) closeModal();
  else if (!drawer.hidden) closeDrawer();
});

render();
