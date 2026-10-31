// ===== שלב 1: שלד – לוח שבועי ריק + ניווט בין שבועות =====
// הגדרות ברירת מחדל (בשלב 5 הן יהיו ניתנות לשינוי ויישמרו)
const settings = {
  dayStart: "07:00",
  dayEnd: "22:00",
  slotMinutes: 15,
  showWeekend: true, // שישי ושבת מוצגים כברירת מחדל
};

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
      slot.dataset.date = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
      slot.dataset.time = `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
      col.appendChild(slot);
    }
    board.appendChild(col);
  }
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

render();
