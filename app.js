/* Five years listening: one draw function per screen. Data comes from data.js (window.DATA),
   the map from world.js (window.WORLD), shared helpers from helpers.js. */
"use strict";

const D = window.DATA;
const SLOTS = ["#b4f03c", "#ff4fa0", "#2ec5ff", "#ffb22e", "#9b7bff", "#ff6a3d", "#3fe0b0"];
const OTHER = "#5c5b64";
const ACCENT = SLOTS[0]; // lime: Canserbero and the page chrome
/* Three more artist colours, only for race bars 8 to 10, which outlast the seven river artists. */
const RACE_EXTRA = ["#f9f871", "#4f7dff", "#ff9ec7"];
/* Genres reuse the slots in order; the biggest artist of each genre already wears that colour. */
const GENRE_COLORS = SLOTS;
/* Cohorts run in year order, cool to warm, with artists known before 2021 in grey. */
const COHORT_COLORS = ["#6d6c78", "#9b7bff", "#2ec5ff", "#3fe0b0", "#b4f03c", "#ffb22e", "#ff4fa0"];
/* Map: hours from few (deep violet) to many (pale yellow). */
const MAP_RAMP = ["#2b2158", "#6a3fd6", "#c34fd6", "#ff4fa0", "#ff9b3d", "#f9f871"];
const HALO = "rgba(0,0,0,.6)";
const ON_NEON = "#09090b";

const fmt = d3.format(",");
const pct = d3.format(".0%");
const pct1 = d3.format(".1%");
const fmtH = h => (h >= 10 ? fmt(Math.round(h)) : d3.format(".1f")(h));
const parseDay = d3.timeParse("%Y-%m-%d");
const monthName = d3.timeFormat("%b %Y");
const longDay = d3.timeFormat("%-d %b %Y");
const MONTHS = D.months.map(parseDay);
const FIRST_DAY = parseDay(D.meta.firstDay);
const LAST_DAY = parseDay(D.meta.lastDay);
const DAY_MS = 864e5;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const colorOf = name => {
  const i = D.artists.indexOf(name);
  if (i >= 0) return SLOTS[i];
  const j = D.race.names.indexOf(name) - D.artists.length;
  return j >= 0 && j < RACE_EXTRA.length ? RACE_EXTRA[j] : OTHER;
};
const genreColor = g => (g >= 0 ? GENRE_COLORS[g] : OTHER);
const monthFull = doy => d3.timeFormat("%B")(new Date(2021, 0, Math.round(doy)));
const setText = (id, text) => { document.getElementById(id).textContent = text; };
/* Headlines: plain text, with the one key number wrapped so it carries the accent, as in the hero.
   Usage: headline("id")`text ${N(number)} text`; only values wrapped in N() are highlighted. */
const N = value => ({ num: String(value) });
const headline = id => (strings, ...values) => {
  document.getElementById(id).innerHTML = strings.reduce((html, part, i) => {
    if (i >= values.length) return html + esc(part);
    const v = values[i];
    return html + esc(part) + (v && v.num !== undefined ? `<span class="num">${esc(v.num)}</span>` : esc(v));
  }, "");
};
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
  const m = D.meta, total = Math.round(m.hours);
  document.getElementById("hero-title").innerHTML = `<span class="sr-only">${fmt(total)} </span>hours of music.`;
  setText("hero-lede", `Every dot above is one hour, coloured by my seven most played artists. Between ${longDay(FIRST_DAY)} and ${longDay(LAST_DAY)} ` +
    `I pressed play ${fmt(m.plays)} times, ${Math.round(m.hours / 24)} full days and nights of sound.`);
  const stats = [[m.plays, "plays"], [m.artists, "artists"], [m.tracks, "different songs"], [m.topDay.hours, `hours on my biggest day, ${longDay(parseDay(m.topDay.date))}`]];
  const box = document.getElementById("stats");
  box.innerHTML = stats.map(([, label]) => `<div class="stat"><b>0</b><span>${esc(label)}</span></div>`).join("");
  box.querySelectorAll("b").forEach((el, i) => {
    const [value] = stats[i];
    const show = v => { el.textContent = Number.isInteger(value) ? fmt(Math.round(v)) : d3.format(".1f")(v); };
    if (REDUCED) { show(value); return; }
    d3.select(el).transition().delay(1400 + i * 120).duration(1600).ease(d3.easeCubicOut)
      .tween("count", () => { const f = d3.interpolateNumber(0, value); return t => show(f(t)); });
  });
  heroSwarm(total);
}

/* One particle per hour of music. They fly in from everywhere, settle into the headline number,
   shy away from the pointer, and scatter as the visitor scrolls on. */
const SWARM = { spring: 0.022, damping: 0.86, pushRadius: 90, push: 2.4, scatter: 1.1, otherColor: "#e6e5df" };
function heroSwarm(total) {
  const hero = document.getElementById("s-hero"), canvas = document.getElementById("hero-swarm"), box = document.getElementById("hero-number");
  const ctx = canvas.getContext("2d");
  /* Colours: each top artist gets as many particles as hours; everyone else is ink. Shuffled so colour is confetti, not stripes. */
  const colors = [];
  D.artists.forEach((_, k) => { for (let i = 0; i < Math.round(D.artistHours[k]); i++) colors.push(k); });
  while (colors.length < total) colors.push(-1);
  colors.length = total;
  d3.shuffler(d3.randomLcg(7))(colors);
  const rand = d3.randomLcg(42);
  const P = colors.map((c, i) => ({ c, x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, sx: 0, sy: 0, seed: rand(), delay: rand() * 900 + (i % 7) * 30 }));
  const groups = [-1, ...D.artists.map((_, k) => k)].map(c => ({ fill: c < 0 ? SWARM.otherColor : SLOTS[c], items: P.filter(p => p.c === c) }));
  let W = 0, H = 0, dot = 1.5, pointer = { x: -1e4, y: -1e4 }, start = null, frame = 0, visible = true, placed = false;

  function layout() {
    const dpr = devicePixelRatio || 1;
    W = hero.clientWidth; H = hero.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const hr = hero.getBoundingClientRect(), br = box.getBoundingClientRect();
    const bx = br.left - hr.left, by = br.top - hr.top, bw = Math.max(1, Math.floor(br.width)), bh = Math.max(1, Math.floor(br.height));
    /* Draw the number off screen, then sample its pixels on a grid fine enough for one point per particle. */
    const off = document.createElement("canvas"); off.width = bw; off.height = bh;
    const o = off.getContext("2d"), text = fmt(total), family = 'system-ui, -apple-system, "Segoe UI", sans-serif';
    let size = bh * 1.18;
    o.font = `800 ${size}px ${family}`;
    const tw = o.measureText(text).width;
    if (tw > bw) { size *= bw / tw; o.font = `800 ${size}px ${family}`; }
    o.textBaseline = "alphabetic"; o.textAlign = "center"; o.fillStyle = "#fff";
    const metrics = o.measureText(text), textH = metrics.actualBoundingBoxAscent;
    o.fillText(text, bw / 2, (bh + textH) / 2);
    const img = o.getImageData(0, 0, bw, bh).data;
    let filled = 0;
    for (let i = 3; i < img.length; i += 4) if (img[i] > 128) filled++;
    const step = Math.max(1.6, Math.sqrt(filled / total));
    const targets = [];
    for (let y = step / 2; y < bh; y += step) for (let x = step / 2; x < bw; x += step) {
      if (img[(Math.floor(y) * bw + Math.floor(x)) * 4 + 3] > 128) targets.push([bx + x, by + y]);
    }
    if (!targets.length) { setTimeout(() => { layout(); paint(); }, 120); return; } // box not laid out yet: try again shortly
    d3.shuffler(d3.randomLcg(3))(targets);
    dot = Math.max(1.5, step * 0.62);
    P.forEach((p, i) => {
      const [tx, ty] = targets[i % targets.length];
      p.tx = tx; p.ty = ty;
      const a = p.seed * Math.PI * 2;
      p.sx = Math.cos(a) * W * SWARM.scatter * (0.4 + p.seed); p.sy = H * (0.6 + p.seed) + Math.sin(a) * H * 0.3;
      if (!placed) {
        if (REDUCED) { p.x = tx; p.y = ty; }
        else { const b = rand() * Math.PI * 2, r = Math.max(W, H) * (0.6 + rand() * 0.5); p.x = W / 2 + Math.cos(b) * r; p.y = H / 2 + Math.sin(b) * r; }
      }
    });
    placed = true;
  }
  const scrolled = () => Math.min(1, Math.max(0, -hero.getBoundingClientRect().top / Math.max(1, H)));
  function step(t) {
    if (start === null) start = t;
    const age = t - start, s = d3.easeCubicIn(scrolled());
    for (const p of P) {
      if (age < p.delay) continue;
      const tx = p.tx + p.sx * s + Math.sin(t / 900 + p.seed * 40) * 0.7, ty = p.ty + p.sy * s + Math.cos(t / 1100 + p.seed * 30) * 0.7;
      let ax = (tx - p.x) * SWARM.spring, ay = (ty - p.y) * SWARM.spring;
      const dx = p.x - pointer.x, dy = p.y - pointer.y, d2 = dx * dx + dy * dy;
      if (d2 < SWARM.pushRadius * SWARM.pushRadius && d2 > 0.01) {
        const d = Math.sqrt(d2), f = (1 - d / SWARM.pushRadius) * SWARM.push;
        ax += (dx / d) * f; ay += (dy / d) * f;
      }
      p.vx = (p.vx + ax) * SWARM.damping; p.vy = (p.vy + ay) * SWARM.damping;
      p.x += p.vx; p.y += p.vy;
    }
  }
  function paint() {
    ctx.clearRect(0, 0, W, H);
    for (const g of groups) {
      ctx.fillStyle = g.fill;
      ctx.globalAlpha = g.fill === SWARM.otherColor ? 0.9 : 1;
      for (const p of g.items) ctx.fillRect(p.x - dot / 2, p.y - dot / 2, dot, dot);
    }
    ctx.globalAlpha = 1;
  }
  function loop() {
    cancelAnimationFrame(frame);
    const tick = t => { step(t); paint(); if (visible) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
  }
  layout();
  paint();
  if (REDUCED) { addEventListener("resize", () => { placed = false; layout(); paint(); }); return; }
  hero.addEventListener("pointermove", e => { const r = hero.getBoundingClientRect(); pointer = { x: e.clientX - r.left, y: e.clientY - r.top }; });
  hero.addEventListener("pointerleave", () => { pointer = { x: -1e4, y: -1e4 }; });
  new IntersectionObserver(e => { visible = e[0].isIntersecting; if (visible) loop(); }).observe(hero);
  addEventListener("resize", () => { layout(); paint(); });
  loop();
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
    /* For each band, try its thickest months in turn; a spot counts only if the label stays inside
       its own band along its whole width, so it never spills onto a neighbour. */
    const fitsInBand = (s, cx, cy, w) => MONTHS.every((mo, m) => {
      const mx = x(mo);
      return mx < cx - w / 2 || mx > cx + w / 2 || (y(s[m][1]) < cy - 8 && y(s[m][0]) > cy + 8);
    });
    const spots = stack.map((s, k) => {
      const w = D.artists[k].length * 7.6 + 8;
      const tries = d3.range(MONTHS.length).sort((a, b) => (s[b][1] - s[b][0]) - (s[a][1] - s[a][0])).slice(0, 12);
      for (const i of tries) {
        const cx = Math.min(W - inset - w / 2, Math.max(inset + w / 2, x(MONTHS[i]))), cy = y((s[i][0] + s[i][1]) / 2);
        if (fitsInBand(s, cx, cy, w)) return { k, cx, cy, w, thick: y(s[i][0]) - y(s[i][1]) };
      }
      return null;
    }).filter(Boolean).sort((a, b) => b.thick - a.thick);
    placeWithoutOverlap(spots, p => ({ x0: p.cx - p.w / 2, x1: p.cx + p.w / 2, y0: p.cy - 9, y1: p.cy + 9 })).forEach(p => {
      labelOn(labels.append("text").attr("x", p.cx).attr("y", p.cy + 4).attr("text-anchor", "middle").text(D.artists[p.k]), SLOTS[p.k]);
    });
    if (isWaiting("river-labels")) revealOnView("river-labels", root, () => labels.transition().delay(MOTION_MS).duration(400).style("opacity", 1));
  }
  setLegend("river-legend", D.artists.map((a, k) => [esc(a), SLOTS[k]]));
  let best = { v: 0 };
  D.river.series.forEach((s, k) => s.forEach((v, m) => { if (v > best.v) best = { v, k, m }; }));
  headline("river-title")`${D.artists[best.k]} hit ${N(`${fmtH(best.v)} hours`)} in ${monthName(MONTHS[best.m])}: no artist ever had a bigger month.`;
}

/* ================= 2. Bar chart race ================= */
const race = { f: 0, playing: true, timer: null, started: false, render: null, speed: 1 };
const RACE_BARS = 10, RACE_BARS_PHONE = 6, RACE_MONTH_MS = 380;
function drawRace() {
  const root = document.getElementById("race");
  root.innerHTML = "";
  const W = widthOf(root), H = heightOf(root, 360), inset = insetOf();
  const nBars = isPhone() ? RACE_BARS_PHONE : RACE_BARS;
  const { names, cum } = D.race, last = MONTHS.length - 1;
  const svg = d3.select(root).append("svg").attr("width", W).attr("height", H).attr("role", "img")
    .attr("aria-label", "Animated bar chart race of cumulative listening hours per artist");
  const watermark = svg.append("text").attr("class", "race-month").attr("x", W - inset).attr("y", H - 16).attr("text-anchor", "end");
  const rowH = (H - 24) / nBars, barH = Math.max(14, rowH * 0.72);
  const left = inset, x = d3.scaleLinear().range([left, W - inset - 70]);
  const axis = svg.append("g");
  svg.append("clipPath").attr("id", "race-clip").append("rect").attr("width", W).attr("height", H - 24); // hide bars sliding out below the last rank
  const bars = svg.append("g").attr("clip-path", "url(#race-clip)");
  const rankAt = i => { const order = d3.range(names.length).sort((a, b) => cum[b][i] - cum[a][i]); const r = []; order.forEach((k, pos) => { r[k] = pos; }); return r; };
  const ranks = MONTHS.map((_, i) => rankAt(i));
  /* The month the final leader took first place for good: the title's claim, said beside the slider. */
  const leader = d3.range(names.length).sort((a, b) => cum[b][last] - cum[a][last])[0];
  let since = 0;
  for (let i = last; i >= 0; i--) if (ranks[i][leader] !== 0) { since = i + 1; break; }
  const before = since > 0 ? names[ranks[since - 1].indexOf(0)] : null;
  const scrub = document.getElementById("race-scrub");
  function render(f) {
    const i0 = Math.floor(f), i1 = Math.min(last, i0 + 1), t = f - i0, month = monthName(MONTHS[Math.round(f)]);
    const items = names.map((name, k) => ({ name, k, v: cum[k][i0] * (1 - t) + cum[k][i1] * t, r: ranks[i0][k] * (1 - t) + ranks[i1][k] * t }))
      .filter(d => d.r < nBars + 0.6);
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
    g.attr("transform", d => `translate(0,${d.r * rowH + (rowH - barH) / 2})`).attr("opacity", d => Math.max(0, Math.min(1, nBars + 0.6 - d.r)));
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
    g.on("pointermove", (event, d) => showTip(event, `<b>${esc(d.name)}</b>${fmt(Math.round(d.v))} hours by ${month}`)).on("pointerleave", hideTip);
    setText("race-note", before && f >= since ? `${names[leader]} takes #1 in ${monthName(MONTHS[since])}` : "");
    watermark.text(month);
    setText("race-label", month);
    scrub.value = f;
    scrub.setAttribute("aria-valuetext", month);
  }
  race.render = render;
  scrub.max = last;
  if (REDUCED && !race.started) { race.f = last; race.playing = false; }
  render(race.f);
  setPlayButton();
  if (!race.started) revealOnView("race", root, () => { race.started = true; if (race.playing) playRace(); });
  if (before) headline("race-title")`${names[leader]} passed ${before} in ${N(monthName(MONTHS[since]))} and never gave the lead back.`;
  else headline("race-title")`${names[leader]} led the race from the first month to the last.`;
}
const ICON_PLAY = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.2-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5z" fill="currentColor"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect x="3.5" y="2.5" width="3.2" height="11" rx="1" fill="currentColor"/><rect x="9.3" y="2.5" width="3.2" height="11" rx="1" fill="currentColor"/></svg>';
const ICON_REPLAY = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.2 8a4.8 4.8 0 1 0 1.5-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M2.6 2.4v3.2h3.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
/* Three states: playing (pause icon), paused mid-way (play icon), finished (replay icon and label). */
function setPlayButton() {
  const b = document.getElementById("race-play"), ended = !race.playing && race.f >= MONTHS.length - 1;
  b.innerHTML = race.playing ? ICON_PAUSE : ended ? ICON_REPLAY : ICON_PLAY;
  b.setAttribute("aria-label", race.playing ? "Pause race" : ended ? "Replay race" : "Play race");
  b.setAttribute("aria-pressed", String(race.playing));
  b.classList.toggle("ended", ended);
}
function playRace() {
  if (race.timer) race.timer.stop();
  const last = MONTHS.length - 1;
  if (race.f >= last) race.f = 0;
  race.playing = true; setPlayButton();
  let prev = null;
  race.timer = d3.timer(elapsed => {
    const dt = prev === null ? 0 : elapsed - prev; prev = elapsed;
    race.f = Math.min(last, race.f + (dt * race.speed) / RACE_MONTH_MS);
    race.render(race.f);
    if (race.f >= last) { race.timer.stop(); race.playing = false; setPlayButton(); }
  });
}
function pauseRace() { if (race.timer) race.timer.stop(); race.playing = false; setPlayButton(); }
document.getElementById("race-play").addEventListener("click", () => { race.started = true; if (race.playing) pauseRace(); else playRace(); });
document.querySelectorAll("#race-speed button").forEach(b => b.addEventListener("click", () => {
  race.speed = +b.dataset.speed;
  document.querySelectorAll("#race-speed button").forEach(o => o.setAttribute("aria-pressed", String(o === b)));
}));
document.getElementById("race-scrub").addEventListener("input", e => { pauseRace(); race.started = true; race.f = +e.target.value; race.render(race.f); });

/* ================= 3. Songs with a story ================= */
/* A song by a top artist keeps that artist's colour; the others take the colours no row uses yet. */
function storyColors(stories) {
  const own = stories.map(s => (D.artists.includes(s.artist) ? colorOf(s.artist) : null));
  const pool = [...SLOTS, ...RACE_EXTRA].filter(c => !own.includes(c));
  return own.map(c => c ?? pool.shift() ?? OTHER);
}
const dayDate = day => new Date(+FIRST_DAY + day * DAY_MS);
function drawStories() {
  const S = D.stories, root = document.getElementById("stories");
  root.innerHTML = "";
  const phone = isPhone(), W = widthOf(root), inset = insetOf();
  const H = heightOf(root, S.length * (phone ? 96 : 80) + 30);
  const rowH = (H - 30) / S.length;
  const labelW = phone ? 0 : Math.min(320, W * 0.26);
  const x = d3.scaleTime().domain([FIRST_DAY, LAST_DAY]).range([phone ? inset : inset + labelW + 20, W - inset]);
  const colors = storyColors(S);
  /* Weekly histogram per song: the shape of each story is a spike, a gap or a rhythm. */
  const nWeeks = Math.ceil(D.meta.spanDays / 7) + 1, weekDate = w => dayDate(w * 7 + 3);
  const weekly = S.map(s => { const v = new Array(nWeeks).fill(0); s.days.forEach(([day, n]) => { v[Math.floor(day / 7)] += n; }); return v; });
  const peak = d3.max(weekly, w => d3.max(w));
  const base = phone ? rowH - 14 : rowH - 16, room = phone ? rowH - 52 : rowH - 26;
  const y = d3.scaleSqrt().domain([0, peak]).range([0, room]);
  const svg = d3.select(root).append("svg").attr("width", W).attr("height", H).attr("role", "img")
    .attr("aria-label", `${S.length} songs with a story, one row each, plays per week`);
  yearTicks(svg, x, H, x.range()[0]);
  const defs = svg.append("defs");
  const glow = defs.append("filter").attr("id", "story-glow").attr("x", "-20%").attr("y", "-50%").attr("width", "140%").attr("height", "200%");
  glow.append("feGaussianBlur").attr("stdDeviation", 3).attr("result", "b");
  const merge = glow.append("feMerge"); merge.append("feMergeNode").attr("in", "b"); merge.append("feMergeNode").attr("in", "SourceGraphic");
  const rows = svg.append("g").selectAll("g").data(S).join("g").attr("transform", (_, i) => `translate(0,${i * rowH})`);
  rows.append("rect").attr("x", 0).attr("width", W).attr("height", rowH).attr("fill", "transparent");
  rows.append("line").attr("x1", x.range()[0]).attr("x2", x.range()[1]).attr("y1", base).attr("y2", base).attr("stroke", "#232329");
  const [y0, y1] = [FIRST_DAY.getFullYear() - 1, LAST_DAY.getFullYear()];
  const clampDate = d => new Date(Math.min(+LAST_DAY, Math.max(+FIRST_DAY, +d)));
  const band = (g, from, to, color) => g.append("rect").attr("x", x(clampDate(from))).attr("width", Math.max(2, x(clampDate(to)) - x(clampDate(from))))
    .attr("y", base - room - 2).attr("height", room + 2).attr("rx", 3).attr("fill", color).attr("fill-opacity", 0.13);
  rows.each(function (s, i) {
    const g = d3.select(this), c = colors[i];
    if (s.kind === "summer") d3.range(y0 + 1, y1 + 1).forEach(yr => band(g, new Date(yr, 5, 1), new Date(yr, 8, 1), c));
    if (s.kind === "christmas") d3.range(y0, y1 + 1).forEach(yr => band(g, new Date(yr, 11, 20), new Date(yr + 1, 0, 7), c));
    if (s.mark && s.kind === "comeback") {
      const [a, b] = s.mark.map(dayDate);
      g.append("line").attr("x1", x(a)).attr("x2", x(b)).attr("y1", base - 8).attr("y2", base - 8).attr("stroke", c).attr("stroke-width", 1.5).attr("stroke-dasharray", "3 5");
      g.append("text").attr("x", (x(a) + x(b)) / 2).attr("y", base - 14).attr("text-anchor", "middle").style("fill", "var(--ink-2)").style("font-size", "12px")
        .text(`${fmt(Math.round((b - a) / DAY_MS))} days of silence`);
    }
  });
  const area = d3.area().x((_, w) => x(weekDate(w))).y0(0).y1(n => -y(n)).curve(d3.curveMonotoneX);
  const waiting = isWaiting("stories");
  const spikes = rows.append("path").attr("transform", `translate(0,${base})${waiting ? " scale(1,0)" : ""}`)
    .attr("d", (_, i) => area(weekly[i])).attr("fill", (_, i) => colors[i]).attr("fill-opacity", 0.85).attr("stroke", (_, i) => colors[i]).attr("filter", "url(#story-glow)");
  if (waiting) revealOnView("stories", root, () => spikes.transition().delay((_, i) => i * 110).duration(900).ease(d3.easeBackOut.overshoot(1.4)).attr("transform", `translate(0,${base}) scale(1,1)`));
  /* The busiest week of each song gets its number. */
  rows.append("text").each(function (_, i) {
    const w = d3.maxIndex(weekly[i]), px = x(weekDate(w));
    d3.select(this).attr("x", Math.min(W - inset - 14, px + 7)).attr("y", base - y(weekly[i][w]) + 4).text(weekly[i][w]);
  }).style("fill", "var(--ink-2)").style("font-size", "12px").attr("paint-order", "stroke").attr("stroke", "#09090b").attr("stroke-width", 3);
  const lx = inset, ly = phone ? 18 : base - 26;
  rows.append("text").attr("x", lx).attr("y", ly).style("fill", "var(--ink)").style("font-size", phone ? "15px" : "17px").style("font-weight", 650).style("pointer-events", "none").text(s => s.title);
  rows.append("text").attr("x", lx).attr("y", ly + 18).style("fill", "var(--muted)").style("font-size", "12px").style("pointer-events", "none")
    .text(s => { const t = `${s.track} · ${s.artist}`, max = phone ? 46 : Math.floor(labelW / 6.4); return t.length > max ? `${t.slice(0, max - 1)}…` : t; });
  const show = (event, s) => {
    rows.attr("opacity", d => (d === s ? 1 : 0.3));
    let extra = "";
    if (event.clientX !== undefined && !event.keyboard) {
      const [mx] = d3.pointer(event, svg.node()), w = Math.round((+x.invert(mx) - +FIRST_DAY) / DAY_MS / 7 - 0.5), v = weekly[S.indexOf(s)][w];
      if (v) extra = `<br>Week of ${longDay(weekDate(w))}: ${v} play${v > 1 ? "s" : ""}`;
    }
    showTip(event, `<b>${esc(s.track)}</b>${esc(s.artist)}<br>${esc(s.title)}: ${esc(s.note)}<br><span class="k">${fmt(s.plays)} plays in total</span>${extra}`);
  };
  const clear = () => { rows.attr("opacity", 1); hideTip(); };
  rows.on("pointermove", show).on("pointerleave", clear);
  keyboardTour(svg, rows, (event, s) => show({ ...event, keyboard: true }, s), clear);
  const birthday = S.find(s => s.kind === "birthday");
  if (birthday) headline("story-title")`One song I only play on birthdays: “${birthday.track}”, ${N(`${birthday.plays} plays`)} on just ${birthday.days.length} days.`;
  else headline("story-title")`${S.length} songs, ${S.length} stories: “${S[0].track}” ${N(S[0].title.toLowerCase())}.`;
}

/* ================= 4. Canserbero spiral ================= */
/* Five and a half years on one spiral, a turn per year. Each month is a grey band as thick as all my
   listening that month; the lime inside it is Canserbero. */
function drawRank() {
  const R = D.rank, root = document.getElementById("rank");
  root.innerHTML = "";
  const W = widthOf(root), H = heightOf(root, Math.min(widthOf(root) + 30, 560));
  const size = Math.min(W, H), cx = W / 2, cy = H / 2, outer = size / 2 - (size < 420 ? 22 : 34);
  const first = MONTHS[0], monthsFromJan = first.getMonth();
  const turns = (MONTHS.length + monthsFromJan) / 12, inner = outer * 0.2, gap = (outer - inner) / (turns + 0.5);
  const tAt = i => i + monthsFromJan; // months since January of the first year
  const angle = t => (t / 12) * Math.PI * 2;
  const radius = t => inner + (t / 12) * gap;
  const total = D.river.allHours, his = R.hoursByMonth.map(v => v ?? 0);
  const band = gap * 0.82;
  const maxShare = d3.max(R.share, v => v ?? 0);
  /* Colour carries the story: dark when he is absent, full lime glow at his biggest month. */
  const glowOf = share => d3.interpolateRgb("#18181d", ACCENT)(Math.pow(share / maxShare, 1.15));
  const point = (t, r) => [cx + Math.sin(angle(t)) * r, cy - Math.cos(angle(t)) * r];
  /* One month as a curved band along the spiral, `w` pixels thick. */
  const segment = (i, w) => {
    const steps = 10, out = [], back = [];
    for (let k = 0; k <= steps; k++) {
      const t = tAt(i) + (k / steps) * 0.96, r = radius(t);
      out.push(point(t, r + w / 2)); back.push(point(t, r - w / 2));
    }
    return `M${out.map(p => p.join(",")).join("L")}L${back.reverse().map(p => p.join(",")).join("L")}Z`;
  };
  const svg = d3.select(root).append("svg").attr("width", W).attr("height", H).attr("role", "img")
    .attr("aria-label", `Spiral of every month since ${first.getFullYear()}, showing ${R.artist}'s share of my listening`);
  const defs = svg.append("defs");
  const glow = defs.append("filter").attr("id", "spiral-glow").attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
  glow.append("feGaussianBlur").attr("stdDeviation", 3.5).attr("result", "b");
  const merge = glow.append("feMerge"); merge.append("feMergeNode").attr("in", "b"); merge.append("feMergeNode").attr("in", "SourceGraphic");
  /* Month names around the rim, year labels on the January spoke. */
  d3.range(12).forEach(mo => {
    const [mx, my] = point(mo + 0.5, outer + 14);
    svg.append("text").attr("x", mx).attr("y", my + 4).attr("text-anchor", "middle").text(d3.timeFormat("%b")(new Date(2021, mo, 1)).slice(0, size < 420 ? 1 : 3));
  });
  const months = MONTHS.map((m, i) => ({ m, i, total: total[i], his: his[i], share: R.share[i] ?? 0, rank: R.rank[i], song: R.songByMonth[i] }));
  const waiting = isWaiting("spiral");
  const greys = svg.append("g").selectAll("path").data(months).join("path").attr("d", d => segment(d.i, band)).attr("fill", d => glowOf(d.share));
  const limes = svg.append("g").attr("filter", "url(#spiral-glow)").style("pointer-events", "none").selectAll("path").data(months.filter(d => d.share >= maxShare * 0.45)).join("path")
    .attr("d", d => segment(d.i, band)).attr("fill", d => glowOf(d.share));
  if (waiting) {
    greys.attr("fill", "#18181d"); limes.attr("opacity", 0);
    revealOnView("spiral", root, () => {
      greys.transition().delay(d => d.i * 30).duration(500).attr("fill", d => glowOf(d.share));
      limes.transition().delay(d => 300 + d.i * 30).duration(600).attr("opacity", 1);
    });
  }
  const years = d3.range(first.getFullYear(), LAST_DAY.getFullYear() + 1);
  years.forEach((yr, k) => {
    const t = k * 12, [px, py] = point(t, radius(t));
    svg.append("text").attr("x", px).attr("y", py + 4).attr("text-anchor", "middle").attr("class", "spiral-year").text(String(yr).slice(2)).raise();
  });
  /* Centre: his total and the month he owned most. */
  const best = months.reduce((a, b) => (b.share > a.share ? b : a));
  const centre = svg.append("g").attr("transform", `translate(${cx},${cy})`).style("pointer-events", "none");
  const big = centre.append("text").attr("text-anchor", "middle").attr("y", -2).style("fill", ACCENT).style("font-size", `${Math.max(16, inner * 0.42)}px`).style("font-weight", 700);
  const small = centre.append("text").attr("text-anchor", "middle").attr("y", 16).style("fill", "var(--ink-2)").style("font-size", "11px");
  const setCentre = d => { big.text(d ? pct(d.share) : `${fmtH(R.hours)} h`); small.text(d ? monthName(d.m) : R.artist); };
  setCentre(null);
  const hit = svg.append("g").selectAll("path").data(months).join("path").attr("d", d => segment(d.i, gap)).attr("fill", "transparent");
  const show = (event, d) => {
    greys.attr("stroke", g => (g === d ? "var(--ink)" : null)).attr("stroke-width", 1.5);
    setCentre(d);
    showTip(event, d.his > 0
      ? `<b>${monthName(d.m)}</b>${fmtH(d.his)} of ${fmtH(d.total)} hours were ${esc(R.artist)} (${pct(d.share)}), #${d.rank} that month<br><span class="k">Song of the month: ${esc(d.song ?? "")}</span>`
      : `<b>${monthName(d.m)}</b>${fmtH(d.total)} hours, no ${esc(R.artist)}`);
  };
  const clear = () => { greys.attr("stroke", null); setCentre(null); hideTip(); };
  hit.on("pointermove", show).on("pointerleave", clear);
  keyboardTour(svg, hit, show, clear);
  headline("rank-title")`In ${monthName(best.m)}, ${R.artist} took ${N(pct(best.share))} of everything I played.`;
  setText("rank-sub", `My whole history as a spiral, one turn per year from ${first.getFullYear()} in the middle to ${LAST_DAY.getFullYear()} outside, January at the top. ` +
    `The brighter a month glows, the bigger ${R.artist}'s share of it. Hover a month for his song of the month.`);
}

/* ================= 5. Genre galaxy ================= */
const galaxy = { year: "all", isolated: null, sim: null, timer: null, played: false };
const GALAXY_STEP_MS = 2200;
function genreLeaders() {
  const G = D.genres;
  return G.years.map((yr, yi) => {
    const best = d3.greatest(G.genres, g => G.totals[g]?.[yi] ?? 0);
    return { yr, genre: best, hours: G.totals[best][yi] };
  });
}
function drawGenres() {
  const G = D.genres, root = document.getElementById("genres");
  root.innerHTML = "";
  if (galaxy.sim) galaxy.sim.stop();
  if (galaxy.timer) { clearTimeout(galaxy.timer); galaxy.timer = null; }
  const phone = isPhone(), W = widthOf(root), H = heightOf(root, 760), inset = insetOf();
  const yi = () => (galaxy.year === "all" ? -1 : G.years.indexOf(galaxy.year));
  const hoursOf = a => (yi() < 0 ? d3.sum(a.hy) : a.hy[yi()]);
  /* Genre homes on an ellipse; the biggest genre sits at the top. */
  const homes = G.genres.map((_, g) => {
    const a = -Math.PI / 2 + (g / G.genres.length) * Math.PI * 2;
    return [W / 2 + Math.cos(a) * W * (phone ? 0.25 : 0.33), H / 2 + Math.sin(a) * H * (phone ? 0.37 : 0.3)];
  });
  const nodes = G.artists.map((a, i) => ({ a: a.a, g: a.g, hy: a.y, h: 0, i, x: homes[a.g][0] + (jitter(i) - 0.5) * 40, y: homes[a.g][1] + (jitter(i + 3) - 0.5) * 40, r: 0 }));
  const svg = d3.select(root).append("svg").attr("width", W).attr("height", H).attr("role", "img")
    .attr("aria-label", "Bubbles of my top artists grouped by genre, sized by hours");
  const watermark = svg.append("text").attr("class", "race-month").attr("x", W - inset).attr("y", H - 12).attr("text-anchor", "end");
  const bubbles = svg.append("g").selectAll("g").data(nodes, d => d.a).join("g");
  const circles = bubbles.append("circle").attr("fill", d => genreColor(d.g)).attr("fill-opacity", 0.9).attr("stroke", "#09090b").attr("stroke-width", 1);
  const names = bubbles.append("text").attr("text-anchor", "middle").attr("dy", "0.35em").style("fill", ON_NEON).style("font-size", "11px").style("font-weight", 600).style("pointer-events", "none");
  const tags = svg.append("g").style("pointer-events", "none").selectAll("g").data(G.genres).join("g");
  tags.append("text").attr("text-anchor", "middle").style("fill", "var(--ink)").style("font-size", phone ? "13px" : "15px").style("font-weight", 650)
    .attr("paint-order", "stroke").attr("stroke", "#09090b").attr("stroke-width", 4).text(g => g);
  const tagHours = tags.append("text").attr("text-anchor", "middle").attr("dy", "1.2em").style("fill", "var(--ink-2)").style("font-size", "12px")
    .attr("paint-order", "stroke").attr("stroke", "#09090b").attr("stroke-width", 4);
  const maxR = Math.min(W, H) * (phone ? 0.085 : 0.11);
  function radii() {
    /* Single years share one scale, so a genre visibly grows or shrinks from year to year. */
    const top = yi() < 0 ? d3.max(nodes, hoursOf) : d3.max(nodes, d => d3.max(d.hy));
    const rad = d3.scaleSqrt().domain([0, top || 1]).range([0, yi() < 0 ? maxR : maxR * 0.95]);
    nodes.forEach(d => { d.target = hoursOf(d) > 0 ? Math.max(2, rad(hoursOf(d))) : 0; });
    collide.radius(d => (d.target > 0 ? d.target + 1.5 : 0)); // the accessor is cached, so set it again on every change
  }
  function render() {
    bubbles.attr("transform", d => `translate(${d.x},${d.y})`);
    circles.attr("r", d => d.r);
    names.text(d => (d.r * 2 > d.a.length * 6.4 + 6 ? d.a : ""));
    tags.attr("transform", g => {
      const own = nodes.filter(d => d.g === G.genres.indexOf(g) && d.r > 0);
      if (!own.length) return `translate(${homes[G.genres.indexOf(g)]})`;
      const top = d3.min(own, d => d.y - d.r), cx = d3.mean(own, d => d.x);
      return `translate(${Math.min(W - inset - 60, Math.max(inset + 60, cx))},${Math.max(16, top - 26)})`;
    });
    tagHours.text(g => { const k = G.genres.indexOf(g); return `${fmtH(d3.sum(nodes.filter(d => d.g === k), d => d.h))} h`; });
    watermark.text(galaxy.year === "all" ? "All years" : galaxy.year);
  }
  const collide = d3.forceCollide().iterations(2);
  const sim = d3.forceSimulation(nodes)
    .force("x", d3.forceX(d => homes[d.g][0]).strength(0.09))
    .force("y", d3.forceY(d => homes[d.g][1]).strength(0.09))
    .force("collide", collide)
    .alphaDecay(0.03).on("tick", () => {
      nodes.forEach(d => { d.r += (d.target - d.r) * 0.12; d.h += (hoursOf(d) - d.h) * 0.12; d.x = Math.max(d.r + 2, Math.min(W - d.r - 2, d.x)); d.y = Math.max(d.r + 30, Math.min(H - d.r - 2, d.y)); });
      render();
    }).stop();
  galaxy.sim = sim;
  radii();
  const waiting = isWaiting("genres");
  const settle = () => { nodes.forEach(d => { d.r = d.target; d.h = hoursOf(d); }); for (let i = 0; i < 260; i++) sim.tick(); render(); };
  const yearBox = document.getElementById("genre-years");
  yearBox.innerHTML = ["all", ...G.years].map(y => `<button type="button" data-year="${y}" aria-pressed="${galaxy.year === y}">${y === "all" ? "All years" : y}</button>`).join("");
  const playButton = document.getElementById("genre-play");
  const setYear = y => {
    galaxy.year = y;
    yearBox.querySelectorAll("button").forEach(o => o.setAttribute("aria-pressed", String(o.dataset.year === String(y))));
    radii();
    if (REDUCED) settle(); else sim.alpha(0.7).restart();
  };
  const setPlaying = on => {
    playButton.innerHTML = on ? ICON_PAUSE : ICON_PLAY;
    playButton.setAttribute("aria-label", on ? "Pause the years" : "Play the years");
    playButton.setAttribute("aria-pressed", String(on));
  };
  const stop = () => { if (galaxy.timer) clearTimeout(galaxy.timer); galaxy.timer = null; setPlaying(false); };
  /* Auto-play: 2021 to the last year, one step at a time, then back to all years. */
  const play = () => {
    stop(); setPlaying(true);
    const sequence = [...G.years, "all"];
    const step = k => {
      setYear(sequence[k]);
      if (k < sequence.length - 1) galaxy.timer = setTimeout(() => step(k + 1), GALAXY_STEP_MS);
      else stop();
    };
    step(0);
  };
  playButton.onclick = () => (galaxy.timer ? stop() : play());
  yearBox.querySelectorAll("button").forEach(b => b.addEventListener("click", () => { stop(); setYear(b.dataset.year === "all" ? "all" : +b.dataset.year); }));
  setPlaying(false);
  if (!waiting) settle();
  else {
    render();
    revealOnView("genres", root, () => { sim.alpha(1).restart(); if (!galaxy.played) { galaxy.played = true; galaxy.timer = setTimeout(play, 1600); } });
  }
  const isolate = () => bubbles.attr("opacity", d => (galaxy.isolated === null || d.g === galaxy.isolated ? 1 : 0.12));
  const legend = document.getElementById("genre-legend");
  legend.innerHTML = G.genres.map((g, k) => `<li><button type="button" data-g="${k}" aria-pressed="${galaxy.isolated === k}"><i style="background:${genreColor(k)}"></i>${esc(g)}</button></li>`).join("");
  legend.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
    const k = +b.dataset.g; galaxy.isolated = galaxy.isolated === k ? null : k;
    legend.querySelectorAll("button").forEach(o => o.setAttribute("aria-pressed", String(+o.dataset.g === galaxy.isolated)));
    isolate();
  }));
  isolate();
  const show = (event, d) => {
    circles.attr("stroke", o => (o === d ? "var(--ink)" : "#09090b")).attr("stroke-width", o => (o === d ? 2 : 1));
    showTip(event, `<b>${esc(d.a)}</b>${esc(G.genres[d.g])}<br>${fmtH(hoursOf(d))} hours ${galaxy.year === "all" ? "in all" : `in ${galaxy.year}`}`);
  };
  const clear = () => { circles.attr("stroke", "#09090b").attr("stroke-width", 1); hideTip(); };
  bubbles.on("pointermove", show).on("pointerleave", clear);
  keyboardTour(svg, bubbles.filter((_, i) => i < 40), show, clear);
  const leaders = genreLeaders(), first = leaders[0], last = leaders.at(-1);
  if (first.genre !== last.genre) headline("genre-title")`${first.genre} ruled ${first.yr}; by ${last.yr} the biggest genre in my ears was ${N(last.genre.toLowerCase())}.`;
  else headline("genre-title")`${N(first.genre)} led every single year, from ${first.yr} to ${last.yr}.`;
  setText("genre-sub", "Each bubble is an artist, sized by hours and grouped by genre. It plays through the years when it comes into view; press play again, pick a year, or pick a genre to isolate it.");
  setText("genre-how", `The Spotify export has no genre field, so I tagged my ${G.artists.length} most played artists by hand, one genre each. ` +
    `They cover ${pct(G.coverage)} of all my hours; the long tail of other artists is left out of this chart.`);
}

/* ================= 6. Season playlists ================= */
const SEASON_LABEL = { winter: "Winter", spring: "Spring", summer: "Summer", autumn: "Autumn" };
const SEASON_SPAN = { winter: "December to February", spring: "March to May", summer: "June to August", autumn: "September to November" };
const EVEN_SHARE = 0.25; // a song played evenly all year puts a quarter of its plays in each season
function drawSeasons() {
  const S = D.seasons, root = document.getElementById("seasons");
  const waiting = isWaiting("seasons");
  root.innerHTML = `<div class="playlists">${S.map(col => `
    <section class="playlist" aria-label="${SEASON_LABEL[col.season]} songs">
      <h3>${SEASON_LABEL[col.season]}<span>${esc(col.months)}</span></h3>
      <ol>${col.songs.map(s => `
        <li tabindex="0" data-tip="${esc(`<b>${esc(s.t)}</b>${esc(s.a)}<br>${pct(s.share)} of its ${s.n} plays fall in ${SEASON_SPAN[col.season]}, in ${s.yrs} different years`)}">
          <span class="song">${esc(s.t)}<small>${esc(s.a)}</small></span>
          <span class="share">${pct(s.share)}</span>
          <span class="track"><i style="width:${waiting ? 0 : 100 * s.share}%;background:${genreColor(s.g)}" data-w="${100 * s.share}"></i><em style="left:${100 * EVEN_SHARE}%"></em></span>
        </li>`).join("")}</ol>
    </section>`).join("")}</div>`;
  root.querySelectorAll("li").forEach(li => {
    const show = event => showTip(event, li.dataset.tip);
    li.addEventListener("pointermove", show);
    li.addEventListener("pointerleave", hideTip);
    li.addEventListener("focus", () => { const b = li.getBoundingClientRect(); show({ clientX: b.x + b.width / 2, clientY: b.y + b.height / 2 }); });
    li.addEventListener("blur", hideTip);
  });
  if (waiting) revealOnView("seasons", root, () => root.querySelectorAll("i[data-w]").forEach((bar, k) => {
    bar.style.transitionDelay = `${(k % 5) * 90 + Math.floor(k / 5) * 160}ms`;
    bar.style.width = `${bar.dataset.w}%`;
  }));
  const used = [...new Set(S.flatMap(c => c.songs.map(s => s.g)))].sort((a, b) => a - b);
  setLegend("season-legend", used.map(g => [esc(g >= 0 ? D.genres.genres[g] : "Other"), genreColor(g)]));
  const best = S.flatMap(c => c.songs.map(s => ({ ...s, season: c.season, months: c.months }))).reduce((a, b) => (b.share > a.share ? b : a));
  headline("season-title")`“${best.t}” is pure ${best.season}: ${N(pct(best.share))} of its plays fall in ${SEASON_SPAN[best.season]}.`;
}

/* ================= 7. Travel map ================= */
const travel = { selected: 170, transform: null }; // Colombia open by default, so the panel is never empty
const MAP_VIEWS = {
  visited: [[-125, -6], [95, 67]], // wide to the east so Europe clears the country panel
  world: null,
  europe: [[-11, 35], [32, 61]],
  americas: [[-118, -38], [-34, 34]],
};
const MAP_MAX_ZOOM = 14;
function drawTravel() {
  const root = document.getElementById("travel");
  root.innerHTML = "";
  const phone = isPhone(), W = widthOf(root), H = heightOf(root, Math.round(widthOf(root) * 0.7)), inset = insetOf();
  const byId = new Map(D.travel.map(t => [t.id, t]));
  const world = window.WORLD, visited = world.features.filter(f => byId.has(+f.id));
  const projection = d3.geoNaturalEarth1().fitExtent([[inset, 8], [W - inset, H - 8]], { type: "Sphere" });
  const path = d3.geoPath(projection);
  const color = d3.scaleSequentialLog(d3.interpolateRgbBasis(MAP_RAMP)).domain(d3.extent(D.travel, t => t.hours));
  const width = d3.scaleSqrt().domain([0, d3.max(D.travel.filter(t => t.cc !== "ES"), t => t.hours)]).range([0.8, 6]);
  const svg = d3.select(root).append("svg").attr("width", W).attr("height", H).attr("role", "img")
    .attr("aria-label", "World map of countries where I listened, with arcs from Spain coloured and sized by hours").style("overflow", "hidden").style("touch-action", "pan-y");
  const view = svg.append("g");
  view.append("path").datum({ type: "Sphere" }).attr("d", path).attr("fill", "#0e0e12").attr("stroke", "#1b1b20").attr("vector-effect", "non-scaling-stroke");
  view.append("path").datum(d3.geoGraticule10()).attr("d", path).attr("fill", "none").attr("stroke", "#15151a").attr("vector-effect", "non-scaling-stroke");
  const lands = view.append("g").selectAll("path").data(world.features).join("path").attr("d", path)
    .attr("fill", f => (byId.has(+f.id) ? color(byId.get(+f.id).hours) : "#1a1a20")).attr("stroke", "#09090b").attr("stroke-width", 0.5)
    .attr("vector-effect", "non-scaling-stroke").style("cursor", f => (byId.has(+f.id) ? "pointer" : "default"));
  const home = world.features.find(f => +f.id === 724), origin = d3.geoCentroid(home);
  const trips = D.travel.filter(t => t.cc !== "ES").map(t => {
    const f = world.features.find(g => +g.id === t.id), dest = d3.geoCentroid(f), interp = d3.geoInterpolate(origin, dest);
    return { t, dest, line: { type: "LineString", coordinates: d3.range(0, 1.0001, 1 / 48).map(interp) } };
  });
  const arcs = view.append("g").style("pointer-events", "none").selectAll("path").data(trips).join("path").attr("d", d => path(d.line)).attr("fill", "none")
    .attr("stroke", d => color(d.t.hours)).attr("stroke-width", d => width(d.t.hours)).attr("stroke-linecap", "round").attr("vector-effect", "non-scaling-stroke");
  const flow = view.append("g").style("pointer-events", "none").selectAll("path").data(trips).join("path").attr("d", d => path(d.line)).attr("fill", "none")
    .attr("class", "map-flow").attr("stroke", "#fff").attr("stroke-opacity", 0.55).attr("stroke-width", d => Math.max(0.8, width(d.t.hours) * 0.45)).attr("vector-effect", "non-scaling-stroke");
  const pins = view.append("g").style("pointer-events", "none").selectAll("circle").data(trips).join("circle")
    .attr("cx", d => projection(d.dest)[0]).attr("cy", d => projection(d.dest)[1]).attr("fill", d => color(d.t.hours));
  const homePin = view.append("circle").attr("cx", projection(origin)[0]).attr("cy", projection(origin)[1]).attr("fill", "var(--ink)");
  const outline = view.append("path").attr("fill", "none").attr("stroke", "var(--ink)").attr("stroke-width", 1.8).attr("vector-effect", "non-scaling-stroke").style("pointer-events", "none");
  const labels = svg.append("g").style("pointer-events", "none");
  const labelled = D.travel.slice(0, phone ? 5 : 12).map(t => ({ t, at: projection(d3.geoCentroid(world.features.find(g => +g.id === t.id))) }));
  /* Labels live outside the zoomed group so their text stays the same size; they re-place on every zoom. */
  function placeLabels(k) {
    const tr = travel.transform ?? d3.zoomIdentity;
    const items = labelled.map(l => {
      const [px, py] = tr.apply(l.at), text = `${l.t.name} · ${fmtH(l.t.hours)} h`, w = text.length * 6.6;
      return l.t.cc === "ES" ? { l, text, x: px - w - 8, y: py + 18, w } : { l, text, x: px + 8, y: py - 6, w };
    }).filter(i => i.x > 0 && i.x + i.w < W && i.y > 14 && i.y < H - 4);
    const shown = placeWithoutOverlap(items, i => ({ x0: i.x, x1: i.x + i.w, y0: i.y - 12, y1: i.y + 4 }));
    labels.selectAll("text").data(shown, i => i.l.t.cc).join("text").attr("x", i => i.x).attr("y", i => i.y)
      .style("fill", "var(--ink)").style("font-size", "12px").style("font-weight", 600).attr("paint-order", "stroke").attr("stroke", "#09090b").attr("stroke-width", 3).text(i => i.text);
    pins.attr("r", d => (2 + width(d.t.hours) * 0.6) / k); // the group is scaled by k, so divide to keep pins a fixed size
    homePin.attr("r", 5 / k);
  }
  const zoom = d3.zoom().scaleExtent([1, MAP_MAX_ZOOM]).translateExtent([[0, 0], [W, H]])
    .filter(event => (event.type === "wheel" ? event.ctrlKey || event.metaKey : event.type === "touchstart" ? event.touches.length > 1 : !event.button))
    .on("zoom", event => { travel.transform = event.transform; view.attr("transform", event.transform); placeLabels(event.transform.k); });
  svg.call(zoom).on("dblclick.zoom", null);
  const boundsOf = box => {
    if (!box) return d3.zoomIdentity;
    const [[x0, y0], [x1, y1]] = [projection(box[0]), projection(box[1])].map(p => p).reduce((acc, p) => [[Math.min(acc[0][0], p[0]), Math.min(acc[0][1], p[1])], [Math.max(acc[1][0], p[0]), Math.max(acc[1][1], p[1])]], [[Infinity, Infinity], [-Infinity, -Infinity]]);
    const k = Math.min(MAP_MAX_ZOOM, 0.92 / Math.max((x1 - x0) / W, (y1 - y0) / H));
    return d3.zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
  };
  const go = target => svg.transition().duration(REDUCED ? 0 : 900).ease(d3.easeCubicInOut).call(zoom.transform, target);
  /* Controls: preset views plus zoom in, out and reset. */
  const bar = d3.select(root).insert("div", "svg").attr("class", "map-zoom");
  const presets = bar.append("div").attr("class", "view-switch").attr("role", "group").attr("aria-label", "Map view");
  Object.keys(MAP_VIEWS).filter(v => v !== "visited").forEach(v => presets.append("button").attr("type", "button").attr("aria-pressed", "false").text(v[0].toUpperCase() + v.slice(1))
    .on("click", function () { presets.selectAll("button").attr("aria-pressed", "false"); d3.select(this).attr("aria-pressed", "true"); go(boundsOf(MAP_VIEWS[v])); }));
  const zooms = bar.append("div").attr("class", "zoom-buttons").attr("role", "group").attr("aria-label", "Zoom");
  [["+", "Zoom in", 1.8], ["−", "Zoom out", 1 / 1.8]].forEach(([label, aria, f]) => zooms.append("button").attr("type", "button").attr("aria-label", aria).text(label)
    .on("click", () => svg.transition().duration(REDUCED ? 0 : 400).call(zoom.scaleBy, f)));
  const panel = d3.select(root).append("aside").attr("class", "country-panel").attr("aria-live", "polite");
  function select(id) {
    const t = byId.get(id);
    if (!t) return;
    travel.selected = id;
    const f = world.features.find(g => +g.id === id);
    outline.attr("d", path(f));
    const maxA = d3.max(t.artists, a => a[1]), maxS = d3.max(t.songs, s => s[2]) || 1;
    panel.html(`<h3><i style="background:${color(t.hours)}"></i>${esc(t.name)}</h3><p class="k">${fmtH(t.hours)} hours · ${fmt(t.plays)} plays</p>` +
      `<h4>Top artists</h4><ol>${t.artists.map(([a, n]) => `<li><span>${esc(a)}</span><b>${fmt(n)}</b><em style="width:${(100 * n) / maxA}%;background:${color(t.hours)}"></em></li>`).join("")}</ol>` +
      `<h4>Top songs</h4><ol>${t.songs.map(([s, a, n]) => `<li><span>${esc(s)}<small>${esc(a)}</small></span><b>${fmt(n)}</b><em style="width:${(100 * n) / maxS}%;background:${color(t.hours)}"></em></li>`).join("")}</ol>`);
  }
  select(travel.selected);
  lands.on("click", (_, f) => { if (byId.has(+f.id)) select(+f.id); })
    .on("pointermove", (event, f) => { const t = byId.get(+f.id); if (t) showTip(event, `<b>${esc(t.name)}</b>${fmtH(t.hours)} hours<br><span class="k">Click for top artists and songs</span>`); else hideTip(); })
    .on("pointerleave", hideTip);
  const order = new Map(D.travel.map((t, i) => [t.id, i]));
  keyboardTour(svg, lands.filter(f => byId.has(+f.id)).sort((a, b) => order.get(+a.id) - order.get(+b.id)), (_, f) => select(+f.id), () => {});
  if (travel.transform) svg.call(zoom.transform, travel.transform);
  else svg.call(zoom.transform, boundsOf(phone ? MAP_VIEWS.europe : MAP_VIEWS.visited));
  if (isWaiting("travel")) {
    arcs.attr("stroke-dasharray", function () { const l = this.getTotalLength(); return `${l} ${l}`; }).attr("stroke-dashoffset", function () { return this.getTotalLength(); });
    pins.attr("opacity", 0); flow.attr("opacity", 0);
    revealOnView("travel", root, () => {
      arcs.transition().delay((_, i) => i * 80).duration(1100).ease(d3.easeCubicInOut).attr("stroke-dashoffset", 0).on("end", function () { d3.select(this).attr("stroke-dasharray", null); });
      pins.transition().delay((_, i) => i * 80 + 1000).duration(300).attr("opacity", 1);
      flow.transition().delay(2600).duration(600).attr("opacity", 1);
    });
  }
  /* The flowing dashes repaint the map every frame, so they only run while the map is on screen. */
  if (travel.flowWatch) travel.flowWatch.disconnect();
  travel.flowWatch = new IntersectionObserver(e => root.classList.toggle("flowing", e[0].isIntersecting && !REDUCED));
  travel.flowWatch.observe(root);
  const total = d3.sum(D.travel, t => t.hours), abroad = total - (byId.get(724)?.hours ?? 0), second = D.travel[1];
  headline("travel-title")`${N(pct(abroad / total))} of my listening happened outside Spain, across ${D.travel.length - 1} countries; ${second.name} comes second with ${fmtH(second.hours)} hours.`;
}

/* ================= 8. New faces vs old friends ================= */
const NEW_COLOR = "#ff4fa0", OLD_COLOR = "#2ec5ff";
function drawCohorts() {
  const C = D.cohorts, root = document.getElementById("cohorts");
  root.innerHTML = "";
  const phone = isPhone(), W = widthOf(root), inset = insetOf();
  const years = C.cohorts.filter(c => c !== "before");
  const rows = years.map(yr => {
    const idx = MONTHS.map((m, i) => [m, i]).filter(([m]) => String(m.getFullYear()) === yr).map(([, i]) => i);
    const total = d3.sum(idx, i => d3.sum(C.series, s => s[i]));
    const fresh = d3.sum(idx, i => C.series[C.cohorts.indexOf(yr)][i]);
    return { yr, total, fresh, share: fresh / total, met: C.met[yr] ?? 0, partial: idx.length < 12 };
  });
  const H = heightOf(root, rows.length * (phone ? 64 : 70) + 20);
  const rowH = Math.min(84, (H - 20) / rows.length), barH = Math.min(40, rowH * 0.56);
  const labelW = phone ? 46 : 70;
  const x = d3.scaleLinear().domain([0, 1]).range([inset + labelW, W - inset]);
  const svg = d3.select(root).append("svg").attr("width", W).attr("height", H).attr("role", "img")
    .attr("aria-label", "One bar per year, split into hours with artists I met that year and artists I already knew");
  const top = (H - rows.length * rowH) / 2;
  const g = svg.selectAll("g").data(rows).join("g").attr("transform", (_, i) => `translate(0,${top + i * rowH + (rowH - barH) / 2})`);
  g.append("text").attr("x", inset).attr("y", barH / 2 + 6).style("fill", "var(--ink)").style("font-size", phone ? "16px" : "20px").style("font-weight", 650)
    .text(d => d.yr);
  const waiting = isWaiting("cohorts");
  const newBar = g.append("rect").attr("x", x(0)).attr("height", barH).attr("rx", 6).attr("fill", NEW_COLOR).attr("width", d => (waiting ? 0 : x(d.share) - x(0)));
  const oldBar = g.append("rect").attr("height", barH).attr("rx", 6).attr("fill", OLD_COLOR).attr("fill-opacity", 0.85)
    .attr("x", d => (waiting ? x(0) : x(d.share) + 2)).attr("width", d => (waiting ? 0 : Math.max(0, x(1) - x(d.share) - 2)));
  const inside = (sel, pos, text) => sel.append("text").attr("y", barH / 2 + 5).style("fill", ON_NEON).style("font-size", phone ? "12px" : "14px").style("font-weight", 650)
    .attr("x", pos).text(text).style("opacity", waiting ? 0 : 1);
  const newLabels = inside(g, d => x(0) + 10, d => (x(d.share) - x(0) > (phone ? 70 : 150) ? `${pct(d.share)} new faces` : pct(d.share)));
  const oldLabels = inside(g, d => x(1) - 10, d => `${pct(1 - d.share)}${phone ? "" : " old friends"}`).attr("text-anchor", "end");
  if (waiting) revealOnView("cohorts", root, () => {
    newBar.transition().delay((_, i) => i * 120).duration(800).ease(d3.easeCubicOut).attr("width", d => x(d.share) - x(0));
    oldBar.transition().delay((_, i) => i * 120 + 300).duration(800).ease(d3.easeCubicOut).attr("x", d => x(d.share) + 2).attr("width", d => Math.max(0, x(1) - x(d.share) - 2));
    newLabels.transition().delay((_, i) => i * 120 + 700).duration(300).style("opacity", 1);
    oldLabels.transition().delay((_, i) => i * 120 + 1000).duration(300).style("opacity", 1);
  });
  const show = (event, d) => {
    g.attr("opacity", r => (r === d ? 1 : 0.35));
    showTip(event, `<b>${d.yr}${d.partial ? " (part of the year)" : ""}</b>${fmtH(d.total)} hours<br>${pct(d.share)} with the ${fmt(d.met)} artists I first heard that year<br>${pct(1 - d.share)} with artists I already knew`);
  };
  const clear = () => { g.attr("opacity", 1); hideTip(); };
  g.on("pointermove", show).on("pointerleave", clear);
  keyboardTour(svg, g, show, clear);
  setLegend("cohort-legend", [["New faces: artists I first heard that year", NEW_COLOR], ["Old friends: artists I already knew", OLD_COLOR]]);
  const typical = d3.median(rows.slice(1), r => r.share), peak = rows.slice(1).reduce((a, b) => (b.share > a.share ? b : a));
  headline("cohort-title")`About ${N(pct(typical))} of each year goes to artists I have just met; ${peak.yr} was my most curious year.`;
  setText("cohort-sub", `One bar per year: pink is listening to artists I heard for the first time that year, blue is everyone I already knew. ` +
    `${rows[0].yr} counts more new faces because the logs before it are sparse.`);
}

/* ================= Ending ================= */
function drawEnding() {
  const m = D.meta, birthday = D.stories.find(s => s.kind === "birthday");
  const tail = birthday ? "and one song I only play on birthdays." : `and ${D.stories.length} songs with a story.`;
  headline("end-title")`${N(fmt(m.plays))} plays, ${fmt(m.artists)} artists, ${D.travel.length} countries, ${tail}`;
  setText("method-note", `${fmt(m.plays)} music plays, ${fmt(m.artists)} artists and ${fmt(m.tracks)} songs, ${longDay(FIRST_DAY)} to ${longDay(LAST_DAY)}. ` +
    "Earlier logs exist but are sparse, so the story starts in May 2021; first plays use the full history back to 2014. Hours are time actually played; podcasts and video are left out. " +
    `Story songs are found by rules over plays of 30 seconds or more; genres are tagged by hand for the top ${D.genres.artists.length} artists. ` +
    "Only aggregates are published: no raw plays, no IP addresses, nothing finer than a day.");
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

const drawCharts = () => { drawRiver(); drawRace(); drawStories(); drawRank(); drawGenres(); drawSeasons(); drawTravel(); drawCohorts(); };
drawHero();
drawEnding();
trackProgress();
drawAll(drawCharts);
redrawOnResize(drawCharts);
