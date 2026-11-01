// service-worker.js — שומר את האפליקציה בטלפון כדי שתעבוד גם בלי אינטרנט.
// אסטרטגיה: "קודם הרשת". כשיש אינטרנט תמיד נטענת הגרסה העדכנית (ונשמרת לגיבוי),
// ובלי אינטרנט (או עם חיבור איטי מאוד) נטענת הגרסה השמורה.
// הנתונים של המשתמשת (localStorage) לא נוגעים בקובץ הזה בכלל.

// כשמשנים קבצים של האפליקציה אפשר להעלות את המספר — הגרסאות הישנות נמחקות מהמטמון.
const CACHE = "weekly-planner-v1";

// הקבצים שנשמרים מראש, כדי שהאפליקציה תעבוד בלי אינטרנט כבר מהפתיחה הראשונה
const APP_FILES = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
  "fonts/rubik-hebrew-400.woff2",
  "fonts/rubik-hebrew-500.woff2",
  "fonts/rubik-hebrew-700.woff2",
  "fonts/rubik-latin-400.woff2",
  "fonts/rubik-latin-500.woff2",
  "fonts/rubik-latin-700.woff2",
];

const NETWORK_TIMEOUT_MS = 4000; // חיבור איטי מדי — עוברים לגרסה השמורה

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(APP_FILES.map((f) => new Request(f, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// מנסה את הרשת, ואם נכשלה או התארכה — מחזיר מהמטמון
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetchWithTimeout(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((cached) =>
          cached || (req.mode === "navigate" ? caches.match("index.html") : Response.error())
        )
      )
  );
});

function fetchWithTimeout(req) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), NETWORK_TIMEOUT_MS);
    fetch(req).then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}
