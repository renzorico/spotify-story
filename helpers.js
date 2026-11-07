/* data-story-design helpers. Paste into the page script after D3 and your DATA are loaded.
   Needs: <div id="tip" role="status"></div>, .screen sections and .fill chart containers from tokens.css. */

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const SCREEN_MODE = "(min-width: 900px) and (min-height: 640px)"; // must match the media query in tokens.css
const MOTION_MS = 1200; // one duration for every entrance
const REVEAL_RATIO = 0.3; // chart must be this visible before its entrance starts
const PAGE_LOCK_MS = 750, WHEEL_QUIET_MS = 160, WHEEL_MIN_DELTA = 4, NEW_GESTURE_RATIO = 1.6;

const widthOf = el => el.getBoundingClientRect().width;
/* In screen mode a chart fills the room left in its screen; below that it uses the fallback height. */
const heightOf = (root, fallback) => (matchMedia(SCREEN_MODE).matches ? Math.max(root.clientHeight, 200) : fallback);
/* Same value as --gutter, in pixels, so chart text lines up with page text. */
const insetOf = () => Math.max(16, Math.min(56, innerWidth * 0.04));

/* ---------- Tooltip ---------- */
const tip = document.getElementById("tip");
function showTip(event, html) {
  tip.innerHTML = html;
  tip.style.opacity = 1;
  const margin = 14, box = tip.getBoundingClientRect();
  const x = Math.min(event.clientX + margin, innerWidth - box.width - 8);
  const y = event.clientY + margin + box.height > innerHeight ? event.clientY - box.height - margin : event.clientY + margin;
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${y}px`;
}
const hideTip = () => { tip.style.opacity = 0; };

/* ---------- Legend (static swatches; make buttons yourself when a legend filters) ---------- */
function setLegend(id, items) {
  document.getElementById(id).innerHTML = items.map(([label, color]) => `<li><i style="background:${color}"></i>${label}</li>`).join("");
}

/* ---------- Reveal once, when the chart is on screen ---------- */
const revealed = new Set(), revealWatchers = new Map();
const isWaiting = key => !REDUCED && !revealed.has(key);
function revealOnView(key, root, start) {
  if (revealWatchers.has(key)) revealWatchers.get(key).disconnect();
  const watcher = new IntersectionObserver(entries => {
    if (entries[0].intersectionRatio < REVEAL_RATIO) return;
    watcher.disconnect();
    revealed.add(key);
    start();
  }, { threshold: [REVEAL_RATIO] });
  revealWatchers.set(key, watcher);
  watcher.observe(root);
}
/* Left-to-right wipe for area charts. Draw the chart inside a <g> with clip-path = the returned value. */
function wipeClip(svg, key, root, W, H) {
  const id = `${key}-clip`;
  const rect = svg.append("clipPath").attr("id", id).append("rect").attr("height", H).attr("width", isWaiting(key) ? 0 : W);
  if (isWaiting(key)) revealOnView(key, root, () => rect.transition().duration(MOTION_MS).ease(d3.easeCubicInOut).attr("width", W));
  return `url(#${id})`;
}

/* ---------- Wheel pager: one gesture moves exactly one screen ---------- */
let pageLockedUntil = 0, lastWheelAt = 0, lastWheelDelta = 0;
addEventListener("wheel", event => {
  if (!matchMedia(SCREEN_MODE).matches || event.ctrlKey || event.metaKey) return; // ctrl/cmd = zoom, leave it alone
  const inner = event.target.closest && event.target.closest(".examples"); // add selectors of inner scroll areas here
  if (inner && inner.scrollHeight > inner.clientHeight) return;
  event.preventDefault();
  const now = performance.now(), delta = Math.abs(event.deltaY);
  const newGesture = now - lastWheelAt > WHEEL_QUIET_MS || delta > lastWheelDelta * NEW_GESTURE_RATIO;
  lastWheelAt = now; lastWheelDelta = delta;
  if (now < pageLockedUntil || !newGesture || delta < WHEEL_MIN_DELTA) return;
  const screens = [...document.querySelectorAll(".screen:not([hidden])")];
  const barHeight = document.getElementById("banner").offsetHeight;
  const tops = screens.map(el => Math.abs(el.getBoundingClientRect().top - barHeight));
  const current = tops.indexOf(Math.min(...tops));
  const target = screens[Math.max(0, Math.min(screens.length - 1, current + Math.sign(event.deltaY)))];
  pageLockedUntil = now + PAGE_LOCK_MS;
  target.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth" });
}, { passive: false });

/* ---------- Drawing loop ---------- */
/* Charts write their own titles and legends, which changes the room left for them, so draw twice. */
function drawAll(drawCharts) {
  drawCharts();
  drawCharts();
}
let lastWidth = innerWidth, lastHeight = innerHeight, resizeTimer;
function redrawOnResize(drawCharts) {
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (innerWidth !== lastWidth || innerHeight !== lastHeight) { lastWidth = innerWidth; lastHeight = innerHeight; drawAll(drawCharts); }
    }, 180);
  });
}
