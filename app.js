/* Five years listening: one draw function per screen. Data comes from data.js (window.DATA),
   the map from world.js (window.WORLD), shared helpers from helpers.js. */
"use strict";

const D = window.DATA;
const SLOTS = ["#b4f03c", "#ff4fa0", "#2ec5ff", "#ffb22e", "#9b7bff", "#ff6a3d", "#3fe0b0"];
const OTHER = "#5c5b64";
const OTHER_LIGHT = "#9a99a6"; // non-top artists where a mark must stay visible on black
const ACCENT = SLOTS[0]; // lime: Canserbero and the page chrome, nothing else
/* Charts that are not about one artist use neutrals, so colour never implies an artist link. */
const HEAT = ["#141418", "#26262d", "#4d4c56", "#9a99a6", "#f3f2ee"];
const NEUTRAL_HI = "#e6e5df";
const NEUTRAL_LO = "#8b8a94";
const HALO = "rgba(0,0,0,.6)";
const ON_NEON = "#09090b";
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAYS_SHORT = DAYS.map(d => d.slice(0, 3));

const fmt = d3.format(",");
const pct = d3.format(".0%");
const pct1 = d3.format(".1%");
const fmtH = h => (h >= 10 ? fmt(Math.round(h)) : d3.format(".1f")(h));
const parseDay = d3.timeParse("%Y-%m-%d");
const monthName = d3.timeFormat("%b %Y");
const longDay = d3.timeFormat("%-d %b %Y");
const MONTHS = D.months.map(parseDay);
const FIRST_DAY = parseDay(D.meta.firstDay);
const FIRST_WEEK = parseDay(D.firstWeek);
const DAY_MS = 864e5;
const hh = h => `${String(h).padStart(2, "0")}:00`;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const colorOf = name => { const i = D.artists.indexOf(name); return i >= 0 ? SLOTS[i] : OTHER; };
const isTop = name => D.artists.includes(name);
const setText = (id, text) => { document.getElementById(id).textContent = text; };
const isPhone = () => innerWidth < 600;
/* Labels on fills: dark text on neon, white with a halo on grey. */
function labelOn(sel, fill) {
  if (fill === OTHER) sel.style("fill", "#fff").attr("paint-order", "stroke").attr("stroke", HALO).attr("stroke-width", 3);
  else sel.style("fill", ON_NEON);
  return sel.style("font-weight", 600).style("font-size", "13px");
}
/* Year ticks along the bottom of a time chart. */
function yearTicks(svg, x, H, inset) {
  const years = d3.timeYear.range(d3.timeYear.ceil(x.domain()[0]), x.domain()[1]);
  const shown = innerWidth < 480 ? years.filter((_, i) => i % 2 === 0) : years;
  svg.append("g").selectAll("line").data(years).join("line")
    .attr("x1", d => x(d)).attr("x2", d => x(d)).attr("y1", 0).attr("y2", H - 22).attr("stroke", "#232329");
  svg.append("g").selectAll("text").data(shown).join("text")
    .attr("x", d => Math.max(inset, x(d))).attr("y", H - 8).attr("text-anchor", d => (x(d) < inset + 20 ? "start" : "middle"))
    .text(d => d.getFullYear());
}
/* Deterministic jitter so dots do not move between redraws. */
const jitter = i => { const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); };

/* Keyboard tour: the chart is one tab stop; arrow keys step through its marks and show the same
   tooltip a pointer would (the tooltip is a role=status region, so screen readers hear it). */
const TOUR_KEYS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
function keyboardTour(svg, marks, show, clear) {
  const nodes = marks.nodes();
  let index = -1;
  const go = k => {
    index = (k + nodes.length) % nodes.length;
    const node = nodes[index], box = node.getBoundingClientRect();
    show({ clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 }, d3.select(node).datum(), node);
  };
  svg.attr("tabindex", 0).attr("aria-label", `${svg.attr("aria-label")}. Focus it and use the arrow keys to read each value.`)
    .on("focus", () => go(Math.max(index, 0)))
    .on("blur", clear)
    .on("keydown", event => {
      const step = TOUR_KEYS[event.key];
      if (step) { event.preventDefault(); go(index + step); }
      else if (event.key === "Home") { event.preventDefault(); go(0); }
      else if (event.key === "End") { event.preventDefault(); go(nodes.length - 1); }
      else if (event.key === "Escape") svg.node().blur();
    });
}
/* Drop labels whose box overlaps one already placed; callers pass them biggest first. */
function placeWithoutOverlap(items, boxOf) {
  const placed = [];
  return items.filter(item => {
    const b = boxOf(item);
    if (placed.some(p => b.x0 < p.x1 && b.x1 > p.x0 && b.y0 < p.y1 && b.y1 > p.y0)) return false;
    placed.push(b);
    return true;
  });
}

/* ================= Hero ================= */
function drawHero() {
  const m = D.meta;
  document.getElementById("hero-title").innerHTML = `<span class="num">${fmt(Math.round(m.hours))}</span> hours of music.`;
  setText("hero-lede", `Between ${longDay(FIRST_DAY)} and ${longDay(parseDay(m.lastDay))} I played ${Math.round(m.hours / 24)} full days and nights of sound. ` +
    `I pressed play ${fmt(m.plays)} times, and music played on ${pct(m.activeDays / m.spanDays)} of those days.`);
  const stats = [[m.plays, "plays"], [m.artists, "artists"], [m.tracks, "different songs"], [m.topDay.hours, `hours on my biggest day, ${longDay(parseDay(m.topDay.date))}`]];
  const box = document.getElementById("stats");
  box.innerHTML = stats.map(([, label]) => `<div class="stat"><b>0</b><span>${esc(label)}</span></div>`).join("");
  box.querySelectorAll("b").forEach((el, i) => {
    const [value] = stats[i];
    const show = v => { el.textContent = Number.isInteger(value) ? fmt(Math.round(v)) : d3.format(".1f")(v); };
    if (REDUCED) { show(value); return; }
    d3.select(el).transition().delay(200 + i * 120).duration(1600).ease(d3.easeCubicOut)
      .tween("count", () => { const f = d3.interpolateNumber(0, value); return t => show(f(t)); });
  });
  startEqualizer();
}

/* Background equalizer: one bar per week of listening, breathing while the hero is visible. */
function startEqualizer() {
  const canvas = document.getElementById("hero-eq");
  const ctx = canvas.getContext("2d");
  const weeks = d3.range(0, D.daily.length, 7).map(i => d3.sum(D.daily.slice(i, i + 7)));
  const peak = d3.max(weeks);
  let visible = true, frame = 0;
  new IntersectionObserver(e => { visible = e[0].isIntersecting; if (visible && !REDUCED) loop(); }).observe(canvas);
  function paint(t) {
    const dpr = devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
    if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const step = W / weeks.length, base = H * 0.86, room = H * 0.62;
    const grad = ctx.createLinearGradient(0, base - room, 0, base);
    grad.addColorStop(0, "#e2ff9a"); grad.addColorStop(1, ACCENT);
    ctx.fillStyle = grad;
    weeks.forEach((v, i) => {
      const wave = REDUCED ? 1 : 0.82 + 0.18 * Math.sin(t / 420 + i * 0.35) * Math.sin(t / 1300 + i * 0.07);
      const h = Math.max(1, (v / peak) * room * wave);
      ctx.fillRect(i * step, base - h, Math.max(1, step - 1.5), h);
      ctx.globalAlpha = 0.18;
      ctx.fillRect(i * step, base + 4, Math.max(1, step - 1.5), h * 0.3); // reflection
      ctx.globalAlpha = 1;
    });
  }
  function loop() {
    cancelAnimationFrame(frame);
    const tick = t => { paint(t); if (visible && !REDUCED) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
  }
  paint(0);
  if (!REDUCED) loop();
  addEventListener("resize", () => paint(performance.now()));
}

/* ================= 1. Artist river ================= */
function drawRiver() {
  const root = document.getElementById("river");
  root.innerHTML = "";
  const W = widthOf(root), H = heightOf(root, 380), inset = insetOf();
  const smooth = s => s.map((v, i) => ((s[i - 1] ?? v) + 2 * v + (s[i + 1] ?? v)) / 4);
  const series = D.river.series.map(smooth);
  const rows = MONTHS.map((_, m) => Object.fromEntries(series.map((s, k) => [k, s[m]])));
  const stack = d3.stack().keys(series.map((_, k) => k)).offset(d3.stackOffsetSilhouette)(rows);
  const x = d3.scaleTime().domain(d3.extent(MONTHS)).range([0, W]);
  const y = d3.scaleLinear().domain([d3.min(stack, s => d3.min(s, d => d[0])), d3.max(stack, s => d3.max(s, d => d[1]))]).range([H - 30, 8]);
  const area = d3.area().x((_, i) => x(MONTHS[i])).y0(d => y(d[0])).y1(d => y(d[1])).curve(d3.curveBasis);
  const svg = d3.select(root).append("svg").attr("width", W).attr("height", H).attr("role", "img")
    .attr("aria-label", `Streamgraph of monthly hours for my top ${D.artists.length} artists, ${D.months[0].slice(0, 4)} to ${D.months.at(-1).slice(0, 4)}`);
  yearTicks(svg, x, H, inset);
  const bands = svg.append("g").attr("clip-path", wipeClip(svg, "river", root, W, H))
    .selectAll("path").data(stack).join("path").attr("d", area)
    .attr("fill", (_, k) => SLOTS[k]).attr("stroke", "#09090b").attr("stroke-width", 0.7);
  const peakOf = s => d3.maxIndex(D.river.series[s.key]);
  const show = (event, s, m) => {
    bands.attr("opacity", d => (d.key === s.key ? 1 : 0.22));
    const raw = D.river.series[s.key][m];
    showTip(event, `<b>${esc(D.artists[s.key])}</b>${monthName(MONTHS[m])}: ${fmtH(raw)} hours<br><span class="k">${pct(raw / D.river.allHours[m])} of everything I played that month</span>`);
  };
  const clear = () => { bands.attr("opacity", 1); hideTip(); };
  bands.on("pointermove", (event, s) => show(event, s, d3.bisectCenter(MONTHS.map(Number), +x.invert(d3.pointer(event, svg.node())[0]))))
    .on("pointerleave", clear);
  keyboardTour(svg, bands, (event, s) => show(event, s, peakOf(s)), clear);
  if (W >= 700) {
    /* Every band is named on the chart at its thickest month, unless that spot is taken. */
    const labels = svg.append("g").style("opacity", isWaiting("river-labels") ? 0 : 1).style("pointer-events", "none");
    const spots = stack.map((s, k) => {
      const i = d3.maxIndex(s, d => d[1] - d[0]);
      const w = D.artists[k].length * 7.6 + 8;
      return { k, cx: Math.min(W - inset - w / 2, Math.max(inset + w / 2, x(MONTHS[i]))), cy: y((s[i][0] + s[i][1]) / 2), w, thick: y(s[i][0]) - y(s[i][1]) };
    }).filter(p => p.thick >= 16).sort((a, b) => b.thick - a.thick);
    placeWithoutOverlap(spots, p => ({ x0: p.cx - p.w / 2, x1: p.cx + p.w / 2, y0: p.cy - 9, y1: p.cy + 9 })).forEach(p => {
      labelOn(labels.append("text").attr("x", p.cx).attr("y", p.cy + 4).attr("text-anchor", "middle").text(D.artists[p.k]), SLOTS[p.k]);
    });
    if (isWaiting("river-labels")) revealOnView("river-labels", root, () => labels.transition().delay(MOTION_MS).duration(400).style("opacity", 1));
  }
  setLegend("river-legend", D.artists.map((a, k) => [esc(a), SLOTS[k]]));
  let best = { v: 0 };
  D.river.series.forEach((s, k) => s.forEach((v, m) => { if (v > best.v) best = { v, k, m }; }));
  setText("river-title", `${D.artists[best.k]} hit ${fmtH(best.v)} hours in ${monthName(MONTHS[best.m])}: no artist ever had a bigger month.`);
}

/* ================= 2. Bar chart race ================= */
const race = { f: 0, playing: true, timer: null, started: false, render: null };
const RACE_BARS = 10, RACE_MONTH_MS = 380;
function drawRace() {
  const root = document.getElementById("race");
  root.innerHTML = "";
  const W = widthOf(root), H = heightOf(root, 420), inset = insetOf();
  const { names, cum } = D.race, last = MONTHS.length - 1;
  const svg = d3.select(root).append("svg").attr("width", W).attr("height", H).attr("role", "img")
    .attr("aria-label", "Animated bar chart race of cumulative listening hours per artist");
  const watermark = svg.append("text").attr("class", "race-month").attr("x", W - inset).attr("y", H - 16).attr("text-anchor", "end");
  const rowH = (H - 24) / RACE_BARS, barH = Math.max(14, rowH * 0.72);
  const left = inset, x = d3.scaleLinear().range([left, W - inset - 70]);
  const axis = svg.append("g");
  svg.append("clipPath").attr("id", "race-clip").append("rect").attr("width", W).attr("height", H - 24); // hide bars sliding out below rank 10
  const bars = svg.append("g").attr("clip-path", "url(#race-clip)");
  const rankAt = i => { const order = d3.range(names.length).sort((a, b) => cum[b][i] - cum[a][i]); const r = []; order.forEach((k, pos) => { r[k] = pos; }); return r; };
  const ranks = MONTHS.map((_, i) => rankAt(i));
  /* The month the final leader took first place for good: the title's claim, marked on the chart. */
  const leader = d3.range(names.length).sort((a, b) => cum[b][last] - cum[a][last])[0];
  let since = 0;
  for (let i = last; i >= 0; i--) if (ranks[i][leader] !== 0) { since = i + 1; break; }
  const before = since > 0 ? names[ranks[since - 1].indexOf(0)] : null;
  const callout = svg.append("text").attr("x", W - inset).attr("y", rowH / 2).attr("dy", "0.35em").attr("text-anchor", "end")
    .style("fill", "var(--ink)").style("font-size", "13px").style("font-weight", 600)
    .attr("paint-order", "stroke").attr("stroke", "#09090b").attr("stroke-width", 4);
  function render(f) {
    const i0 = Math.floor(f), i1 = Math.min(last, i0 + 1), t = f - i0;
    const items = names.map((name, k) => ({ name, k, v: cum[k][i0] * (1 - t) + cum[k][i1] * t, r: ranks[i0][k] * (1 - t) + ranks[i1][k] * t }))
      .filter(d => d.r < RACE_BARS + 0.6);
    x.domain([0, Math.max(1, d3.max(items, d => d.v)) * 1.02]);
    const ticks = x.ticks(isPhone() ? 3 : 6).filter(v => v > 0);
    axis.selectAll("line").data(ticks).join("line").attr("x1", x).attr("x2", x).attr("y1", 0).attr("y2", H - 24).attr("stroke", "#232329");
    axis.selectAll("text").data(ticks).join("text").attr("x", x).attr("y", H - 8).attr("text-anchor", "middle").text(v => `${fmt(v)} h`);
    const g = bars.selectAll("g.bar").data(items, d => d.name).join(enter => {
      const e = enter.append("g").attr("class", "bar");
      e.append("rect").attr("rx", 4);
      e.append("text").attr("class", "name").attr("dy", "0.35em");
      e.append("text").attr("class", "val").attr("dy", "0.35em").style("fill", "var(--ink)").style("font-size", "13px").style("font-weight", 600);
      return e;
    });
    g.attr("transform", d => `translate(0,${d.r * rowH + (rowH - barH) / 2})`).attr("opacity", d => Math.max(0, Math.min(1, RACE_BARS + 0.6 - d.r)));
    g.select("rect").attr("x", left).attr("height", barH).attr("width", d => Math.max(2, x(d.v) - left)).attr("fill", d => colorOf(d.name));
    g.select("text.name").attr("y", barH / 2).each(function (d) {
      const fits = x(d.v) - left > d.name.length * 7.4 + 16;
      const s = d3.select(this).text(d.name).attr("x", fits ? left + 10 : x(d.v) + 10);
      if (fits) labelOn(s, colorOf(d.name)); else s.style("fill", "var(--ink-2)").attr("stroke", null).style("font-size", "13px").style("font-weight", 600);
    });
    g.select("text.val").attr("y", barH / 2).each(function (d) {
      const fits = x(d.v) - left > d.name.length * 7.4 + 16;
      d3.select(this).attr("x", fits ? x(d.v) + 8 : x(d.v) + 18 + d.name.length * 7.4).text(fmt(Math.round(d.v)));
    });
    g.on("pointermove", (event, d) => showTip(event, `<b>${esc(d.name)}</b>${fmt(Math.round(d.v))} hours by ${monthName(MONTHS[Math.round(f)])}`)).on("pointerleave", hideTip);
    callout.text(before && f >= since && !isPhone() ? `${names[leader]} takes #1 in ${monthName(MONTHS[since])}` : "");
    watermark.text(monthName(MONTHS[Math.round(f)]));
    setText("race-label", monthName(MONTHS[Math.round(f)]));
    document.getElementById("race-scrub").value = f;
  }
  race.render = render;
  const scrub = document.getElementById("race-scrub");
  scrub.max = last;
  if (REDUCED && !race.started) { race.f = last; race.playing = false; }
  render(race.f);
  setPlayButton();
  if (!race.started) revealOnView("race", root, () => { race.started = true; if (race.playing) playRace(); });
  setText("race-title", before
    ? `${names[leader]} passed ${before} in ${monthName(MONTHS[since])} and never gave the lead back.`
    : `${names[leader]} led the race from the first month to the last.`);
}
const ICON_PLAY = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.2-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5z" fill="currentColor"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect x="3.5" y="2.5" width="3.2" height="11" rx="1" fill="currentColor"/><rect x="9.3" y="2.5" width="3.2" height="11" rx="1" fill="currentColor"/></svg>';
function setPlayButton() {
  const b = document.getElementById("race-play");
  b.innerHTML = race.playing ? ICON_PAUSE : ICON_PLAY;
  b.setAttribute("aria-label", race.playing ? "Pause race" : "Play race");
  b.setAttribute("aria-pressed", String(race.playing));
}
function playRace() {
  if (race.timer) race.timer.stop();
  const last = MONTHS.length - 1;
  if (race.f >= last) race.f = 0;
  race.playing = true; setPlayButton();
  let prev = null;
  race.timer = d3.timer(elapsed => {
    const dt = prev === null ? 0 : elapsed - prev; prev = elapsed;
    race.f = Math.min(last, race.f + dt / RACE_MONTH_MS);
    race.render(race.f);
    if (race.f >= last) { race.timer.stop(); race.playing = false; setPlayButton(); }
  });
}
function pauseRace() { if (race.timer) race.timer.stop(); race.playing = false; setPlayButton(); }
document.getElementById("race-play").addEventListener("click", () => { race.started = true; if (race.playing) pauseRace(); else playRace(); });
document.getElementById("race-scrub").addEventListener("input", e => { pauseRace(); race.started = true; race.f = +e.target.value; race.render(race.f); });

/* ================= 3. Obsessions ================= */
function drawObsessions() {
  const root = document.getElementById("obsessions");
  root.innerHTML = "";
  const W = widthOf(root), H = heightOf(root, 560), inset = insetOf();
  const obs = D.obsessions, nWeeks = Math.ceil(D.meta.spanDays / 7) + 1;
  const weekDate = w => new Date(+FIRST_WEEK + w * 7 * DAY_MS);
  const x = d3.scaleTime().domain([FIRST_WEEK, weekDate(nWeeks)]).range([0, W]);
  const headroom = 0.6; // extra rows of space above the first baseline so the tallest spike fits
  const rowH = (H - 30) / (obs.length + headroom), peak = d3.max(obs, o => o.peak);
  const y = d3.scaleLinear().domain([0, peak]).range([0, rowH * (1 + headroom)]);
  const svg = d3.select(root).append("svg").attr("width", W).attr("height", H).attr("role", "img")
    .attr("aria-label", "Weekly plays of my twelve biggest one-week obsessions, one row per song");
  yearTicks(svg, x, H, inset);
  const defs = svg.append("defs");
  const glow = defs.append("filter").attr("id", "glow").attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
  glow.append("feGaussianBlur").attr("stdDeviation", 3).attr("result", "b");
  const merge = glow.append("feMerge"); merge.append("feMergeNode").attr("in", "b"); merge.append("feMergeNode").attr("in", "SourceGraphic");
  const waiting = isWaiting("obsessions");
  const rows = svg.append("g").selectAll("g").data(obs).join("g").attr("transform", (_, i) => `translate(0,${(i + 1 + headroom) * rowH})`);
  rows.append("line").attr("x1", 0).attr("x2", W).attr("stroke", "#232329");
  const dense = o => { const v = new Array(nWeeks).fill(0); o.weeks.forEach(([w, n]) => { if (w >= 0 && w < nWeeks) v[w] = n; }); return v; };
  const line = d3.area().x((_, w) => x(weekDate(w))).y0(0).y1(n => -y(n)).curve(d3.curveMonotoneX);
  const fillOf = o => (isTop(o.artist) ? colorOf(o.artist) : OTHER_LIGHT);
  const paths = rows.append("path").attr("fill", fillOf).attr("fill-opacity", 0.85).attr("stroke", fillOf).attr("stroke-width", 1).attr("filter", "url(#glow)")
    .attr("d", o => line(dense(o)))
    .attr("transform", waiting ? "scale(1,0)" : null);
  /* Label sits left; when the song's peak is under it, it moves to the right edge. */
  const labelW = o => (o.track.length + o.artist.length + 2) * 6.8;
  const peakX = o => x(parseDay(o.peakWeek));
  const onRight = o => peakX(o) < inset + labelW(o) + 30;
  rows.append("text").attr("x", o => (onRight(o) ? W - inset : inset)).attr("text-anchor", o => (onRight(o) ? "end" : "start")).attr("y", -5).style("fill", "var(--ink)").style("font-size", "13px").style("font-weight", 600)
    .attr("paint-order", "stroke").attr("stroke", "#09090b").attr("stroke-width", 4)
    .text(o => (isPhone() && o.track.length > 28 ? `${o.track.slice(0, 27)}…` : o.track))
    .append("tspan").style("fill", "var(--muted)").style("font-weight", 400).text(o => `  ${o.artist}`);
  rows.append("text").attr("x", o => x(parseDay(o.peakWeek)) + 8).attr("y", o => -y(o.peak) + 10)
    .style("fill", "var(--ink-2)").style("font-size", "12px").attr("paint-order", "stroke").attr("stroke", "#09090b").attr("stroke-width", 3).text(o => o.peak);
  if (waiting) revealOnView("obsessions", root, () => paths.transition().delay((_, i) => i * 70).duration(900).ease(d3.easeBackOut.overshoot(1.4)).attr("transform", "scale(1,1)"));
  const show = (event, o) => {
    rows.attr("opacity", d => (d === o ? 1 : 0.25));
    showTip(event, `<b>${esc(o.track)}</b>${esc(o.artist)}<br>${o.peak} plays in the week of ${longDay(parseDay(o.peakWeek))}<br>` +
      `<span class="k">${o.total} plays in total; ${pct(o.nearPeakShare)} of them within a week of the peak</span>`);
  };
  const clear = () => { rows.attr("opacity", 1); hideTip(); };
  rows.on("pointermove", show).on("pointerleave", clear);
  keyboardTour(svg, paths, show, clear);
  const top = obs[0];
  setText("obs-title", `I played “${top.track}” ${top.peak} times in a single week.`);
}

/* ================= 4. Canserbero spotlight ================= */
const spot = { isolated: null, progress: REDUCED ? 1 : 0 };
function drawSpotlight() {
  const S = D.spotlight, root = document.getElementById("spotlight");
  root.innerHTML = "";
  const W = widthOf(root), H = heightOf(root, 340), inset = insetOf(), bottom = 26;
  const years = Object.entries(S.yearHours), maxYear = d3.max(years, ([, h]) => h);
  document.getElementById("spot-years").innerHTML = years.map(([yr, h]) =>
    `<div class="year"><span>${yr}</span><span class="big">${fmtH(h)} h</span><span class="swatch" style="width:${Math.max(4, (100 * h) / maxYear)}%"></span></div>`).join("");
  /* Only the top three songs get a colour, all from Canserbero's lime family; the rest stay grey. */
  const SONG_COLORS = [ACCENT, NEUTRAL_HI, "#6f9a22"];
  const songColor = s => (s >= 0 && s < SONG_COLORS.length ? SONG_COLORS[s] : OTHER);
  const legend = document.getElementById("spot-legend");
  legend.innerHTML = S.songs.slice(0, SONG_COLORS.length).map((s, i) => `<li><button type="button" data-song="${i}" aria-pressed="${spot.isolated === i}"><i style="background:${SONG_COLORS[i]}"></i>${esc(s)} · ${S.songPlays[i]}</button></li>`).join("") +
    `<li><i style="background:${OTHER}"></i>Other songs</li>`;
  legend.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
    const s = +b.dataset.song; spot.isolated = spot.isolated === s ? null : s;
    legend.querySelectorAll("button").forEach(o => o.setAttribute("aria-pressed", String(+o.dataset.song === spot.isolated)));
    paint();
  }));
  const dpr = devicePixelRatio || 1;
  const canvas = d3.select(root).append("canvas").attr("width", W * dpr).attr("height", H * dpr).style("width", `${W}px`).style("height", `${H}px`)
    .attr("role", "img").attr("aria-label", `Every ${S.artist} play as a dot, by date and hour of day`).node();
  const ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr);
  const x = d3.scaleTime().domain([FIRST_DAY, parseDay(D.meta.lastDay)]).range([4, W - 4]);
  const y = d3.scaleLinear().domain([0, 24]).range([8, H - bottom]);
  const pts = S.points.map(([day, hr, song], i) => ({ px: x(new Date(+FIRST_DAY + (day + jitter(i)) * DAY_MS)), py: y(hr + 0.1 + 0.8 * jitter(i + 7)), day, hr, song }));
  const r = isPhone() ? 1.4 : 2;
  function paint() {
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = "#232329"; ctx.fillStyle = "#8b8a94"; ctx.font = "12px system-ui, sans-serif"; ctx.textBaseline = "middle";
    [0, 6, 12, 18].forEach(h => { ctx.beginPath(); ctx.moveTo(0, y(h)); ctx.lineTo(W, y(h)); ctx.stroke(); });
    d3.timeYear.range(d3.timeYear.ceil(x.domain()[0]), x.domain()[1]).forEach(d => {
      ctx.beginPath(); ctx.moveTo(x(d), 0); ctx.lineTo(x(d), H - bottom); ctx.stroke();
      ctx.textAlign = "center"; ctx.fillText(d.getFullYear(), x(d), H - 9);
    });
    const upto = Math.round(pts.length * spot.progress);
    for (let i = 0; i < upto; i++) {
      const p = pts[i], on = spot.isolated === null || p.song === spot.isolated;
      ctx.globalAlpha = on ? 0.9 : 0.06;
      ctx.fillStyle = on ? songColor(p.song) : "#555";
      ctx.beginPath(); ctx.arc(p.px, p.py, r, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "left"; ctx.fillStyle = "#c4c3bb";
    /* Hour labels sit on a page-coloured plate so no gridline or dot runs through them. */
    [0, 6, 12, 18].forEach(h => {
      const ly = y(h) + 11, lw = ctx.measureText(hh(h)).width;
      ctx.fillStyle = "#09090b"; ctx.fillRect(inset - 4, ly - 9, lw + 8, 18);
      ctx.fillStyle = "#c4c3bb"; ctx.fillText(hh(h), inset, ly);
    });
  }
  paint();
  if (spot.progress < 1) revealOnView("spotlight", root, () => {
    const timer = d3.timer(elapsed => { spot.progress = Math.min(1, d3.easeCubicInOut(Math.min(1, elapsed / 2600))); paint(); if (spot.progress >= 1) timer.stop(); });
  });
  const delaunay = d3.Delaunay.from(pts, p => p.px, p => p.py);
  canvas.addEventListener("pointermove", event => {
    const [mx, my] = d3.pointer(event, canvas), i = delaunay.find(mx, my), p = pts[i];
    if (!p || Math.hypot(p.px - mx, p.py - my) > 14) { hideTip(); return; }
    showTip(event, `<b>${esc(p.song >= 0 ? S.songs[p.song] : "Another song")}</b>${longDay(new Date(+FIRST_DAY + p.day * DAY_MS))}, around ${hh(p.hr)}`);
  });
  canvas.addEventListener("pointerleave", hideTip);
  const y0 = years[0], peakYear = years.reduce((a, b) => (b[1] > a[1] ? b : a));
  setText("spot-title", `${S.artist} went from ${fmtH(y0[1])} hours in ${y0[0]} to ${fmtH(peakYear[1])} hours in ${peakYear[0]}.`);
  setText("spot-sub", `${fmt(S.plays)} plays and ${fmtH(S.hours)} hours on ${S.activeDays} different days, with a longest run of ${S.longestStreak} days in a row. ` +
    `Each dot is one play, by date and hour of day; my three most played songs are lit, and clicking one isolates it.`);
}

/* ================= 5. Day clock ================= */
function drawClock() {
  const root = document.getElementById("clock");
  root.innerHTML = "";
  const W = widthOf(root), H = heightOf(root, Math.min(widthOf(root), 420));
  const size = Math.min(W, H), R = size / 2 - 44 /* room for hour labels */, r0 = R * 0.3, ring = (R - r0) / 7;
  const cells = D.clock, maxPlays = d3.max(cells, c => c.plays);
  // Domain starts at the quietest cell, not zero, so the ramp spends its range on real differences.
  const color = d3.scaleSequential(d3.interpolateRgbBasis(HEAT)).domain([d3.min(cells, c => c.plays), maxPlays]);
  const svg = d3.select(root).append("svg").attr("width", W).attr("height", H).attr("role", "img")
    .attr("aria-label", "Radial heat map of plays by hour of day and weekday");
  const g = svg.append("g").attr("transform", `translate(${W / 2},${H / 2})`);
  /* A gap at midnight holds the weekday names, so they never sit on top of cells. */
  const GAP = size >= 360 ? 0.42 : 0.18;
  const angle = h => GAP / 2 + (h / 24) * (2 * Math.PI - GAP);
  const arc = d3.arc().innerRadius(c => r0 + c.dow * ring + 1).outerRadius(c => r0 + (c.dow + 1) * ring - 1)
    .startAngle(c => angle(c.hr)).endAngle(c => angle(c.hr + 1)).padAngle(0.012).cornerRadius(2);
  const waiting = isWaiting("clock");
  const paths = g.selectAll("path").data(cells).join("path").attr("d", arc).attr("fill", c => color(c.plays)).attr("opacity", waiting ? 0 : 1);
  if (waiting) revealOnView("clock", root, () => paths.transition().delay(c => c.hr * 45 + c.dow * 12).duration(500).attr("opacity", 1));
  d3.range(0, 24, size < 420 ? 6 : 3).forEach(h => {
    const a = angle(h);
    g.append("text").attr("x", Math.sin(a) * (R + 16)).attr("y", -Math.cos(a) * (R + 16) + 4).attr("text-anchor", "middle").text(hh(h));
  });
  if (size >= 360) DAYS_SHORT.forEach((d, i) => {
    g.append("text").attr("x", 0).attr("y", -(r0 + (i + 0.5) * ring) + 4).attr("text-anchor", "middle")
      .style("font-size", "12px").style("fill", "var(--ink-2)").text(d);
  });
  const peak = cells.reduce((a, b) => (b.plays > a.plays ? b : a));
  const big = g.append("text").attr("text-anchor", "middle").attr("y", -6).style("fill", "var(--ink)").style("font-size", `${Math.max(16, r0 * 0.28)}px`).style("font-weight", 650);
  const small = g.append("text").attr("text-anchor", "middle").attr("y", 16).style("fill", "var(--ink-2)").style("font-size", "12px");
  const center = c => { big.text(`${DAYS_SHORT[c.dow]} ${hh(c.hr)}`); small.text(`${fmt(c.plays)} plays · ${c.top}`); };
  center(peak);
  const show = (event, c) => {
    paths.attr("opacity", d => (d === c ? 1 : 0.35)).attr("stroke", d => (d === c ? "var(--ink)" : null)).attr("stroke-width", 1.5);
    center(c);
    showTip(event, `<b>${DAYS[c.dow]}s, ${hh(c.hr)}–${hh((c.hr + 1) % 24)}</b>${fmt(c.plays)} plays, ${fmtH(c.hours)} hours<br>Most played: ${esc(c.top)} (${c.topPlays})`);
  };
  const clear = () => { paths.attr("opacity", 1).attr("stroke", null); center(peak); hideTip(); };
  paths.on("pointermove", show).on("pointerleave", clear);
  keyboardTour(svg, paths, show, clear);
  const total = d3.sum(cells, c => c.plays), night = d3.sum(cells.filter(c => c.hr < 6), c => c.plays);
  setText("clock-title", `My music peaks on ${DAYS[peak.dow]}s at ${hh(peak.hr)}; only ${pct(night / total)} of it plays between midnight and 6.`);
}

/* ================= 6. Skips ================= */
function drawSkips() {
  const K = D.skips, root = document.getElementById("skips");
  root.innerHTML = "";
  const W = widthOf(root), H = heightOf(root, 420), inset = insetOf();
  const worstHour = K.hours.reduce((a, b) => (b[1] > a[1] ? b : a));
  document.getElementById("skip-chips").innerHTML = [
    ["", pct1(K.overall), "of all plays skipped"], ["", pct1(K.mode.shuffle), "on shuffle"], ["", pct1(K.mode.chosen), "when I chose the order"],
    ["", hh(worstHour[0]), `most impatient hour (${pct(worstHour[1])})`],
  ].map(([c, v, l]) => `<div class="${c}"><b>${v}</b>${esc(l)}</div>`).join("");
  const arts = K.artists.map(([name, rate, n]) => ({ name, rate, n }));
  const x = d3.scaleLinear().domain([0, d3.max(arts, a => a.rate) * 1.08]).range([inset + 10, W - inset - 10]);
  const rad = d3.scaleSqrt().domain([0, d3.max(arts, a => a.n)]).range([5, Math.min(isPhone() ? 26 : 64, H * 0.13)]);
  const mid = (H - 28) / 2;
  arts.forEach(a => { a.x = x(a.rate); a.y = mid; });
  const sim = d3.forceSimulation(arts).force("x", d3.forceX(a => x(a.rate)).strength(0.9)).force("y", d3.forceY(mid).strength(0.06))
    .force("collide", d3.forceCollide(a => rad(a.n) + 1.5)).stop();
  for (let i = 0; i < 220; i++) sim.tick();
  arts.forEach(a => { a.y = Math.max(rad(a.n) + 4, Math.min(H - 30 - rad(a.n), a.y)); });
  const svg = d3.select(root).append("svg").attr("width", W).attr("height", H).attr("role", "img")
    .attr("aria-label", "Bubble strip of artists by skip rate, sized by plays");
  const ticks = x.ticks(6);
  svg.append("g").selectAll("line").data(ticks).join("line").attr("x1", x).attr("x2", x).attr("y1", 0).attr("y2", H - 24).attr("stroke", "#232329");
  svg.append("g").selectAll("text").data(ticks).join("text").attr("x", x).attr("y", H - 8).attr("text-anchor", "middle").text(pct);
  svg.append("line").attr("x1", x(K.overall)).attr("x2", x(K.overall)).attr("y1", 0).attr("y2", H - 24).attr("stroke", "var(--ink-2)").attr("stroke-dasharray", "4 4");
  svg.append("text").attr("x", x(K.overall) + 6).attr("y", 14).style("fill", "var(--ink-2)").text(`average ${pct1(K.overall)}`);
  svg.append("text").attr("x", inset).attr("y", 14).text("let it play");
  svg.append("text").attr("x", W - inset).attr("y", 14).attr("text-anchor", "end").text("skip it");
  const waiting = isWaiting("skips");
  const dots = svg.append("g").selectAll("circle").data(arts).join("circle").attr("cx", a => a.x).attr("cy", a => a.y)
    .attr("r", a => (waiting ? 0 : rad(a.n))).attr("fill", a => (isTop(a.name) ? colorOf(a.name) : OTHER)).attr("fill-opacity", 0.9).attr("stroke", "#09090b");
  if (waiting) revealOnView("skips", root, () => dots.transition().delay((_, i) => i * 35).duration(600).ease(d3.easeBackOut.overshoot(1.6)).attr("r", a => rad(a.n)));
  /* Labels: the extremes plus the top artists. A label outside its bubble must not cover another
     bubble or another label; anything that would is left to the tooltip. */
  const labels = svg.append("g").style("pointer-events", "none");
  const wanted = [...new Set([...arts.slice(0, 3), ...arts.slice(-3), ...arts.filter(a => isTop(a.name))])].sort((a, b) => b.n - a.n);
  /* Candidate spots per label: inside the bubble if it fits, else below, else above. */
  const spotsFor = a => {
    const w = a.name.length * 7, r = rad(a.n), side = { x0: a.x - w / 2, x1: a.x + w / 2 }, text = a.name;
    if (r * 2 > w + 6) return [{ ...side, y0: a.y - 8, y1: a.y + 8, ty: a.y + 4, inside: true, text }];
    const short = a.name.split(" ")[0], sw = short.length * 7.4;
    const spots = [];
    // A top artist whose full name is too long still gets its first name inside its own colour.
    if (isTop(a.name) && r * 2 > sw + 6) spots.push({ x0: a.x - sw / 2, x1: a.x + sw / 2, y0: a.y - 8, y1: a.y + 8, ty: a.y + 4, inside: true, text: short });
    return [...spots, { ...side, y0: a.y + r + 2, y1: a.y + r + 18, ty: a.y + r + 14, text }, { ...side, y0: a.y - r - 18, y1: a.y - r - 2, ty: a.y - r - 6, text }];
  };
  const coversBubble = (b, self) => arts.some(o => o !== self && o.x + rad(o.n) > b.x0 && o.x - rad(o.n) < b.x1 && o.y + rad(o.n) > b.y0 && o.y - rad(o.n) < b.y1);
  const taken = [];
  const free = b => !taken.some(p => b.x0 < p.x1 && b.x1 > p.x0 && b.y0 < p.y1 && b.y1 > p.y0);
  wanted.forEach(a => {
    const b = spotsFor(a).find(s => free(s) && (s.inside || (!coversBubble(s, a) && s.y0 > 18 && s.y1 < H - 26)));
    if (!b) return; // left to the tooltip
    taken.push(b);
    const t = labels.append("text").attr("x", a.x).attr("y", b.ty).attr("text-anchor", "middle").text(b.text);
    if (b.inside) labelOn(t, isTop(a.name) ? colorOf(a.name) : OTHER);
    else t.style("fill", "var(--ink-2)").style("font-size", "12px").attr("paint-order", "stroke").attr("stroke", "#09090b").attr("stroke-width", 3);
  });
  const show = (event, a) => {
    dots.attr("opacity", d => (d === a ? 1 : 0.25)).attr("stroke", d => (d === a ? "var(--ink)" : "#09090b")).attr("stroke-width", d => (d === a ? 2 : 1));
    showTip(event, `<b>${esc(a.name)}</b>${pct1(a.rate)} skipped out of ${fmt(a.n)} plays`);
  };
  const clear = () => { dots.attr("opacity", 1).attr("stroke", "#09090b").attr("stroke-width", 1); hideTip(); };
  dots.on("pointermove", show).on("pointerleave", clear);
  keyboardTour(svg, dots, show, clear);
  const low = arts[0], high = arts.at(-1), sameish = Math.abs(K.mode.shuffle - K.mode.chosen) < 0.01;
  setText("skip-title", sameish
    ? `Shuffle or not, I skip ${pct(K.overall)} of songs; ${low.name} almost never gets skipped.`
    : `I skip ${pct(K.overall)} of songs, ${pct1(K.mode.shuffle)} on shuffle against ${pct1(K.mode.chosen)} when I pick.`);
  setText("skip-sub", `${low.name} is the artist I skip least (${pct1(low.rate)}), ${high.name} the most (${pct1(high.rate)}). ` +
    `Each bubble is an artist with at least ${K.minPlays} plays, sized by plays; further left means I let the songs play.`);
  setText("skip-how", `A skip is any play shorter than ${D.meta.skipMs / 1000} seconds, the same threshold Spotify uses to count a stream. ` +
    `Spotify's own "skipped" flag is missing for 2021, so duration is the only measure that is consistent across all years.`);
}

/* ================= 7. Travel map ================= */
const travel = { view: "world" };
function drawTravel() {
  const root = document.getElementById("travel");
  root.innerHTML = "";
  const W = widthOf(root), H = heightOf(root, Math.round(widthOf(root) * 0.62)), inset = insetOf(); // phones: map height follows its width
  const byId = new Map(D.travel.map(t => [t.id, t]));
  const world = window.WORLD, home = world.features.find(f => +f.id === byId.get(724)?.id);
  const visited = world.features.filter(f => byId.has(+f.id));
  const europe = { type: "FeatureCollection", features: visited.filter(f => { const [lon, lat] = d3.geoCentroid(f); return lon > -25 && lon < 40 && lat > 34; }) };
  const projection = d3.geoNaturalEarth1();
  const fit = view => { projection.fitExtent([[inset, 36], [W - inset, H - 12]], view === "europe" ? europe : world); return [projection.scale(), projection.translate()]; };
  fit(travel.view);
  const path = d3.geoPath(projection);
  const hours = d3.scaleSequentialLog(d3.interpolateRgbBasis(HEAT.slice(1))).domain(d3.extent(D.travel, t => t.hours));
  const width = d3.scaleSqrt().domain([0, d3.max(D.travel.filter(t => t.cc !== "ES"), t => t.hours)]).range([0.8, 7]);
  const svg = d3.select(root).append("svg").attr("width", W).attr("height", H).attr("role", "img")
    .attr("aria-label", "World map of countries where I listened, with arcs from Spain sized by hours");
  const bar = d3.select(root).insert("div", "svg").attr("class", "map-zoom");
  bar.append("span").text("Zoom to");
  const switcher = bar.append("div").attr("class", "view-switch").attr("role", "group").attr("aria-label", "Map zoom");
  ["world", "europe"].forEach(v => switcher.append("button").attr("type", "button").attr("aria-pressed", String(travel.view === v)).text(v === "world" ? "World" : "Europe")
    .on("click", () => { if (travel.view === v) return; travel.view = v; switcher.selectAll("button").attr("aria-pressed", function () { return String(this.textContent.toLowerCase() === v); }); flyTo(v); }));
  const sphere = svg.append("path").datum({ type: "Sphere" }).attr("fill", "#0e0e12").attr("stroke", "#1b1b20");
  const lands = svg.append("g").selectAll("path").data(world.features).join("path")
    .attr("fill", f => (byId.has(+f.id) ? hours(byId.get(+f.id).hours) : "#16161b")).attr("stroke", "#09090b").attr("stroke-width", 0.5);
  const origin = d3.geoCentroid(home);
  const trips = D.travel.filter(t => t.cc !== "ES").map(t => {
    const f = world.features.find(g => +g.id === t.id), dest = d3.geoCentroid(f), interp = d3.geoInterpolate(origin, dest);
    return { t, dest, line: { type: "LineString", coordinates: d3.range(0, 1.0001, 1 / 48).map(interp) } };
  });
  const arcs = svg.append("g").selectAll("path").data(trips).join("path").attr("fill", "none").attr("stroke", NEUTRAL_HI).attr("stroke-opacity", 0.7)
    .attr("stroke-width", d => width(d.t.hours)).attr("stroke-linecap", "round").style("pointer-events", "none");
  const pins = svg.append("g").selectAll("circle").data(trips).join("circle").attr("r", d => 2 + width(d.t.hours) * 0.6).attr("fill", NEUTRAL_HI).style("pointer-events", "none");
  const homePin = svg.append("circle").attr("r", 5).attr("fill", "var(--ink)").attr("class", "halo");
  const labels = svg.append("g").style("pointer-events", "none");
  const labelled = D.travel.slice(0, isPhone() ? 4 : 10);
  function place() {
    sphere.attr("d", path); lands.attr("d", path); arcs.attr("d", d => path(d.line));
    pins.attr("transform", d => `translate(${projection(d.dest)})`);
    homePin.attr("transform", `translate(${projection(origin)})`);
    /* Biggest countries first; a label that would overlap one already placed is dropped. */
    const placed = [];
    const shown = labelled.map(t => {
      const [px, py] = projection(d3.geoCentroid(world.features.find(g => +g.id === t.id)));
      const w = (t.name.length + 8) * 6.6;
      // Spain is where every arc starts, so its label sits below-left of the origin pin.
      return t.cc === "ES" ? { t, px: px - w - 6, py: py + 20, w } : { t, px: px + 8, py: py - 8, w };
    }).filter(l => {
      const hit = l.px < 0 || l.px + l.w > W || l.py < 30 || l.py > H || placed.some(p => l.px < p.px + p.w && l.px + l.w > p.px && Math.abs(l.py - p.py) < 16);
      if (!hit) placed.push(l);
      return !hit;
    });
    labels.selectAll("text").data(shown, l => l.t.cc).join("text").attr("transform", l => `translate(${l.px},${l.py})`)
      .style("fill", "var(--ink)").style("font-size", "12px").style("font-weight", 600).attr("paint-order", "stroke").attr("stroke", "#09090b").attr("stroke-width", 3)
      .text(l => `${l.t.name} · ${fmtH(l.t.hours)} h`);
  }
  function flyTo(view) {
    const from = [projection.scale(), projection.translate()], to = fit(view);
    const s = d3.interpolate(from[0], to[0]), tr = d3.interpolate(from[1], to[1]);
    if (REDUCED) { place(); return; }
    svg.transition().duration(1000).ease(d3.easeCubicInOut).tween("fly", () => t => { projection.scale(s(t)).translate(tr(t)); place(); });
  }
  place();
  if (isWaiting("travel")) {
    arcs.attr("stroke-dasharray", function () { const l = this.getTotalLength(); return `${l} ${l}`; }).attr("stroke-dashoffset", function () { return this.getTotalLength(); });
    pins.attr("opacity", 0);
    revealOnView("travel", root, () => {
      arcs.transition().delay((_, i) => i * 90).duration(1100).ease(d3.easeCubicInOut).attr("stroke-dashoffset", 0).on("end", function () { d3.select(this).attr("stroke-dasharray", null); });
      pins.transition().delay((_, i) => i * 90 + 1000).duration(300).attr("opacity", 1);
    });
  }
  const show = (event, f, node) => {
    const t = byId.get(+f.id);
    if (!t) { hideTip(); return; }
    lands.attr("stroke", "#09090b").attr("stroke-width", 0.5);
    d3.select(node).attr("stroke", "var(--ink)").attr("stroke-width", 1.2).raise();
    showTip(event, `<b>${esc(t.name)}</b>${fmtH(t.hours)} hours, ${fmt(t.plays)} plays<br>Top artist: ${esc(t.topArtist)}<br><span class="k">Top song: ${esc(t.topTrack)} (${esc(t.topTrackArtist)})</span>`);
  };
  const clear = () => { lands.attr("stroke", "#09090b").attr("stroke-width", 0.5); hideTip(); };
  lands.on("pointermove", function (event, f) { show(event, f, this); }).on("pointerleave", clear);
  /* Keyboard order follows hours, biggest first, the same order as the labels. */
  const order = new Map(D.travel.map((t, i) => [t.id, i]));
  keyboardTour(svg, lands.filter(f => byId.has(+f.id)).sort((a, b) => order.get(+a.id) - order.get(+b.id)), show, clear);
  const total = d3.sum(D.travel, t => t.hours), abroad = total - (byId.get(724)?.hours ?? 0);
  const second = D.travel[1];
  setText("travel-title", `${pct(abroad / total)} of my listening happened outside Spain, across ${D.travel.length - 1} countries; ${second.name} comes second with ${fmtH(second.hours)} hours.`);
}

/* ================= 8. Discovery ================= */
function drawDiscovery() {
  const V = D.discovery, root = document.getElementById("discovery");
  root.innerHTML = "";
  const W = widthOf(root), H = heightOf(root, 380), inset = insetOf();
  const mid = (H - 28) * 0.56;
  const x = d3.scaleBand().domain(d3.range(MONTHS.length)).range([0, W]).padding(0.18);
  const xt = d3.scaleTime().domain([MONTHS[0], d3.timeMonth.offset(MONTHS.at(-1), 1)]).range([0, W]);
  const up = d3.scaleLinear().domain([0, d3.max(V.newArtists)]).range([0, mid - 24]);
  const down = d3.scaleLinear().domain([0, d3.max(V.oldShare) * 1.1]).range([0, H - 28 - mid - 6]);
  const svg = d3.select(root).append("svg").attr("width", W).attr("height", H).attr("role", "img")
    .attr("aria-label", "Monthly new artists as bars above a centre line, and share of plays from long-known artists as an area below it");
  yearTicks(svg, xt, H, inset);
  const waiting = isWaiting("discovery");
  /* The export ends mid-month, so the last month is partial: drawn faded and said in the tooltip. */
  const lastDay = parseDay(D.meta.lastDay), lastIndex = MONTHS.length - 1;
  const partial = i => i === lastIndex && lastDay.getDate() < d3.timeDay.count(MONTHS[i], d3.timeMonth.offset(MONTHS[i], 1));
  const bars = svg.append("g").selectAll("rect").data(V.newArtists).join("rect").attr("x", (_, i) => x(i)).attr("width", x.bandwidth()).attr("rx", Math.min(3, x.bandwidth() / 2))
    .attr("fill", NEUTRAL_HI).attr("fill-opacity", (_, i) => (partial(i) ? 0.35 : 1))
    .attr("y", v => (waiting ? mid : mid - up(v))).attr("height", v => (waiting ? 0 : up(v)));
  const share = V.oldShare.map(v => v ?? 0);
  const area = d3.area().x((_, i) => x(i) + x.bandwidth() / 2).y0(mid + 3).y1(v => mid + 3 + down(v)).curve(d3.curveMonotoneX);
  const clip = wipeClip(svg, "discovery-area", root, W, H);
  svg.append("path").datum(share).attr("d", area).attr("fill", NEUTRAL_LO).attr("fill-opacity", 0.3).attr("stroke", NEUTRAL_LO).attr("stroke-width", 1.5).attr("clip-path", clip);
  svg.append("line").attr("x1", 0).attr("x2", W).attr("y1", mid + 1.5).attr("y2", mid + 1.5).attr("stroke", "var(--axis)");
  if (waiting) revealOnView("discovery", root, () => bars.transition().delay((_, i) => i * 14).duration(700).ease(d3.easeCubicOut).attr("y", v => mid - up(v)).attr("height", v => up(v)));
  down.ticks(2).filter(v => v > 0).forEach(v => {
    svg.append("line").attr("x1", 0).attr("x2", W).attr("y1", mid + 3 + down(v)).attr("y2", mid + 3 + down(v)).attr("stroke", "#232329").attr("stroke-dasharray", "2 4");
    svg.append("text").attr("x", inset).attr("y", mid + 3 + down(v) - 4).style("fill", "var(--ink-2)").style("font-size", "12px")
      .attr("paint-order", "stroke").attr("stroke", "#09090b").attr("stroke-width", 3).text(`${pct(v)} old friends`);
  });
  const best = d3.maxIndex(V.newArtists);
  svg.append("text").attr("x", Math.min(W - inset, Math.max(inset, x(best) + x.bandwidth() / 2))).attr("y", mid - up(V.newArtists[best]) - 8)
    .attr("text-anchor", x(best) > W - 160 ? "end" : "middle").style("fill", "var(--ink)").style("font-weight", 600).text(`${V.newArtists[best]} new in ${monthName(MONTHS[best])}`);
  const hit = svg.append("g").selectAll("rect").data(MONTHS).join("rect").attr("x", (_, i) => x(i) - x.step() * x.paddingInner() / 2).attr("width", x.step()).attr("y", 0).attr("height", H - 24).attr("fill", "transparent");
  const show = (event, m) => {
    const i = MONTHS.indexOf(m);
    bars.attr("opacity", (_, j) => (j === i ? 1 : 0.35));
    showTip(event, `<b>${monthName(m)}${partial(i) ? ` (to ${longDay(lastDay)})` : ""}</b>${V.newArtists[i]} artists heard for the first time<br>${V.oldShare[i] == null ? "No plays" : `${pct(V.oldShare[i])} of ${fmt(V.plays[i])} plays went to artists known for over a year`}`);
  };
  const clear = () => { bars.attr("opacity", 1); hideTip(); };
  hit.on("pointermove", show).on("pointerleave", clear);
  keyboardTour(svg, hit, show, clear);
  setLegend("disc-legend", [["New artists that month (up)", NEUTRAL_HI], [`Share of plays from artists known over ${V.oldFriendDays} days (down)`, NEUTRAL_LO]]);
  const total = d3.sum(V.newArtists);
  setText("disc-title", `I met ${fmt(total)} new artists since ${MONTHS[0].getFullYear()}; ${monthName(MONTHS[best])} alone brought ${V.newArtists[best]}.`);
  setText("disc-sub", "Bars rise with the artists I played for the very first time each month. The area below grows when I went back to artists I had known for over a year: explorer months push up, comfort months pull down.");
}

/* ================= Ending ================= */
function drawEnding() {
  const m = D.meta, binge = D.obsessions[0];
  setText("end-title", `${fmt(m.plays)} plays, ${fmt(m.artists)} artists, ${D.travel.length} countries, and one song ${binge.peak} times in a week.`);
  setText("method-note", `${fmt(m.plays)} music plays, ${fmt(m.artists)} artists and ${fmt(m.tracks)} songs, ${longDay(FIRST_DAY)} to ${longDay(parseDay(m.lastDay))}. ` +
    "Earlier logs exist but are sparse, so the story starts in May 2021. Hours are time actually played; podcasts and video are left out. " +
    "Artist first plays use the full history back to 2014, so 2021's discovery numbers are slightly inflated. " +
    "Only aggregates are published: no raw plays, no IP addresses, no exact timestamps.");
  document.getElementById("to-start").addEventListener("click", () => {
    document.getElementById("s-hero").scrollIntoView({ behavior: REDUCED ? "auto" : "smooth" });
  });
}

/* Thin bar under the banner that fills as the story is read. */
function trackProgress() {
  const fill = document.getElementById("progress");
  let queued = false;
  const update = () => {
    queued = false;
    const room = document.documentElement.scrollHeight - innerHeight;
    fill.style.transform = `scaleX(${room > 0 ? Math.min(1, scrollY / room) : 0})`;
  };
  addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener("resize", update);
  update();
}

const drawCharts = () => { drawRiver(); drawRace(); drawObsessions(); drawSpotlight(); drawClock(); drawSkips(); drawTravel(); drawDiscovery(); };
drawHero();
drawEnding();
trackProgress();
drawAll(drawCharts);
redrawOnResize(drawCharts);
