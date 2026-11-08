/* ============================================================
 * 界面逻辑：读取输入 → 调内核 → 渲染
 * ============================================================ */
(function () {
  'use strict';
  const C = window.ConcreteCore;
  const Ch = window.Charts;
  const $ = (id) => document.getElementById(id);

  // ---------- 状态 ----------
  const state = {
    mcMode: 'normal',
    tornadoMode: 'wb',
    sandGrade: Object.assign({}, C.DEFAULT_SAND_GRADE),
    gravelGrade: Object.assign({}, C.DEFAULT_GRAVEL_GRADE),
    sandRatioManual: null,   // 级配滑块的独立值（初始跟随设计砂率）
    gradesDirty: false,
  };

  const prices = Object.assign({}, C.MATERIAL_PRICES);
  const co2Factors = Object.assign({}, C.MATERIAL_CO2);

  // ---------- 读取输入 ----------
  function readInputs() {
    const fcuK = $('fcuK').value;
    const cementGrade = parseFloat($('cementGrade').value);
    return {
      fcuK,
      fcuKVal: parseFloat(fcuK.replace('C', '')),
      sigma: C.getSigma(fcuK),
      slump: parseFloat($('slump').value) || 50,
      envClass: $('envClass').value,
      cementGrade,
      fce: parseFloat($('fce').value) || cementGrade,
      gammaC: C.getGammaC(cementGrade),
      aggType: $('aggType').value,
      dmax: parseFloat($('dmax').value),
      density: parseFloat($('density').value) || 2380,
      sandMoist: parseFloat($('sandMoist').value) || 0,
      gravelMoist: parseFloat($('gravelMoist').value) || 0,
      targetP: parseFloat($('targetP').value) / 100,
      fceStd: parseFloat($('fceStd').value) || 0,
      wbStd: parseFloat($('wbStd').value) || 0,
      gcStd: parseFloat($('gcStd').value) || 0,
      aaStd: parseFloat($('aaStd').value) || 0,
    };
  }

  // ---------- 成本计算（支持自定义单价）----------
  function calcCost(cement, flyAsh, slag, sand, gravel, water) {
    const cost =
      (cement * prices.cement + flyAsh * prices.fly_ash + slag * prices.slag +
        sand * prices.sand + gravel * prices.gravel + water * prices.water) / 1000;
    const co2 =
      cement * co2Factors.cement + flyAsh * co2Factors.fly_ash + slag * co2Factors.slag +
      sand * co2Factors.sand + gravel * co2Factors.gravel + water * co2Factors.water;
    return { cost, co2, binder: cement + flyAsh + slag };
  }

  // ---------- 主计算 ----------
  function compute(p) {
    const fcu0 = p.fcuKVal + 1.645 * p.sigma;
    const wbTheory = C.paulomiInverseWb(fcu0, p.fce, p.gammaC, p.aggType);
    const dur = C.getDurabilityLimit(p.envClass);
    const wbFinal = Math.min(wbTheory, dur.max_wb);
    const wbLimited = wbTheory > dur.max_wb;

    let water = C.getWaterConsumption(p.slump, p.dmax, p.aggType);
    let binder = water / wbFinal;
    let binderFinal = Math.max(binder, dur.min_binder);
    const binderRaised = binderFinal > binder + 1e-9;
    if (binderRaised) water = binderFinal * wbFinal;

    const sandRatio = C.getSandRatio(wbFinal, p.dmax, p.aggType);
    const { sand, gravel } = C.calculateAggregatesByWeight(binderFinal, water, sandRatio, p.density);
    const strengthTheory = C.paulomiStrength(wbFinal, p.fce, p.gammaC, p.aggType);
    const construction = C.constructionMix(binderFinal, sand, gravel, water, p.sandMoist, p.gravelMoist);
    const costCo2 = calcCost(binderFinal, 0, 0, sand, gravel, water);

    return {
      fcu0, wbTheory, wbFinal, wbLimited, dur, water, binder, binderFinal, binderRaised,
      sandRatio, sand, gravel, strengthTheory, construction, costCo2, p,
    };
  }

  // ---------- 工具 ----------
  const n1 = (v) => (isFinite(v) ? v.toFixed(1) : '—');
  const n2 = (v) => (isFinite(v) ? v.toFixed(2) : '—');
  const n4 = (v) => (isFinite(v) ? v.toFixed(4) : '—');
  const pct = (v, d) => (isFinite(v) ? (v * 100).toFixed(d === undefined ? 1 : d) + '%' : '—');

  function deltaSpan(v, digits, unit) {
    const shown = v.toFixed(digits);
    if (parseFloat(shown) === 0) return `<span style="color:#78869a;font-variant-numeric:tabular-nums">${shown}${unit || ''}</span>`;
    const cls = v > 0 ? 'color:#e5484d' : 'color:#2f9e62';
    const s = (v > 0 ? '+' : '') + shown;
    return `<span style="${cls};font-variant-numeric:tabular-nums">${s}${unit || ''}</span>`;
  }

  // ============================================================
  //  渲染
  // ============================================================
  let lastResult = null;
  let searchTimer = null;

  function render() {
    const p = readInputs();
    // 提示文字
    $('sigmaHint').textContent = `自动匹配 σ = ${p.sigma.toFixed(1)} MPa`;
    $('gammaHint').textContent = `自动匹配 γc = ${p.gammaC}`;
    const dur0 = C.getDurabilityLimit(p.envClass);
    $('envHint').textContent = `限制：W/B ≤ ${dur0.max_wb.toFixed(2)} · 胶材 ≥ ${dur0.min_binder} kg/m³`;
    $('targetPVal').textContent = (p.targetP * 100).toFixed(0) + '%';
    $('targetPShow').textContent = (p.targetP * 100).toFixed(0) + '%';

    const r = compute(p);
    lastResult = r;

    // ---- 告警 ----
    let alerts = '';
    if (r.wbLimited) {
      alerts += `<div class="alert error"><div>⚠️</div><div><b>耐久性复核触发：</b>理论 W/B = ${n4(r.wbTheory)} 超过 ${p.envClass} 类环境上限 ${r.dur.max_wb.toFixed(2)}，已自动取 W/B = ${n4(r.wbFinal)}。强度将有富余，可在试配阶段考虑掺加掺合料。</div></div>`;
    }
    if (r.binderRaised) {
      alerts += `<div class="alert warn"><div>ℹ️</div><div><b>最小胶材量控制：</b>按 W/B 计算得胶材 ${n1(r.binder)} kg/m³，低于 ${p.envClass} 类环境要求的 ${r.dur.min_binder} kg/m³，已提高至 ${n1(r.binderFinal)} kg/m³（用水量同步上调至 ${n1(r.water)} kg/m³）。</div></div>`;
    }
    if (p.fce < p.cementGrade - 5) {
      alerts += `<div class="alert warn"><div>ℹ️</div><div>水泥实测强度 f<sub>ce</sub> = ${n1(p.fce)} MPa 明显低于其强度等级 ${p.cementGrade}，请确认检测数据是否准确。</div></div>`;
    }
    $('alertBox').innerHTML = alerts;

    // ---- KPI ----
    $('k1').textContent = p.fcuKVal.toFixed(0) + ' MPa';
    $('k2').textContent = n1(r.fcu0) + ' MPa';
    $('k2n').textContent = `${p.fcuKVal.toFixed(0)} + 1.645×${p.sigma.toFixed(1)}`;
    $('k3').textContent = n4(r.wbFinal);
    $('k3n').textContent = r.wbLimited ? `理论 ${n4(r.wbTheory)}（已受耐久性限制）` : `理论值 ${n4(r.wbTheory)}`;
    $('k4').textContent = pct(r.sandRatio);
    $('k5').textContent = n1(r.strengthTheory) + ' MPa';

    // ---- 配合比表 ----
    const totalLab = r.binderFinal + r.water + r.sand + r.gravel;
    const totalSite = r.construction.cement + r.construction.water_site + r.construction.sand_wet + r.construction.gravel_wet;
    const rowsData = [
      ['水泥 C', r.binderFinal, r.construction.cement, 1.0],
      ['水 W', r.water, r.construction.water_site, r.water / r.binderFinal],
      ['砂 S', r.sand, r.construction.sand_wet, r.sand / r.binderFinal],
      ['石 G', r.gravel, r.construction.gravel_wet, r.gravel / r.binderFinal],
    ];
    const tbody = $('mixTable').querySelector('tbody');
    tbody.innerHTML = rowsData.map(([n, lab, site, ratio]) =>
      `<tr><td>${n}</td><td class="num">${n1(lab)}</td><td class="num">${n1(site)}</td><td class="num">${ratio.toFixed(2)}</td></tr>`
    ).join('') + `<tr class="total"><td>合计</td><td class="num">${n1(totalLab)}</td><td class="num">${n1(totalSite)}</td><td class="num">—</td></tr>`;

    $('costVal').textContent = n1(r.costCo2.cost) + ' 元/m³';
    $('co2Val').textContent = r.costCo2.co2.toFixed(0) + ' kgCO₂/m³';
    const densOk = Math.abs(totalLab - p.density) < 1;
    $('densVal').textContent = `${totalLab.toFixed(0)} / ${p.density.toFixed(0)}`;
    $('densVal').style.color = densOk ? '#2f9e62' : '#f0a020';

    // ---- 方案对比 ----
    const B = r.binderFinal;
    const plans = [
      { name: 'A 纯水泥', cement: B, fly_ash: 0, slag: 0 },
      { name: 'B 掺FA 25%', cement: B * 0.75, fly_ash: B * 0.25, slag: 0 },
      { name: 'C 掺SL 25%', cement: B * 0.75, fly_ash: 0, slag: B * 0.25 },
      { name: 'D FA15+SL15', cement: B * 0.70, fly_ash: B * 0.15, slag: B * 0.15 },
    ].map((pl) => Object.assign(pl, calcCost(pl.cement, pl.fly_ash, pl.slag, r.sand, r.gravel, r.water)));

    Ch.barLine($('planChart'), {
      categories: plans.map((x) => x.name),
      barValues: plans.map((x) => x.cost),
      lineValues: plans.map((x) => x.co2),
      yTitleLeft: '成本 (元/m³)', yTitleRight: '碳排放 (kgCO₂/m³)',
      height: 330,
    });
    const baseCost = plans[0].cost, baseCo2 = plans[0].co2;
    $('planTable').innerHTML = `
      <table class="data-table" style="margin-top:14px">
        <thead><tr><th>方案</th><th class="num">成本</th><th class="num">较A</th><th class="num">碳排放</th><th class="num">减碳</th></tr></thead>
        <tbody>${plans.map((x, i) => `
          <tr${i === 3 ? ' class="total"' : ''}>
            <td>${x.name}</td>
            <td class="num">${x.cost.toFixed(1)}</td>
            <td class="num">${deltaSpan(x.cost - baseCost, 1)}</td>
            <td class="num">${x.co2.toFixed(0)}</td>
            <td class="num" style="color:#2f9e62">${baseCo2 > 0 ? '-' + (((baseCo2 - x.co2) / baseCo2) * 100).toFixed(1) + '%' : '—'}</td>
          </tr>`).join('')}</tbody>
      </table>`;
    $('planTable').querySelector('table').parentElement.style.fontSize = '12px';

    // ---- 级配 ----
    if (state.sandRatioManual === null || !state.gradesDirty) {
      // 首次或未手动改：跟随设计砂率
      if (!state.sandRatioManual) {
        state.sandRatioManual = r.sandRatio;
        $('srSlider').value = Math.min(0.50, Math.max(0.15, r.sandRatio));
      }
    }
    renderGrade(r);
    renderFeasible(r);
    renderTornado(r);
    scheduleMonteCarlo(r);
  }

  function renderGrade(r) {
    const sr = parseFloat($('srSlider').value);
    $('srVal').textContent = pct(sr, 0);
    const cmps = C.synthesizeGradeCurve(state.sandGrade, state.gravelGrade, sr);
    const fm = C.computeFinenessModulus(state.sandGrade);
    const diag = C.classifyGrading(cmps);
    const fmType = fm < 1.5 ? '特细砂' : fm < 2.3 ? '细砂' : fm < 3.0 ? '中砂' : fm < 3.7 ? '粗砂' : '特粗砂';

    $('fmVal').textContent = fm.toFixed(2);
    $('fmType').textContent = fmType;
    $('gradeMsg').textContent = diag.text;
    $('gradeMsg').style.color = diag.level === 2 ? '#e5484d' : diag.level === 1 ? '#f0a020' : '#2f9e62';
    $('gradeMsg').style.fontSize = '12.5px';

    Ch.gradeChart($('gradeChart'), {
      sieves: C.STANDARD_SIEVES,
      sand: C.STANDARD_SIEVES.map((s) => (state.sandGrade[s] !== undefined ? state.sandGrade[s] : 100)),
      gravel: C.STANDARD_SIEVES.map((s) => (state.gravelGrade[s] !== undefined ? state.gravelGrade[s] : 100)),
      combined: cmps,
      height: 400,
    });
  }

  function renderFeasible(r) {
    const wbArr = [];
    for (let i = 0; i < 12; i++) wbArr.push(0.30 + (0.70 - 0.30) * (i / 11));
    const srArr = [];
    for (let i = 0; i < 11; i++) srArr.push(0.22 + (0.48 - 0.22) * (i / 10));

    const g = C.evaluateConstraintsGrid(wbArr, srArr, r.p.fcuKVal, r.p.sigma, r.p.fce, r.p.gammaC,
      r.p.aggType, r.p.dmax, r.p.slump, r.p.envClass, r.p.density);

    Ch.heatmap($('heatChart'), {
      wbArr, srArr, countMap: g.countMap, markWb: r.wbFinal, markSr: r.sandRatio, height: 460,
    });

    const fullCount = g.countMap.flat().filter((v) => v === 6).length;
    const chips = C.CONSTRAINT_NAMES.map((n, i) => {
      const pass = g.countMap.flat().filter((_, idx) => true);
      return `<span class="chip"><span class="dot" style="background:#1e88e5"></span>${i + 1}. ${n}</span>`;
    }).join('');
    $('constraintChips').innerHTML =
      `<span class="chip" style="background:#e8f6ee;border-color:#bfe3ce;color:#1d6b43;font-weight:600">全满足点：${fullCount} 个</span>` + chips;
  }

  function renderTornado(r) {
    const t = C.sensitivityTornado(r.p.fcuKVal, r.p.sigma, r.p.fce, r.p.gammaC,
      r.p.aggType, r.p.slump, r.p.dmax, r.p.density, prices.cement);
    $('tornadoSub').innerHTML = `基准 W/B = <b>${n4(t.base_wb)}</b> · 基准成本 = <b>${n1(t.base_cost)}</b> 元/m³ · 各参数 ±10% 扰动`;

    const key = state.tornadoMode;
    const rows = t.rows
      .map((x) => ({ label: x.label, lo: x[key + '_lo_pct'], hi: x[key + '_hi_pct'], impact: x[key + '_impact'] }))
      .sort((a, b) => b.impact - a.impact);

    Ch.tornadoChart($('tornadoChart'), {
      rows, xTitle: key === 'wb' ? 'W/B 水胶比' : '成本 元/m³',
    });
  }

  // ---- Monte Carlo（防抖，避免每次输入都跑）----
  function scheduleMonteCarlo(r) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runMonteCarlo(r), 220);
  }

  function runMonteCarlo(r) {
    const p = r.p;
    const alpha = C.paulomiCoeffs(p.aggType);
    const mp = {
      wb: r.wbFinal, fce: p.fce, gamma_c: p.gammaC,
      alpha_a: alpha.alpha_a, alpha_b: alpha.alpha_b, strength_target: r.fcu0,
    };
    const sp = { fce: p.fceStd, wb: p.wbStd, gamma_c: p.gcStd, alpha_a: p.aaStd };
    const degrade = state.mcMode === 'degrade';

    const t0 = performance.now();
    const res = C.monteCarlo(mp, sp, 10000, 42, degrade);
    const tMC = performance.now() - t0;

    const t1 = performance.now();
    const best = C.searchWbForTargetP(mp, sp, p.targetP, 0.30, 0.70, 20, 42, degrade);
    const tSearch = performance.now() - t1;

    $('mcSub').innerHTML = degrade
      ? `降级模式：W/B、f<sub>ce</sub>、γc、αa 各按 ±10% 均匀分布采样 · 模拟 ${tMC.toFixed(0)} ms · 反算 ${tSearch.toFixed(0)} ms`
      : `精确模式：四项参数按正态分布采样（使用左侧 σ）· 模拟 ${tMC.toFixed(0)} ms · 反算 ${tSearch.toFixed(0)} ms`;

    const pPct = res.p_pass * 100;
    $('pPass').textContent = pPct.toFixed(1) + '%';
    $('muVal').textContent = n1(res.mean) + ' MPa';
    $('sdVal').textContent = n2(res.std) + ' MPa';

    let riskText, riskCls;
    if (pPct >= 95) { riskText = '安全裕度充足'; riskCls = 'good'; }
    else if (pPct >= 90) { riskText = '建议下调 W/B'; riskCls = 'warn'; }
    else { riskText = '风险偏高'; riskCls = 'bad'; }
    const rv = $('riskVal');
    rv.textContent = riskText;
    rv.className = riskCls;

    // 直方图范围
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < res.strengths.length; i++) {
      lo = Math.min(lo, res.strengths[i]);
      hi = Math.max(hi, res.strengths[i]);
    }
    lo = Math.min(lo, res.fcu_0 * 0.85);
    hi = Math.max(hi, res.fcu_0 * 1.15);
    Ch.histogram($('histChart'), {
      values: res.strengths, min: lo, max: hi, bins: 40,
      target: res.fcu_0, mean: res.mean, height: 330,
    });

    const contribRows = Object.keys(res.contributions)
      .map((k) => ({ label: k, value: res.contributions[k] }))
      .sort((a, b) => b.value - a.value);
    Ch.hbar($('contribChart'), { rows: contribRows, xTitle: '方差贡献占比', height: 330 });

    // ---- 反算对比 ----
    const binderNew = r.water / best.wb;
    const costNew = calcCost(binderNew, 0, 0, r.sand, r.gravel, r.water).cost;
    $('bc1').innerHTML = `${n4(r.wbFinal)} <span style="font-size:11.5px;color:#78869a">→ ${n4(best.wb)}</span>`;
    $('bc2').innerHTML = `${n1(r.binderFinal)} <span style="font-size:11.5px;color:#78869a">→ ${n1(binderNew)}</span>`;
    $('bc3').innerHTML = `${n1(r.costCo2.cost)} <span style="font-size:11.5px;color:#78869a">→ ${n1(costNew)}</span>`;
    $('bc4').innerHTML = `${pPct.toFixed(1)}% <span style="font-size:11.5px;color:#78869a">→ ${(best.p_pass * 100).toFixed(1)}%</span>`;

    const newStrength = C.paulomiStrength(best.wb, p.fce, p.gammaC, p.aggType);
    const dWb = best.wb - r.wbFinal, dBinder = binderNew - r.binderFinal, dCost = costNew - r.costCo2.cost;
    $('backTable').innerHTML = `
      <table class="data-table" style="margin-top:16px">
        <thead><tr><th>指标</th><th class="num">当前方案</th><th class="num">反算方案</th><th class="num">变化</th></tr></thead>
        <tbody>
          <tr><td>水胶比 W/B</td><td class="num">${n4(r.wbFinal)}</td><td class="num hl">${n4(best.wb)}</td><td class="num">${deltaSpan(dWb, 4)}</td></tr>
          <tr><td>胶材用量 kg/m³</td><td class="num">${n1(r.binderFinal)}</td><td class="num hl">${n1(binderNew)}</td><td class="num">${deltaSpan(dBinder, 1)}</td></tr>
          <tr><td>砂 kg/m³</td><td class="num">${n1(r.sand)}</td><td class="num">${n1(r.sand)}</td><td class="num">不变</td></tr>
          <tr><td>石 kg/m³</td><td class="num">${n1(r.gravel)}</td><td class="num">${n1(r.gravel)}</td><td class="num">不变</td></tr>
          <tr><td>水 kg/m³</td><td class="num">${n1(r.water)}</td><td class="num">${n1(r.water)}</td><td class="num">不变</td></tr>
          <tr><td>预测 28d 强度 MPa</td><td class="num">${n1(r.strengthTheory)}</td><td class="num hl">${n1(newStrength)}</td><td class="num">${deltaSpan(newStrength - r.strengthTheory, 1)}</td></tr>
          <tr class="total"><td>成本 元/m³</td><td class="num">${n1(r.costCo2.cost)}</td><td class="num">${n1(costNew)}</td><td class="num">${deltaSpan(dCost, 1)}</td></tr>
        </tbody>
      </table>`;
  }

  // ============================================================
  //  级配编辑器
  // ============================================================
  function buildGradeEditor() {
    const box = $('gradeEditor');
    const sandSieves = [0.075, 0.15, 0.3, 0.6, 1.18, 2.36, 4.75];
    const gravelSieves = [4.75, 9.5, 16.0, 19.0, 26.5];
    let html = '<div class="gh">砂 · 累计通过率 (%)</div>';
    sandSieves.forEach((s) => {
      html += `<div class="field"><label>${s} mm</label><input type="number" step="1" min="0" max="100" data-kind="sand" data-sieve="${s}" value="${state.sandGrade[s]}"></div>`;
    });
    html += '<div class="gh">石 · 累计通过率 (%)</div>';
    gravelSieves.forEach((s) => {
      html += `<div class="field"><label>${s} mm</label><input type="number" step="1" min="0" max="100" data-kind="gravel" data-sieve="${s}" value="${state.gravelGrade[s]}"></div>`;
    });
    box.innerHTML = html;
    box.querySelectorAll('input').forEach((inp) => {
      inp.addEventListener('input', () => {
        const kind = inp.dataset.kind;
        const sieve = parseFloat(inp.dataset.sieve);
        const v = Math.min(100, Math.max(0, parseFloat(inp.value) || 0));
        if (kind === 'sand') state.sandGrade[sieve] = v;
        else state.gravelGrade[sieve] = v;
        state.gradesDirty = true;
        renderGrade(lastResult);
      });
    });
  }

  // ============================================================
  //  事件绑定
  // ============================================================
  function bind() {
    ['fcuK', 'slump', 'envClass', 'cementGrade', 'fce', 'aggType', 'dmax', 'density',
      'sandMoist', 'gravelMoist', 'fceStd', 'wbStd', 'gcStd', 'aaStd', 'targetP']
      .forEach((id) => {
        const node = $(id);
        node.addEventListener('input', render);
        node.addEventListener('change', render);
      });

    // 水泥等级变化 → 同步实测强度默认值
    $('cementGrade').addEventListener('change', () => {
      $('fce').value = $('cementGrade').value;
      render();
    });

    // 强度等级变化 → 同步 σ（仅提示，无需其他）
    $('srSlider').addEventListener('input', () => {
      state.gradesDirty = true;
      renderGrade(lastResult);
    });

    // 分段按钮
    function bindSeg(id, key) {
      $(id).querySelectorAll('.seg').forEach((btn) => {
        btn.addEventListener('click', () => {
          $(id).querySelectorAll('.seg').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          state[key] = btn.dataset.val;
          if (key === 'tornadoMode') renderTornado(lastResult);
          else render();
        });
      });
    }
    bindSeg('mcMode', 'mcMode');
    bindSeg('tornadoMode', 'tornadoMode');

    // 单价 / 排放因子
    document.querySelectorAll('[data-price]').forEach((inp) => {
      inp.addEventListener('input', () => {
        prices[inp.dataset.price] = parseFloat(inp.value) || 0;
        render();
      });
    });
    document.querySelectorAll('[data-co2]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const k = inp.dataset.co2;
        co2Factors[k] = parseFloat(inp.value) || 0;
        if (k === 'fly_ash') co2Factors.slag = co2Factors.fly_ash;
        render();
      });
    });

    // 重置级配
    $('resetGrade').addEventListener('click', () => {
      state.sandGrade = Object.assign({}, C.DEFAULT_SAND_GRADE);
      state.gravelGrade = Object.assign({}, C.DEFAULT_GRAVEL_GRADE);
      state.gradesDirty = false;
      buildGradeEditor();
      render();
    });
  }

  // ---------- 启动 ----------
  document.addEventListener('DOMContentLoaded', () => {
    buildGradeEditor();
    bind();
    render();
  });
})();
