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
    o.textBaseline = "alphabetic"; o.fillStyle = "#fff";
    const metrics = o.measureText(text), textH = metrics.actualBoundingBoxAscent;
    o.fillText(text, 0, (bh + textH) / 2);
    const img = o.getImageData(0, 0, bw, bh).data;
    let filled = 0;
    for (let i = 3; i < img.length; i += 4) if (img[i] > 128) filled++;
    const step = Math.max(1.6, Math.sqrt(filled / total));
    const targets = [];
    for (let y = step / 2; y < bh; y += step) for (let x = step / 2; x < bw; x += step) {
      if (img[(Math.floor(y) * bw + Math.floor(x)) * 4 + 3] > 128) targets.push([bx + x, by + y]);
    }
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
  const H = heightOf(root, S.length * (phone ? 78 : 60) + 30);
  const rowH = (H - 30) / S.length;
  const labelW = phone ? 0 : Math.min(330, W * 0.3);
  const x = d3.scaleTime().domain([FIRST_DAY, LAST_DAY]).range([phone ? inset : inset + labelW + 20, W - inset]);
  const colors = storyColors(S);
  const maxN = d3.max(S, s => d3.max(s.days, d => d[1]));
  const rad = d3.scaleSqrt().domain([1, maxN]).range([2.6, Math.min(11, rowH * 0.24)]);
  const base = phone ? rowH - 18 : rowH * 0.58;
  const svg = d3.select(root).append("svg").attr("width", W).attr("height", H).attr("role", "img")
    .attr("aria-label", `Ten songs with a story, one row each, a dot per day played`);
  yearTicks(svg, x, H, x.range()[0]);
  const defs = svg.append("defs");
  const glow = defs.append("filter").attr("id", "story-glow").attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
  glow.append("feGaussianBlur").attr("stdDeviation", 2.5).attr("result", "b");
  const merge = glow.append("feMerge"); merge.append("feMergeNode").attr("in", "b"); merge.append("feMergeNode").attr("in", "SourceGraphic");
  const rows = svg.append("g").selectAll("g").data(S).join("g").attr("transform", (_, i) => `translate(0,${i * rowH})`);
  rows.append("rect").attr("x", 0).attr("width", W).attr("height", rowH).attr("fill", "transparent");
  rows.append("line").attr("x1", x.range()[0]).attr("x2", x.range()[1]).attr("y1", base).attr("y2", base).attr("stroke", "#232329");
  /* Season bands for the seasonal stories, highlight boxes for the ones with a moment. */
  const [y0, y1] = [FIRST_DAY.getFullYear() - 1, LAST_DAY.getFullYear()];
  const band = (g, from, to, color) => g.append("rect").attr("x", x(from)).attr("width", Math.max(2, x(to) - x(from))).attr("y", base - rowH * 0.3).attr("height", rowH * 0.6)
    .attr("rx", 3).attr("fill", color).attr("fill-opacity", 0.2);
  rows.each(function (s, i) {
    const g = d3.select(this), c = colors[i];
    const clampDate = d => new Date(Math.min(+LAST_DAY, Math.max(+FIRST_DAY, +d)));
    if (s.kind === "summer") d3.range(y0 + 1, y1 + 1).forEach(y => band(g, clampDate(new Date(y, 5, 1)), clampDate(new Date(y, 8, 1)), c));
    if (s.kind === "christmas") d3.range(y0, y1 + 1).forEach(y => band(g, clampDate(new Date(y, 11, 20)), clampDate(new Date(y + 1, 0, 7)), c));
    if (s.mark && s.kind === "comeback") {
      const [a, b] = s.mark.map(dayDate);
      g.append("line").attr("x1", x(a)).attr("x2", x(b)).attr("y1", base).attr("y2", base).attr("stroke", c).attr("stroke-width", 1.5).attr("stroke-dasharray", "3 5");
      g.append("text").attr("x", (x(a) + x(b)) / 2).attr("y", base - 8).attr("text-anchor", "middle").style("fill", "var(--ink-2)").style("font-size", "12px")
        .text(`${fmt(Math.round((b - a) / DAY_MS))} days of silence`);
    } else if (s.mark) {
      const [a, b] = s.mark.map(dayDate);
      /* A short bar under the dots marks the streak or the binge week. */
      g.append("line").attr("x1", x(a) - 3).attr("x2", x(b) + 3).attr("y1", base + 13).attr("y2", base + 13).attr("stroke", c).attr("stroke-width", 2.5).attr("stroke-linecap", "round");
    }
  });
  const waiting = isWaiting("stories");
  const dots = rows.selectAll("circle").data((s, i) => s.days.map(([day, n]) => ({ s, i, day, n }))).join("circle")
    .attr("cx", d => x(dayDate(d.day))).attr("cy", base).attr("r", d => (waiting ? 0 : rad(d.n)))
    .attr("fill", d => colors[d.i]).attr("fill-opacity", 0.9).attr("filter", "url(#story-glow)");
  if (waiting) revealOnView("stories", root, () => dots.transition().delay(d => d.i * 90 + (x(dayDate(d.day)) / W) * 700).duration(500)
    .ease(d3.easeBackOut.overshoot(2)).attr("r", d => rad(d.n)));
  /* Label: the story in big type, the song beneath it. Desktop puts it in a left column. */
  const lx = inset, ly = phone ? 18 : base - 4;
  const label = rows.append("text").attr("x", lx).attr("y", ly).style("pointer-events", "none");
  label.append("tspan").style("fill", "var(--ink)").style("font-size", phone ? "15px" : "16px").style("font-weight", 650).text(s => s.title);
  rows.append("text").attr("x", lx).attr("y", ly + (phone ? 17 : 18)).style("fill", "var(--muted)").style("font-size", "12px").style("pointer-events", "none")
    .text(s => { const t = `${s.track} · ${s.artist}`, max = phone ? 46 : Math.floor(labelW / 6.6); return t.length > max ? `${t.slice(0, max - 1)}…` : t; });
  const showRow = (event, s) => {
    rows.attr("opacity", d => (d === s ? 1 : 0.28));
    showTip(event, `<b>${esc(s.track)}</b>${esc(s.artist)}<br>${esc(s.title)}: ${esc(s.note)}<br><span class="k">${fmt(s.plays)} plays on ${s.days.length} days</span>`);
  };
  const showDot = (event, d) => {
    rows.attr("opacity", r => (r === d.s ? 1 : 0.28));
    showTip(event, `<b>${esc(d.s.track)}</b>${esc(d.s.artist)}<br>${longDay(dayDate(d.day))}: ${d.n} play${d.n > 1 ? "s" : ""}<br><span class="k">${esc(d.s.title)}: ${esc(d.s.note)}</span>`);
  };
  const clear = () => { rows.attr("opacity", 1); hideTip(); };
  rows.on("pointermove", showRow).on("pointerleave", clear);
  dots.on("pointermove", (event, d) => { event.stopPropagation(); showDot(event, d); });
  keyboardTour(svg, rows, showRow, clear);
  const birthday = S.find(s => s.kind === "birthday");
  if (birthday) headline("story-title")`One song I only play on birthdays: “${birthday.track}”, ${N(`${birthday.plays} plays`)} on just ${birthday.days.length} days.`;
  else headline("story-title")`Ten songs, ten stories: “${S[0].track}” ${N(S[0].title.toLowerCase())}.`;
}

/* ================= 4. Canserbero's climb ================= */
function drawRank() {
  const R = D.rank, root = document.getElementById("rank");
  root.innerHTML = "";
  const W = widthOf(root), H = heightOf(root, 360), inset = insetOf();
  const pts = MONTHS.map((m, i) => ({ m, i, rank: R.rank[i], field: R.field[i], share: R.share[i], hours: R.hoursByMonth[i] }));
  const ranked = pts.filter(p => p.rank !== null);
  const maxRank = d3.max(ranked, p => p.rank);
  const x = d3.scaleTime().domain(d3.extent(MONTHS)).range([inset + 34, W - inset]);
  const y = d3.scaleLog().domain([1, maxRank * 1.15]).range([30, H - 34]);
  const svg = d3.select(root).append("svg").attr("width", W).attr("height", H).attr("role", "img")
    .attr("aria-label", `${R.artist}'s monthly rank among all the artists I played, by hours`);
  yearTicks(svg, x, H, x.range()[0]);
  [1, 2, 5, 10, 20, 50, 100, 200].filter(r => r <= maxRank * 1.15).forEach(r => {
    svg.append("line").attr("x1", x.range()[0]).attr("x2", W).attr("y1", y(r)).attr("y2", y(r)).attr("stroke", r === 1 ? "#35353d" : "#1d1d22");
    svg.append("text").attr("x", inset).attr("y", y(r) + 4).style("fill", r === 1 ? "var(--ink)" : "var(--muted)").style("font-weight", r === 1 ? 650 : 400).text(`#${r}`);
  });
  const defs = svg.append("defs");
  const glow = defs.append("filter").attr("id", "rank-glow").attr("x", "-20%").attr("y", "-50%").attr("width", "140%").attr("height", "200%");
  glow.append("feGaussianBlur").attr("stdDeviation", 4).attr("result", "b");
  const merge = glow.append("feMerge"); merge.append("feMergeNode").attr("in", "b"); merge.append("feMergeNode").attr("in", "SourceGraphic");
  const line = d3.line().defined(p => p.rank !== null).x(p => x(p.m)).y(p => y(p.rank)).curve(d3.curveMonotoneX);
  const path = svg.append("path").datum(pts).attr("d", line).attr("fill", "none").attr("stroke", ACCENT).attr("stroke-width", 3).attr("stroke-linejoin", "round").attr("filter", "url(#rank-glow)");
  const dots = svg.append("g").selectAll("circle").data(ranked).join("circle").attr("cx", p => x(p.m)).attr("cy", p => y(p.rank))
    .attr("r", p => (p.rank === 1 ? 5 : 2.5)).attr("fill", p => (p.rank === 1 ? ACCENT : "#09090b")).attr("stroke", ACCENT).attr("stroke-width", 1.5);
  /* Annotations: where it started and when it first reached the top. */
  const first = ranked[0], firstTop = ranked.find(p => p.rank === 1);
  const note = (p, text, below) => {
    const tx = Math.min(W - inset - 6, Math.max(x.range()[0] + 4, x(p.m) + 10));
    const anchor = x(p.m) > W - 220 ? "end" : "start";
    svg.append("text").attr("x", anchor === "end" ? x(p.m) - 10 : tx).attr("y", y(p.rank) + (below ? 22 : -12)).attr("text-anchor", anchor)
      .style("fill", "var(--ink)").style("font-size", "13px").style("font-weight", 600).attr("paint-order", "stroke").attr("stroke", "#09090b").attr("stroke-width", 4).text(text);
  };
  note(first, `#${first.rank} in ${monthName(first.m)}`, true);
  if (firstTop) note(firstTop, `First #1, ${monthName(firstTop.m)}`, false);
  if (isWaiting("rank")) {
    const L = path.node().getTotalLength();
    path.attr("stroke-dasharray", `${L} ${L}`).attr("stroke-dashoffset", L);
    dots.attr("opacity", 0);
    revealOnView("rank", root, () => {
      path.transition().duration(2200).ease(d3.easeCubicInOut).attr("stroke-dashoffset", 0).on("end", () => path.attr("stroke-dasharray", null));
      dots.transition().delay(p => 200 + ((x(p.m) - x.range()[0]) / (x.range()[1] - x.range()[0])) * 2000).duration(250).attr("opacity", 1);
    });
  }
  const guide = svg.append("line").attr("y1", 0).attr("y2", H - 24).attr("stroke", "var(--ink-2)").attr("stroke-dasharray", "2 3").attr("opacity", 0);
  const show = (event, p) => {
    guide.attr("x1", x(p.m)).attr("x2", x(p.m)).attr("opacity", 1);
    dots.attr("r", d => (d === p ? 7 : d.rank === 1 ? 5 : 2.5));
    showTip(event, p.rank === null ? `<b>${monthName(p.m)}</b>No ${esc(R.artist)} that month`
      : `<b>${monthName(p.m)}</b>#${p.rank} of ${fmt(p.field)} artists<br>${fmtH(p.hours)} hours, ${pct(p.share)} of everything I played`);
  };
  const clear = () => { guide.attr("opacity", 0); dots.attr("r", d => (d.rank === 1 ? 5 : 2.5)); hideTip(); };
  const step = (x.range()[1] - x.range()[0]) / (MONTHS.length - 1);
  const hit = svg.append("g").selectAll("rect").data(pts).join("rect").attr("x", p => x(p.m) - step / 2).attr("width", step).attr("y", 0).attr("height", H - 24).attr("fill", "transparent");
  hit.on("pointermove", show).on("pointerleave", clear);
  keyboardTour(svg, hit.filter(p => p.rank !== null), show, clear);
  /* Year strip: months at #1 that year and the song that carried it. */
  const years = d3.groups(pts.filter(p => p.rank !== null), p => p.m.getFullYear());
  document.getElementById("rank-years").innerHTML = years.map(([yr, ps]) => {
    const era = R.eras.find(e => e.year === yr), tops = ps.filter(p => p.rank === 1).length;
    return `<div class="year"><span>${yr}</span><span class="big">${tops ? `#1 × ${tops}` : `best #${d3.min(ps, p => p.rank)}`}</span><span class="song">${era ? esc(era.song) : ""}</span></div>`;
  }).join("");
  const tops = ranked.filter(p => p.rank === 1).length;
  headline("rank-title")`${R.artist} went from #${first.rank} in ${monthName(first.m)} to my top artist in ${N(`${tops} different months`)}.`;
  setText("rank-sub", `The line is his rank among every artist I played that month, by hours, with #1 at the top; lime dots are months he led, gaps are months without him. ` +
    `Under each year, the song I played most.`);
}

/* ================= 5. Genre galaxy ================= */
const galaxy = { year: "all", isolated: null, sim: null };
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
  const phone = isPhone(), W = widthOf(root), H = heightOf(root, 760), inset = insetOf();
  const yi = () => (galaxy.year === "all" ? -1 : G.years.indexOf(galaxy.year));
  const hoursOf = a => (yi() < 0 ? d3.sum(a.hy) : a.hy[yi()]);
  /* Genre homes on an ellipse; the biggest genre sits at the top. */
  const homes = G.genres.map((_, g) => {
    const a = -Math.PI / 2 + (g / G.genres.length) * Math.PI * 2;
    return [W / 2 + Math.cos(a) * W * (phone ? 0.25 : 0.33), H / 2 + Math.sin(a) * H * (phone ? 0.37 : 0.3)];
  });
  const nodes = G.artists.map((a, i) => ({ a: a.a, g: a.g, hy: a.y, i, x: homes[a.g][0] + (jitter(i) - 0.5) * 40, y: homes[a.g][1] + (jitter(i + 3) - 0.5) * 40, r: 0 }));
  const svg = d3.select(root).append("svg").attr("width", W).attr("height", H).attr("role", "img")
    .attr("aria-label", "Bubbles of my top artists grouped by genre, sized by hours");
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
    const rad = d3.scaleSqrt().domain([0, d3.max(nodes, hoursOf) || 1]).range([0, maxR]);
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
    tagHours.text(g => { const k = G.genres.indexOf(g); return `${fmtH(d3.sum(nodes.filter(d => d.g === k), hoursOf))} h`; });
  }
  const collide = d3.forceCollide().iterations(2);
  const sim = d3.forceSimulation(nodes)
    .force("x", d3.forceX(d => homes[d.g][0]).strength(0.09))
    .force("y", d3.forceY(d => homes[d.g][1]).strength(0.09))
    .force("collide", collide)
    .alphaDecay(0.03).on("tick", () => {
      nodes.forEach(d => { d.r += (d.target - d.r) * 0.12; d.x = Math.max(d.r + 2, Math.min(W - d.r - 2, d.x)); d.y = Math.max(d.r + 30, Math.min(H - d.r - 2, d.y)); });
      render();
    }).stop();
  galaxy.sim = sim;
  radii();
  const waiting = isWaiting("genres");
  if (!waiting) { nodes.forEach(d => { d.r = d.target; }); for (let i = 0; i < 260; i++) sim.tick(); render(); }
  else {
    render();
    revealOnView("genres", root, () => sim.alpha(1).restart());
  }
  const yearBox = document.getElementById("genre-years");
  yearBox.innerHTML = ["all", ...G.years].map(y => `<button type="button" data-year="${y}" aria-pressed="${galaxy.year === y}">${y === "all" ? "All years" : y}</button>`).join("");
  yearBox.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
    galaxy.year = b.dataset.year === "all" ? "all" : +b.dataset.year;
    yearBox.querySelectorAll("button").forEach(o => o.setAttribute("aria-pressed", String(o === b)));
    radii();
    if (REDUCED) { nodes.forEach(d => { d.r = d.target; }); for (let i = 0; i < 200; i++) sim.tick(); render(); }
    else sim.alpha(0.7).restart();
  }));
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
  setText("genre-sub", "Each bubble is an artist, sized by hours and grouped by genre. Pick a year to watch the clusters grow and shrink, or a genre to isolate it.");
  setText("genre-how", `The Spotify export has no genre field, so I tagged my ${G.artists.length} most played artists by hand, one genre each. ` +
    `They cover ${pct(G.coverage)} of all my hours; the long tail of other artists is left out of this chart.`);
}

/* ================= 6. Seasons ================= */
const seasons = { isolated: null };
function drawSeasons() {
  const S = D.seasons.songs, root = document.getElementById("seasons");
  root.innerHTML = "";
  const W = widthOf(root), H = heightOf(root, Math.min(widthOf(root) + 40, 520));
  const size = Math.min(W, H), R = size / 2 - (size < 420 ? 30 : 40), cx = W / 2, cy = H / 2;
  const svg = d3.select(root).append("svg").attr("width", W).attr("height", H).attr("role", "img")
    .attr("aria-label", "Radial chart of the year: each song sits at the month it peaks, further out when its plays crowd into one season");
  const g = svg.append("g").attr("transform", `translate(${cx},${cy})`);
  const angle = doy => ((doy - 1) / 365.25) * Math.PI * 2;
  const rr = d3.scaleLinear().domain([0, d3.max(S, s => s.r)]).range([0, R]);
  const pos = s => [Math.sin(angle(s.doy)) * rr(s.r), -Math.cos(angle(s.doy)) * rr(s.r)];
  /* Seasons as faint wedges, months around the rim. */
  const SEASON_WEDGES = [["Winter", 335, 425], ["Spring", 60, 152], ["Summer", 152, 244], ["Autumn", 244, 335]];
  SEASON_WEDGES.forEach(([name, a, b], k) => {
    g.append("path").attr("d", d3.arc()({ innerRadius: 0, outerRadius: R, startAngle: angle(a), endAngle: angle(b) })).attr("fill", k % 2 ? "#121216" : "#0d0d10");
    const mid = angle((a + b) / 2), lr = R * 0.86;
    if (size >= 420) g.append("text").attr("x", Math.sin(mid) * lr).attr("y", -Math.cos(mid) * lr + 4).attr("text-anchor", "middle")
      .style("fill", "#4d4c56").style("font-size", "12px").style("letter-spacing", ".14em").style("text-transform", "uppercase").text(name);
  });
  [0.33, 0.66, 1].forEach(f => g.append("circle").attr("r", R * f).attr("fill", "none").attr("stroke", "#232329"));
  d3.range(12).forEach(mo => {
    const doy = d3.timeDay.count(new Date(2021, 0, 1), new Date(2021, mo, 1)) + 1, a = angle(doy);
    g.append("line").attr("x1", 0).attr("y1", 0).attr("x2", Math.sin(a) * R).attr("y2", -Math.cos(a) * R).attr("stroke", "#1b1b20");
    const am = angle(doy + 15);
    g.append("text").attr("x", Math.sin(am) * (R + 16)).attr("y", -Math.cos(am) * (R + 16) + 4).attr("text-anchor", "middle")
      .text(d3.timeFormat(size < 420 ? "%b" : "%B")(new Date(2021, mo, 1)).slice(0, size < 420 ? 1 : 3));
  });
  g.append("text").attr("y", 4).attr("text-anchor", "middle").style("fill", "var(--muted)").style("font-size", "11px").text("all year");
  const rad = d3.scaleSqrt().domain([0, d3.max(S, s => s.n)]).range([1.5, size < 420 ? 6 : 9]);
  const waiting = isWaiting("seasons");
  const dots = g.append("g").selectAll("circle").data(S).join("circle").attr("r", s => rad(s.n)).attr("fill", s => genreColor(s.g)).attr("fill-opacity", 0.85)
    .attr("stroke", "#09090b").attr("stroke-width", 0.8)
    .attr("cx", s => (waiting ? 0 : pos(s)[0])).attr("cy", s => (waiting ? 0 : pos(s)[1]));
  if (waiting) {
    dots.attr("opacity", 0);
    revealOnView("seasons", root, () => dots.transition().delay(s => s.r * 900).duration(1100).ease(d3.easeCubicOut)
      .attr("opacity", 1).attr("cx", s => pos(s)[0]).attr("cy", s => pos(s)[1]));
  }
  /* Label the most seasonal songs that came back over several years. */
  const labelled = S.filter(s => s.yrs >= 3).sort((a, b) => b.r * Math.sqrt(b.n) - a.r * Math.sqrt(a.n)).slice(0, size < 420 ? 3 : 7);
  const spots = labelled.map(s => {
    const [px, py] = pos(s), right = px >= 0, text = s.t.length > 26 ? `${s.t.slice(0, 25)}…` : s.t, w = text.length * 6.6;
    const lx = right ? px + rad(s.n) + 4 : px - rad(s.n) - 4;
    return { s, px, py, lx, right, text, box: { x0: right ? lx : lx - w, x1: right ? lx + w : lx, y0: py - 8, y1: py + 8 } };
  }).filter(p => p.box.x0 > 4 - cx && p.box.x1 < W - cx - 4); // never cut off by the screen edge
  const labels = g.append("g").style("pointer-events", "none").style("opacity", waiting ? 0 : 1);
  placeWithoutOverlap(spots, p => p.box).forEach(p => {
    labels.append("text").attr("x", p.lx).attr("y", p.py + 4).attr("text-anchor", p.right ? "start" : "end").style("fill", "var(--ink)").style("font-size", "12px").style("font-weight", 600)
      .attr("paint-order", "stroke").attr("stroke", "#09090b").attr("stroke-width", 3).text(p.text);
  });
  if (waiting) revealOnView("seasons-labels", root, () => labels.transition().delay(MOTION_MS + 400).duration(400).style("opacity", 1));
  const isolate = () => dots.attr("opacity", s => (seasons.isolated === null || s.g === seasons.isolated ? 1 : 0.1));
  const legend = document.getElementById("season-legend");
  legend.innerHTML = D.genres.genres.map((name, k) => `<li><button type="button" data-g="${k}" aria-pressed="${seasons.isolated === k}"><i style="background:${genreColor(k)}"></i>${esc(name)}</button></li>`).join("") +
    `<li><i style="background:${OTHER}"></i>Other</li>`;
  legend.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
    const k = +b.dataset.g; seasons.isolated = seasons.isolated === k ? null : k;
    legend.querySelectorAll("button").forEach(o => o.setAttribute("aria-pressed", String(+o.dataset.g === seasons.isolated)));
    isolate();
  }));
  if (!waiting) isolate();
  const show = (event, s) => {
    dots.attr("stroke", o => (o === s ? "var(--ink)" : "#09090b")).attr("stroke-width", o => (o === s ? 2 : 0.8));
    showTip(event, `<b>${esc(s.t)}</b>${esc(s.a)}<br>Peaks in ${monthFull(s.doy)}; ${s.n} plays over ${s.yrs} years<br><span class="k">${s.r > 0.6 ? "Strongly seasonal" : s.r > 0.3 ? "Leans to one season" : "Plays all year"}</span>`);
  };
  const clear = () => { dots.attr("stroke", "#09090b").attr("stroke-width", 0.8); hideTip(); };
  const delaunay = d3.Delaunay.from(S, s => cx + pos(s)[0], s => cy + pos(s)[1]);
  svg.on("pointermove", event => {
    const [mx, my] = d3.pointer(event, svg.node()), s = S[delaunay.find(mx, my)], [px, py] = pos(s);
    if (Math.hypot(cx + px - mx, cy + py - my) > 16) { clear(); return; }
    show(event, s);
  }).on("pointerleave", clear);
  keyboardTour(svg, dots.filter(s => labelled.includes(s)), show, clear);
  const best = S.filter(s => s.yrs >= 4).reduce((a, b) => (b.r > a.r ? b : a));
  headline("season-title")`“${best.t}” comes back every ${monthFull(best.doy)}: ${N(`${best.yrs} years`)}, always the same season.`;
}

/* ================= 7. Travel map ================= */
const travel = { selected: 170, transform: null }; // Colombia open by default, so the panel is never empty
const MAP_VIEWS = {
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
  Object.keys(MAP_VIEWS).forEach(v => presets.append("button").attr("type", "button").attr("aria-pressed", "false").text(v[0].toUpperCase() + v.slice(1))
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
  else if (phone) svg.call(zoom.transform, boundsOf(MAP_VIEWS.europe));
  else placeLabels(1);
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

/* ================= 8. Layer cake ================= */
function drawCohorts() {
  const C = D.cohorts, root = document.getElementById("cohorts");
  root.innerHTML = "";
  const W = widthOf(root), H = heightOf(root, 380), inset = insetOf();
  const smooth = s => s.map((v, i) => ((s[i - 1] ?? v) + 2 * v + (s[i + 1] ?? v)) / 4);
  const series = C.series.map(smooth);
  const rows = MONTHS.map((_, m) => Object.fromEntries(series.map((s, k) => [k, s[m]])));
  const stack = d3.stack().keys(series.map((_, k) => k))(rows);
  const x = d3.scaleTime().domain(d3.extent(MONTHS)).range([0, W]);
  const y = d3.scaleLinear().domain([0, d3.max(stack.at(-1), d => d[1]) * 1.05]).range([H - 30, 10]);
  const area = d3.area().x((_, i) => x(MONTHS[i])).y0(d => y(d[0])).y1(d => y(d[1])).curve(d3.curveBasis);
  const svg = d3.select(root).append("svg").attr("width", W).attr("height", H).attr("role", "img")
    .attr("aria-label", "Stacked area of monthly hours, coloured by the year I first heard each artist");
  yearTicks(svg, x, H, inset);
  y.ticks(4).filter(v => v > 0).forEach(v => {
    svg.append("line").attr("x1", 0).attr("x2", W).attr("y1", y(v)).attr("y2", y(v)).attr("stroke", "#1d1d22");
    svg.append("text").attr("x", W - inset).attr("y", y(v) - 4).attr("text-anchor", "end").text(`${v} h`);
  });
  const label = c => (c === "before" ? "Known before 2021" : `Met in ${c}`);
  const bands = svg.append("g").attr("clip-path", wipeClip(svg, "cohorts", root, W, H)).selectAll("path").data(stack).join("path").attr("d", area)
    .attr("fill", (_, k) => COHORT_COLORS[k]).attr("stroke", "#09090b").attr("stroke-width", 0.6);
  /* Each layer is named at its thickest month when the label fits inside it. */
  const labels = svg.append("g").style("pointer-events", "none").style("opacity", isWaiting("cohort-labels") ? 0 : 1);
  /* A spot counts only if the band holds the label along its whole width. */
  const fits = (s, cx, cy, w) => MONTHS.every((mo, m) => { const mx = x(mo); return mx < cx - w / 2 || mx > cx + w / 2 || (y(s[m][1]) < cy - 9 && y(s[m][0]) > cy + 9); });
  const spots = stack.map((s, k) => {
    const w = label(C.cohorts[k]).length * 7.2 + 8;
    const tries = d3.range(MONTHS.length).sort((a, b) => (s[b][1] - s[b][0]) - (s[a][1] - s[a][0])).slice(0, 16);
    for (const i of tries) {
      const cx = Math.min(W - inset - w / 2, Math.max(inset + w / 2, x(MONTHS[i]))), cy = y((s[i][0] + s[i][1]) / 2);
      if (fits(s, cx, cy, w)) return { k, cx, cy, w };
    }
    return null;
  }).filter(Boolean);
  placeWithoutOverlap(spots, p => ({ x0: p.cx - p.w / 2, x1: p.cx + p.w / 2, y0: p.cy - 9, y1: p.cy + 9 })).forEach(p => {
    labelOn(labels.append("text").attr("x", p.cx).attr("y", p.cy + 4).attr("text-anchor", "middle").text(label(C.cohorts[p.k])), p.k === 0 ? OTHER : COHORT_COLORS[p.k]);
  });
  if (isWaiting("cohort-labels")) revealOnView("cohort-labels", root, () => labels.transition().delay(MOTION_MS).duration(400).style("opacity", 1));
  const guide = svg.append("line").attr("y1", 0).attr("y2", H - 24).attr("stroke", "var(--ink)").attr("opacity", 0);
  const step = W / (MONTHS.length - 1);
  const hit = svg.append("g").selectAll("rect").data(MONTHS).join("rect").attr("x", m => x(m) - step / 2).attr("width", step).attr("y", 0).attr("height", H - 24).attr("fill", "transparent");
  const show = (event, m) => {
    const i = MONTHS.indexOf(m), total = d3.sum(C.series, s => s[i]);
    guide.attr("x1", x(m)).attr("x2", x(m)).attr("opacity", 0.6);
    const parts = C.cohorts.map((c, k) => [c, k, C.series[k][i]]).filter(p => p[2] > 0.05).reverse();
    showTip(event, `<b>${monthName(m)}</b>${fmtH(total)} hours<br>` + parts.map(([c, k, v]) => `<span style="color:${COHORT_COLORS[k]}">■</span> ${label(c)}: ${pct(v / total)}`).join("<br>"));
  };
  const clear = () => { guide.attr("opacity", 0); hideTip(); };
  hit.on("pointermove", show).on("pointerleave", clear);
  keyboardTour(svg, hit, show, clear);
  setLegend("cohort-legend", C.cohorts.map((c, k) => [esc(c === "before" ? "Known before 2021" : `${c} · ${fmt(C.met[c] ?? 0)} new artists`), COHORT_COLORS[k]]));
  const lastYear = String(LAST_DAY.getFullYear()), idx = MONTHS.map((m, i) => [m, i]).filter(([m]) => String(m.getFullYear()) === lastYear).map(([, i]) => i);
  const yearTotal = d3.sum(idx, i => d3.sum(C.series, s => s[i]));
  const oldK = C.cohorts.map((c, k) => [c, k]).filter(([c]) => c === "before" || +c <= 2022).map(([, k]) => k);
  const oldShare = d3.sum(idx, i => d3.sum(oldK, k => C.series[k][i])) / yearTotal;
  const newShare = d3.sum(idx, i => C.series[C.cohorts.indexOf(lastYear)][i]) / yearTotal;
  headline("cohort-title")`${N(pct(oldShare))} of my ${lastYear} listening still goes to artists I met before 2023.`;
  setText("cohort-sub", `Monthly hours, coloured by the year I first heard each artist. Every year adds a layer; artists I met in ${lastYear} take ${pct(newShare)} of it so far.`);
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
