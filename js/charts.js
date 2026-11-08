/* ============================================================
 * 轻量 SVG 图表引擎（零依赖，替代 plotly / matplotlib）
 * ============================================================ */
(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const PALETTE = {
    blue: '#1e88e5', blueDark: '#1565c0', blueLight: '#90caf9',
    green: '#2f9e62', greenLight: '#a5d6a7',
    orange: '#f0a020', red: '#e5484d',
    grey: '#94a3b8', ink: '#17202b', ink2: '#4a5768', ink3: '#78869a',
    line: '#e2e8f0', grid: '#eef2f7',
  };

  function el(name, attrs, parent) {
    const node = document.createElementNS(NS, name);
    if (attrs) for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }
  function text(parent, x, y, str, attrs) {
    const t = el('text', Object.assign({ x, y, fill: PALETTE.ink2, 'font-size': 11 }, attrs || {}), parent);
    t.textContent = str;
    return t;
  }
  function svgRoot(mount, w, h) {
    mount.innerHTML = '';
    const svg = el('svg', {
      viewBox: `0 0 ${w} ${h}`, width: '100%',
      preserveAspectRatio: 'xMidYMid meet',
      style: `max-height:${h}px;font-family:inherit`,
    }, mount);
    return svg;
  }
  function niceStep(span, target) {
    const raw = span / target;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
    return step * mag;
  }
  function fmt(v, d) {
    if (!isFinite(v)) return '—';
    return Number(v).toFixed(d === undefined ? 1 : d);
  }
  function measure(str) { return String(str).length * 6.2; }

  // ---------------- 条形图 + 双轴折线 ----------------
  function barLine(mount, opt) {
    const W = 640, H = opt.height || 340;
    const m = { t: 26, r: 56, b: 62, l: 52 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const svg = svgRoot(mount, W, H);
    const cats = opt.categories;
    const bars = opt.barValues, line = opt.lineValues;
    const barMax = Math.max(...bars) * 1.25 || 1;
    const lineMax = Math.max(...line) * 1.25 || 1;
    const bandW = iw / cats.length;

    // 网格 + 左轴
    const stepL = niceStep(barMax, 5);
    for (let v = 0; v <= barMax + 1e-9; v += stepL) {
      const y = m.t + ih - (v / barMax) * ih;
      el('line', { x1: m.l, x2: m.l + iw, y1: y, y2: y, stroke: PALETTE.grid, 'stroke-width': 1 }, svg);
      text(svg, m.l - 8, y + 4, fmt(v, 0), { 'text-anchor': 'end', fill: PALETTE.ink3, 'font-size': 10 });
    }
    // 柱子
    const bw = Math.min(64, bandW * 0.46);
    cats.forEach((c, i) => {
      const cx = m.l + bandW * i + bandW / 2;
      const bh = (bars[i] / barMax) * ih;
      const y = m.t + ih - bh;
      el('rect', {
        x: cx - bw / 2, y, width: bw, height: Math.max(bh, 0.6), rx: 4,
        fill: PALETTE.blue, opacity: 0.88,
      }, svg);
      text(svg, cx, y - 7, fmt(bars[i], 1), {
        'text-anchor': 'middle', fill: PALETTE.blueDark, 'font-size': 10.5, 'font-weight': 600,
      });
      // 分类标签（可能换行）
      const parts = String(c).split(' ');
      if (parts.length > 1 && measure(c) > bandW) {
        text(svg, cx, m.t + ih + 20, parts[0], { 'text-anchor': 'middle', fill: PALETTE.ink2, 'font-size': 11, 'font-weight': 500 });
        text(svg, cx, m.t + ih + 35, parts.slice(1).join(' '), { 'text-anchor': 'middle', fill: PALETTE.ink3, 'font-size': 10.5 });
      } else {
        text(svg, cx, m.t + ih + 21, c, { 'text-anchor': 'middle', fill: PALETTE.ink2, 'font-size': 11, 'font-weight': 500 });
      }
    });
    // 右轴
    const stepR = niceStep(lineMax, 5);
    for (let v = 0; v <= lineMax + 1e-9; v += stepR) {
      const y = m.t + ih - (v / lineMax) * ih;
      text(svg, m.l + iw + 10, y + 4, fmt(v, 0), { 'text-anchor': 'start', fill: PALETTE.red, 'font-size': 10, opacity: 0.8 });
    }
    // 折线
    const pts = cats.map((c, i) => {
      const cx = m.l + bandW * i + bandW / 2;
      const cy = m.t + ih - (line[i] / lineMax) * ih;
      return [cx, cy];
    });
    el('polyline', {
      points: pts.map((p) => p.join(',')).join(' '),
      fill: 'none', stroke: PALETTE.red, 'stroke-width': 2.6, 'stroke-linejoin': 'round',
    }, svg);
    pts.forEach((p, i) => {
      el('circle', { cx: p[0], cy: p[1], r: 5.5, fill: '#fff', stroke: PALETTE.red, 'stroke-width': 2.6 }, svg);
      text(svg, p[0], p[1] - 12, fmt(line[i], 0), {
        'text-anchor': 'middle', fill: PALETTE.red, 'font-size': 10.5, 'font-weight': 600,
      });
    });
    // 轴标题
    text(svg, m.l + iw / 2, H - 10, opt.xTitle || '', { 'text-anchor': 'middle', fill: PALETTE.ink3, 'font-size': 11 });
    const yl = el('text', {
      x: 12, y: m.t + ih / 2, 'text-anchor': 'middle', fill: PALETTE.blueDark, 'font-size': 11,
      transform: `rotate(-90 12 ${m.t + ih / 2})`,
    }, svg);
    yl.textContent = opt.yTitleLeft || '';
    const yr = el('text', {
      x: W - 10, y: m.t + ih / 2, 'text-anchor': 'middle', fill: PALETTE.red, 'font-size': 11,
      transform: `rotate(90 ${W - 10} ${m.t + ih / 2})`,
    }, svg);
    yr.textContent = opt.yTitleRight || '';
  }

  // ---------------- 折线图（级配曲线，对数 X 轴）----------------
  function gradeChart(mount, opt) {
    const W = 640, H = opt.height || 400;
    const m = { t: 20, r: 24, b: 78, l: 50 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const svg = svgRoot(mount, W, H);
    const sieves = opt.sieves;
    const lx = (v) => Math.log10(v);
    const x0 = lx(sieves[0]), x1 = lx(sieves[sieves.length - 1]);
    const X = (v) => m.l + ((lx(v) - x0) / (x1 - x0)) * iw;
    const Y = (v) => m.t + ih - (v / 100) * ih;

    // Y 网格
    for (let v = 0; v <= 100; v += 20) {
      el('line', { x1: m.l, x2: m.l + iw, y1: Y(v), y2: Y(v), stroke: PALETTE.grid }, svg);
      text(svg, m.l - 8, Y(v) + 4, v, { 'text-anchor': 'end', fill: PALETTE.ink3, 'font-size': 10 });
    }
    // X 刻度和网格
    const tickLabels = { 0.075: '0.075', 0.15: '0.15', 0.3: '0.3', 0.6: '0.6', 1.18: '1.18', 2.36: '2.36', 4.75: '4.75', 9.5: '9.5', 16: '16', 19: '19', 26.5: '26.5' };
    sieves.forEach((s) => {
      if (tickLabels[s] === undefined) return;
      el('line', { x1: X(s), x2: X(s), y1: m.t, y2: m.t + ih, stroke: PALETTE.grid, 'stroke-dasharray': '2 3' }, svg);
    });
    // 刻度文字分两行交错，避免对数轴上密集筛孔重叠
    sieves.forEach((s, idx) => {
      if (tickLabels[s] === undefined) return;
      const y = m.t + ih + (idx % 2 === 0 ? 16 : 28);
      el('line', { x1: X(s), x2: X(s), y1: m.t + ih, y2: y - 9, stroke: '#c9d3e0', 'stroke-width': 0.8 }, svg);
      text(svg, X(s), y, tickLabels[s], { 'text-anchor': 'middle', fill: PALETTE.ink3, 'font-size': 9 });
    });

    const series = [
      { data: opt.sand, color: PALETTE.green, dash: '5 4', width: 1.8, name: '砂级配' },
      { data: opt.gravel, color: PALETTE.orange, dash: '5 4', width: 1.8, name: '石级配' },
      { data: opt.combined, color: PALETTE.blue, dash: null, width: 2.8, name: `合成级配` },
    ];
    series.forEach((s) => {
      const d = sieves.map((v, i) => `${X(v)},${Y(s.data[i])}`).join(' ');
      el('polyline', {
        points: d, fill: 'none', stroke: s.color, 'stroke-width': s.width,
        'stroke-dasharray': s.dash || null, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      }, svg);
      if (!s.dash) sieves.forEach((v, i) => el('circle', { cx: X(v), cy: Y(s.data[i]), r: 3.2, fill: s.color }, svg));
    });

    text(svg, m.l + iw / 2, H - 30, '筛孔尺寸 (mm，对数坐标)', { 'text-anchor': 'middle', fill: PALETTE.ink3, 'font-size': 11 });
    const yl = el('text', {
      x: 13, y: m.t + ih / 2, 'text-anchor': 'middle', fill: PALETTE.ink3, 'font-size': 11,
      transform: `rotate(-90 13 ${m.t + ih / 2})`,
    }, svg);
    yl.textContent = '累计通过率 (%)';

    // 图例（置于图表底部，避免与曲线和刻度冲突）
    let lxPos = m.l;
    series.forEach((s) => {
      el('line', { x1: lxPos, x2: lxPos + 20, y1: H - 6, y2: H - 6, stroke: s.color, 'stroke-width': s.width, 'stroke-dasharray': s.dash || null }, svg);
      text(svg, lxPos + 25, H - 2, s.name, { fill: PALETTE.ink2, 'font-size': 10.5 });
      lxPos += 34 + measure(s.name) * 1.35;
    });
  }

  // ---------------- 热力图 ----------------
  function heatmap(mount, opt) {
    const W = 640, H = opt.height || 420;
    const m = { t: 24, r: 68, b: 54, l: 56 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const svg = svgRoot(mount, W, H);
    const wb = opt.wbArr, sr = opt.srArr;
    const cw = iw / wb.length, ch = ih / sr.length;

    // 颜色插值 0..6 → 红-黄-绿
    const stops = [
      [0, [229, 72, 77]], [0.34, [240, 160, 32]], [0.67, [166, 196, 92]], [1, [47, 158, 98]],
    ];
    function colorOf(n) {
      const t = Math.max(0, Math.min(1, n / 6));
      for (let i = 0; i < stops.length - 1; i++) {
        const [a, ca] = stops[i], [b, cb] = stops[i + 1];
        if (t >= a && t <= b) {
          const k = (t - a) / (b - a || 1);
          return `rgb(${ca.map((v, j) => Math.round(v + (cb[j] - v) * k)).join(',')})`;
        }
      }
      return 'rgb(47,158,98)';
    }

    for (let i = 0; i < sr.length; i++) {
      for (let j = 0; j < wb.length; j++) {
        const n = opt.countMap[i][j];
        const x = m.l + j * cw, y = m.t + ih - (i + 1) * ch;
        el('rect', {
          x: x + 1, y: y + 1, width: cw - 2, height: ch - 2, rx: 2.5,
          fill: colorOf(n), opacity: 0.35 + 0.65 * (n / 6),
        }, svg);
        text(svg, x + cw / 2, y + ch / 2 + 4, n, {
          'text-anchor': 'middle', 'font-size': cw > 30 ? 10.5 : 8.5,
          fill: n >= 4 ? '#fff' : PALETTE.ink, 'font-weight': 600,
        });
      }
    }

    // 轴标签
    wb.forEach((v, j) => {
      if (wb.length > 14 && j % 2) return;
      text(svg, m.l + j * cw + cw / 2, m.t + ih + 16, fmt(v, 2), { 'text-anchor': 'middle', fill: PALETTE.ink3, 'font-size': 9.5 });
    });
    sr.forEach((v, i) => {
      text(svg, m.l - 8, m.t + ih - (i + 0.5) * ch + 4, (v * 100).toFixed(0) + '%', {
        'text-anchor': 'end', fill: PALETTE.ink3, 'font-size': 9.5,
      });
    });
    text(svg, m.l + iw / 2, H - 14, '水胶比 W/B', { 'text-anchor': 'middle', fill: PALETTE.ink3, 'font-size': 11 });
    const yl = el('text', {
      x: 14, y: m.t + ih / 2, 'text-anchor': 'middle', fill: PALETTE.ink3, 'font-size': 11,
      transform: `rotate(-90 14 ${m.t + ih / 2})`,
    }, svg);
    yl.textContent = '砂率 βs';

    // 当前设计点
    const px = m.l + ((opt.markWb - wb[0]) / (wb[wb.length - 1] - wb[0])) * iw;
    const py = m.t + ih - ((opt.markSr - sr[0]) / (sr[sr.length - 1] - sr[0])) * ih;
    if (px >= m.l - 2 && px <= m.l + iw + 2 && py >= m.t - 2 && py <= m.t + ih + 2) {
      el('circle', { cx: px, cy: py, r: 7.5, fill: 'none', stroke: '#111', 'stroke-width': 2.2 }, svg);
      el('circle', { cx: px, cy: py, r: 3.4, fill: '#ffd400', stroke: '#111', 'stroke-width': 1.4 }, svg);
    }

    // 色标
    const cbX = m.l + iw + 16, cbW = 12;
    for (let k = 0; k <= 60; k++) {
      const seg = 6 * (1 - k / 60);
      el('rect', { x: cbX, y: m.t + (k / 60) * ih, width: cbW, height: ih / 60 + 0.8, fill: colorOf(seg) }, svg);
    }
    el('rect', { x: cbX, y: m.t, width: cbW, height: ih, fill: 'none', stroke: '#cfd8e3' }, svg);
    [0, 2, 4, 6].forEach((v) => {
      const y = m.t + ih - (v / 6) * ih;
      text(svg, cbX + cbW + 5, y + 3.5, v, { fill: PALETTE.ink3, 'font-size': 9.5 });
    });
    const cbl = el('text', {
      x: cbX + cbW + 26, y: m.t + ih / 2, 'text-anchor': 'middle', fill: PALETTE.ink3, 'font-size': 10,
      transform: `rotate(90 ${cbX + cbW + 26} ${m.t + ih / 2})`,
    }, svg);
    cbl.textContent = '满足约束条数';
  }

  // ---------------- 龙卷风图 ----------------
  function tornadoChart(mount, opt) {
    const rows = opt.rows;
    const H = Math.max(260, rows.length * 46 + 66);
    const W = 640;
    const m = { t: 30, r: 26, b: 40, l: 128 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const svg = svgRoot(mount, W, H);
    const allVals = rows.flatMap((r) => [r.lo, r.hi]);
    const span = Math.max(Math.abs(Math.min(...allVals, 0)), Math.abs(Math.max(...allVals, 0))) * 1.18 || 1;
    const X = (v) => m.l + iw / 2 + (v / span) * (iw / 2);
    const bandH = ih / rows.length;

    // 零线 + 网格
    [-span, -span / 2, 0, span / 2, span].forEach((v) => {
      el('line', {
        x1: X(v), x2: X(v), y1: m.t - 4, y2: m.t + ih + 4,
        stroke: v === 0 ? PALETTE.ink : PALETTE.grid, 'stroke-width': v === 0 ? 1.4 : 1,
      }, svg);
      text(svg, X(v), m.t + ih + 18, (v > 0 ? '+' : '') + v.toFixed(0) + '%', {
        'text-anchor': 'middle', fill: PALETTE.ink3, 'font-size': 9.5,
      });
    });

    rows.forEach((r, i) => {
      const cy = m.t + bandH * i + bandH / 2;
      const bh = Math.min(20, bandH * 0.42);
      const xa = X(0), xb = X(r.lo);
      el('rect', {
        x: Math.min(xa, xb), y: cy - bh - 1, width: Math.abs(xb - xa), height: bh, rx: 3,
        fill: PALETTE.blue, opacity: 0.85,
      }, svg);
      const xc = X(r.hi);
      el('rect', {
        x: Math.min(xa, xc), y: cy + 1, width: Math.abs(xc - xa), height: bh, rx: 3,
        fill: PALETTE.red, opacity: 0.85,
      }, svg);
      text(svg, m.l - 10, cy + 4, r.label, { 'text-anchor': 'end', fill: PALETTE.ink2, 'font-size': 11 });
    });

    text(svg, m.l + iw / 2, H - 8, opt.xTitle + ' 变化率 (%)', { 'text-anchor': 'middle', fill: PALETTE.ink3, 'font-size': 11 });
    // 图例
    el('rect', { x: m.l, y: 10, width: 12, height: 10, rx: 2, fill: PALETTE.blue }, svg);
    text(svg, m.l + 17, 19, '参数 −10%', { fill: PALETTE.ink2, 'font-size': 10.5 });
    el('rect', { x: m.l + 100, y: 10, width: 12, height: 10, rx: 2, fill: PALETTE.red }, svg);
    text(svg, m.l + 117, 19, '参数 +10%', { fill: PALETTE.ink2, 'font-size': 10.5 });
  }

  // ---------------- 直方图 ----------------
  function histogram(mount, opt) {
    const W = 640, H = opt.height || 340;
    const m = { t: 34, r: 20, b: 48, l: 48 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const svg = svgRoot(mount, W, H);
    const data = opt.values;
    const lo = opt.min, hi = opt.max, bins = opt.bins || 40;
    const counts = new Array(bins).fill(0);
    data.forEach((v) => {
      let k = Math.floor(((v - lo) / (hi - lo)) * bins);
      if (k < 0) k = 0; if (k >= bins) k = bins - 1;
      counts[k]++;
    });
    const maxC = Math.max(...counts) || 1;
    const X = (v) => m.l + ((v - lo) / (hi - lo)) * iw;
    const bw = iw / bins;

    for (let k = 0; k < bins; k++) {
      const bh = (counts[k] / maxC) * ih;
      const x = m.l + k * bw;
      const center = lo + (k + 0.5) * ((hi - lo) / bins);
      el('rect', {
        x: x + 0.4, y: m.t + ih - bh, width: Math.max(bw - 0.8, 0.8), height: bh,
        fill: center < opt.target ? PALETTE.red : PALETTE.blue, opacity: center < opt.target ? 0.42 : 0.72,
      }, svg);
    }
    // 轴
    const step = niceStep(hi - lo, 6);
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      el('line', { x1: X(v), x2: X(v), y1: m.t + ih, y2: m.t + ih + 4, stroke: '#c9d3e0' }, svg);
      text(svg, X(v), m.t + ih + 18, fmt(v, 1), { 'text-anchor': 'middle', fill: PALETTE.ink3, 'font-size': 9.5 });
    }
    for (let v = 0; v <= maxC; v += niceStep(maxC, 4)) {
      const y = m.t + ih - (v / maxC) * ih;
      el('line', { x1: m.l, x2: m.l + iw, y1: y, y2: y, stroke: PALETTE.grid }, svg);
      text(svg, m.l - 8, y + 3.5, Math.round(v), { 'text-anchor': 'end', fill: PALETTE.ink3, 'font-size': 9.5 });
    }
    // 目标线 / 均值线
    function vline(v, color, dash, label) {
      if (v < lo || v > hi) return;
      el('line', { x1: X(v), x2: X(v), y1: m.t - 6, y2: m.t + ih, stroke: color, 'stroke-width': 2, 'stroke-dasharray': dash }, svg);
      text(svg, X(v) + 4, m.t - 10, label, { fill: color, 'font-size': 10, 'font-weight': 600 });
    }
    vline(opt.target, PALETTE.red, '6 4', `目标 ${fmt(opt.target, 1)}`);
    vline(opt.mean, PALETTE.green, '2 3', `均值 ${fmt(opt.mean, 1)}`);

    text(svg, m.l + iw / 2, H - 10, '28 d 抗压强度 (MPa)', { 'text-anchor': 'middle', fill: PALETTE.ink3, 'font-size': 11 });
    text(svg, m.l - 8, m.t - 14, '频次', { 'text-anchor': 'end', fill: PALETTE.ink3, 'font-size': 10.5 });
  }

  // ---------------- 横向条形图（贡献分解）----------------
  function hbar(mount, opt) {
    const rows = opt.rows;
    const H = Math.max(260, rows.length * 52 + 60);
    const W = 640;
    const m = { t: 28, r: 62, b: 40, l: 138 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const svg = svgRoot(mount, W, H);
    const maxV = Math.max(...rows.map((r) => r.value)) * 1.15 || 1;
    const bandH = ih / rows.length;

    rows.forEach((r, i) => {
      const cy = m.t + bandH * i + bandH / 2;
      const bw2 = (r.value / maxV) * iw;
      const bh = Math.min(24, bandH * 0.52);
      const col = r.value > 0.3 ? PALETTE.red : r.value > 0.15 ? PALETTE.orange : PALETTE.green;
      el('rect', { x: m.l, y: cy - bh / 2, width: Math.max(bw2, 1.5), height: bh, rx: 3, fill: col, opacity: 0.88 }, svg);
      text(svg, m.l + bw2 + 7, cy + 4, (r.value * 100).toFixed(1) + '%', {
        fill: PALETTE.ink2, 'font-size': 11, 'font-weight': 600,
      });
      text(svg, m.l - 10, cy + 4, r.label, { 'text-anchor': 'end', fill: PALETTE.ink2, 'font-size': 11 });
    });
    el('line', { x1: m.l, x2: m.l, y1: m.t - 4, y2: m.t + ih, stroke: PALETTE.ink, 'stroke-width': 1.2 }, svg);
    text(svg, m.l + iw / 2, H - 10, opt.xTitle, { 'text-anchor': 'middle', fill: PALETTE.ink3, 'font-size': 11 });
  }

  global.Charts = { barLine, gradeChart, heatmap, tornadoChart, histogram, hbar, PALETTE };
})(window);
