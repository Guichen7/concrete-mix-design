/* ============================================================
 * 混凝土配合比设计 · 计算内核（JS 移植版）
 * 严格对应原 Python 版 concrete_core.py
 * 依据 JGJ55-2011《普通混凝土配合比设计规程》
 * ============================================================ */
(function (global) {
  'use strict';

  // ---------- 规范查表数据 ----------
  const SIGMA_TABLE = {
    C15: 4.0, C20: 4.0,
    C25: 5.0, C30: 5.0, C35: 5.0, C40: 5.0, C45: 5.0,
    C50: 6.0, C55: 6.0,
  };

  const GAMMA_C_TABLE = { 32.5: 1.12, 42.5: 1.16, 52.5: 1.10 };

  const SLUMP_POINTS = [20.0, 42.5, 62.5, 82.5];
  const DMAX_POINTS = [16.0, 20.0, 31.5, 40.0];

  const WATER_TABLE_GRAVEL = {
    16: [175, 180, 185, 190],
    20: [165, 180, 190, 200],
    31.5: [155, 170, 180, 190],
    40: [150, 165, 175, 185],
  };
  const WATER_TABLE_CRUSHED = {
    16: [185, 195, 200, 205],
    20: [175, 195, 200, 210],
    31.5: [165, 185, 195, 205],
    40: [160, 180, 190, 200],
  };

  const DURABILITY_TABLE = {
    '一a': { max_wb: 0.65, min_binder: 260 },
    '一b': { max_wb: 0.60, min_binder: 280 },
    '二a': { max_wb: 0.55, min_binder: 300 },
    '二b': { max_wb: 0.50, min_binder: 340 },
    '三a': { max_wb: 0.45, min_binder: 360 },
    '三b': { max_wb: 0.40, min_binder: 380 },
  };

  const W_B_POINTS_SAND = [0.30, 0.40, 0.50, 0.60, 0.70];

  const SAND_RATIO_GRAVEL = {
    16: [34, 32, 30, 28, 26],
    20: [36, 34, 32, 30, 28],
    31.5: [39, 37, 35, 33, 31],
    40: [42, 40, 38, 36, 34],
  };
  const SAND_RATIO_CRUSHED = {
    16: [37, 35, 33, 31, 29],
    20: [39, 37, 35, 33, 31],
    31.5: [42, 40, 38, 36, 34],
    40: [45, 43, 41, 39, 37],
  };

  const ALPHA_TABLE = {
    gravel: { alpha_a: 0.49, alpha_b: 0.13 },
    crushed_stone: { alpha_a: 0.53, alpha_b: 0.20 },
  };

  // ---------- 插值 ----------
  function linearInterp(x, xs, ys) {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
    for (let i = 0; i < xs.length - 1; i++) {
      if (x >= xs[i] && x <= xs[i + 1]) {
        const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
        return ys[i] + t * (ys[i + 1] - ys[i]);
      }
    }
    return ys[ys.length - 1];
  }

  // 两阶段插值：先沿 x2（坍落度 / W-B）逐行，再沿 x1（Dmax）
  function twoStageInterp(x1, x1Nodes, x2, x2Nodes, table) {
    const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
    const yAtX1 = keys.map((k) => linearInterp(x2, x2Nodes, table[k]));
    return linearInterp(x1, keys, yAtX1);
  }

  // ---------- 查表主函数 ----------
  const getSigma = (grade) => (SIGMA_TABLE[grade] !== undefined ? SIGMA_TABLE[grade] : 5.0);
  const getGammaC = (cementGrade) => (GAMMA_C_TABLE[cementGrade] !== undefined ? GAMMA_C_TABLE[cementGrade] : 1.12);

  function getWaterConsumption(slump, dmax, aggType) {
    const table = aggType === 'gravel' ? WATER_TABLE_GRAVEL : WATER_TABLE_CRUSHED;
    return twoStageInterp(dmax, DMAX_POINTS, slump, SLUMP_POINTS, table);
  }

  function getSandRatio(wb, dmax, aggType) {
    const table = aggType === 'gravel' ? SAND_RATIO_GRAVEL : SAND_RATIO_CRUSHED;
    return twoStageInterp(dmax, DMAX_POINTS, wb, W_B_POINTS_SAND, table) / 100.0;
  }

  function getDurabilityLimit(envClass) {
    const d = DURABILITY_TABLE[envClass] || { max_wb: 0.65, min_binder: 260 };
    return d;
  }

  // ---------- 保罗米公式 ----------
  const paulomiCoeffs = (aggType) => ALPHA_TABLE[aggType];

  function paulomiStrength(wb, fce, gammaC, aggType) {
    const { alpha_a, alpha_b } = ALPHA_TABLE[aggType];
    return alpha_a * gammaC * fce * (1.0 / wb - alpha_b);
  }

  function paulomiInverseWb(fcu0, fce, gammaC, aggType) {
    const { alpha_a, alpha_b } = ALPHA_TABLE[aggType];
    const bw = fcu0 / (alpha_a * gammaC * fce) + alpha_b;
    return 1.0 / bw;
  }

  // ---------- 重量法骨料 ----------
  function calculateAggregatesByWeight(binder, water, sandRatio, density) {
    const sandGravel = density - binder - water;
    const sand = sandGravel * sandRatio;
    const gravel = sandGravel - sand;
    return { sand, gravel, sandGravel };
  }

  // ---------- 施工配合比 ----------
  function constructionMix(cementLab, sandDry, gravelDry, waterLab, sandMoist, gravelMoist) {
    const sandWet = sandDry * (1 + sandMoist / 100.0);
    const gravelWet = gravelDry * (1 + gravelMoist / 100.0);
    const waterSite = waterLab - sandDry * sandMoist / 100.0 - gravelDry * gravelMoist / 100.0;
    return {
      cement: cementLab,
      sand_wet: sandWet,
      gravel_wet: gravelWet,
      water_site: Math.max(waterSite, 0),
    };
  }

  // ---------- 级配 ----------
  const STANDARD_SIEVES = [0.075, 0.15, 0.3, 0.6, 1.18, 2.36, 4.75, 9.5, 16.0, 19.0, 26.5, 31.5, 37.5, 53.0];
  // 默认河砂级配（累计通过率 %）——Ⅱ区中砂典型级配，细度模数约 2.7
  const DEFAULT_SAND_GRADE = { 0.075: 5.0, 0.15: 22.0, 0.3: 42.0, 0.6: 62.0, 1.18: 78.0, 2.36: 90.0, 4.75: 96.0 };
  // 默认 5~20mm 连续级配碎石（累计通过率 %）
  const DEFAULT_GRAVEL_GRADE = { 4.75: 88.0, 9.5: 55.0, 16.0: 22.0, 19.0: 8.0, 26.5: 0.0 };

  function synthesizeGradeCurve(sandCum, gravelCum, sandRatio) {
    // 未定义的筛孔按“最粗已定义筛孔”的通过率外推，避免凭空补 100% 造成假断档
    const lookup = (table, sieve) => {
      if (table[sieve] !== undefined) return table[sieve];
      const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
      if (!keys.length) return 100.0;
      if (sieve < keys[0]) return 100.0;
      return table[keys[keys.length - 1]];
    };
    return STANDARD_SIEVES.map((sieve) => {
      const ps = lookup(sandCum, sieve);
      const pg = lookup(gravelCum, sieve);
      const v = sandRatio * ps + (1 - sandRatio) * pg;
      return Math.min(100, Math.max(0, v));
    });
  }

  function computeFinenessModulus(sandCum) {
    // 细度模数 FM（JGJ 52 / GB/T 14684）
    //   FM = (A4.75 + A2.36 + A1.18 + A0.6 + A0.3 + A0.15) / 100
    // 其中 A 为各筛的「累计筛余」(%)，即 100 − 累计通过率。
    // 检验：Ⅱ区中砂累计筛余 [4,10,22,38,58,78] → FM = 210/100 = 2.10（中砂，合理）
    const cumResidue = (s) => 100.0 - (sandCum[s] !== undefined ? sandCum[s] : 0.0);
    const sum = cumResidue(4.75) + cumResidue(2.36) + cumResidue(1.18) +
      cumResidue(0.6) + cumResidue(0.3) + cumResidue(0.15);
    return sum / 100.0;
  }

  function classifyGrading(cmps) {
    let maxGap = 0;
    for (let i = 0; i < cmps.length - 1; i++) maxGap = Math.max(maxGap, Math.abs(cmps[i + 1] - cmps[i]));
    if (maxGap > 25) return { level: 2, text: '存在级配断档，建议调整砂石比例' };
    if (maxGap > 15) return { level: 1, text: '级配基本连续（有小突变）' };
    return { level: 0, text: '级配连续良好' };
  }

  // ---------- 成本 / 碳排放 ----------
  const MATERIAL_PRICES = { cement: 450.0, fly_ash: 200.0, slag: 250.0, sand: 120.0, gravel: 130.0, water: 5.0 };
  const MATERIAL_CO2 = { cement: 0.83, fly_ash: 0.10, slag: 0.10, sand: 0.005, gravel: 0.005, water: 0.0001 };

  function calcCostAndCO2(cement, flyAsh, slag, sand, gravel, water) {
    const binder = cement + flyAsh + slag;
    const cost =
      (cement * MATERIAL_PRICES.cement +
        flyAsh * MATERIAL_PRICES.fly_ash +
        slag * MATERIAL_PRICES.slag +
        sand * MATERIAL_PRICES.sand +
        gravel * MATERIAL_PRICES.gravel +
        water * MATERIAL_PRICES.water) / 1000.0;
    const co2 =
      cement * MATERIAL_CO2.cement +
      flyAsh * MATERIAL_CO2.fly_ash +
      slag * MATERIAL_CO2.slag +
      sand * MATERIAL_CO2.sand +
      gravel * MATERIAL_CO2.gravel +
      water * MATERIAL_CO2.water;
    return { cost, co2, binder };
  }

  // ---------- 约束网格 ----------
  const CONSTRAINT_NAMES = ['强度 fcu,0', '耐久性 W/B 上限', '最小胶材量', '砂率合理区间', '用水量可行', '总容重平衡'];

  function evaluateConstraintsGrid(wbArr, srArr, fcuK, sigma, fce, gammaC, aggType, dmax, slump, envClass, density) {
    const { max_wb: maxWb, min_binder: minBinder } = getDurabilityLimit(envClass);
    const waterDesign = getWaterConsumption(slump, dmax, aggType);
    const srTable = aggType === 'gravel' ? SAND_RATIO_GRAVEL : SAND_RATIO_CRUSHED;
    let srMin = twoStageInterp(dmax, DMAX_POINTS, 0.70, W_B_POINTS_SAND, srTable) / 100.0 - 0.06;
    let srMax = twoStageInterp(dmax, DMAX_POINTS, 0.30, W_B_POINTS_SAND, srTable) / 100.0 + 0.06;
    srMin = Math.max(0.20, srMin);
    srMax = Math.min(0.55, srMax);

    const fcu0 = fcuK + 1.645 * sigma;
    const { alpha_a, alpha_b } = ALPHA_TABLE[aggType];

    const countMap = [];
    const detail = {};
    CONSTRAINT_NAMES.forEach((n) => (detail[n] = []));

    for (let i = 0; i < srArr.length; i++) {
      const rowCount = [];
      const rowDetail = CONSTRAINT_NAMES.map(() => []);
      for (let j = 0; j < wbArr.length; j++) {
        const wb = wbArr[j];
        const sr = srArr[i];
        const strength = alpha_a * gammaC * fce * (1.0 / wb - alpha_b);
        const binder = waterDesign / wb;
        const sandGravel = density - binder - waterDesign;
        const ok = [
          strength >= fcu0,
          wb <= maxWb,
          binder >= minBinder && binder <= 600,
          srMin <= sr && sr <= srMax,
          waterDesign > 120 && waterDesign < 240,
          sandGravel > 0 && sr > 0 && sr < 1,
        ];
        rowCount.push(ok.filter(Boolean).length);
        ok.forEach((v, k) => rowDetail[k].push(v));
      }
      countMap.push(rowCount);
      CONSTRAINT_NAMES.forEach((n, k) => detail[n].push(rowDetail[k]));
    }

    return { countMap, detail, wbArr, srArr, fcu0, maxWb, minBinder, waterDesign, srMin, srMax };
  }

  // ---------- 敏感性龙卷风 ----------
  function sensitivityTornado(fcuK, sigma, fce, gammaC, aggType, slump, dmax, density, cementCost) {
    const baseWb = paulomiInverseWb(fcuK + 1.645 * sigma, fce, gammaC, aggType);
    const water = getWaterConsumption(slump, dmax, aggType);
    const binder = water / baseWb;
    const sandRatio = getSandRatio(baseWb, dmax, aggType);
    const { sand, gravel } = calculateAggregatesByWeight(binder, water, sandRatio, density);
    const baseCost = calcCostAndCO2(binder, 0, 0, sand, gravel, water).cost;
    const { alpha_a: alphaABase, alpha_b: alphaB } = ALPHA_TABLE[aggType];

    const params = [
      ['σ (标准差)', 'sigma', sigma],
      ['αa (保罗米系数)', 'alpha_a', alphaABase],
      ['γc (富裕系数)', 'gamma_c', gammaC],
      ['fce (水泥实测强度)', 'fce', fce],
      ['mw0 (用水量)', 'water', water],
      ['水泥单价', 'cement_cost', cementCost],
    ];

    const rows = params.map(([label, key, base]) => {
      const pct = 0.10;
      const lo = base * (1 - pct);
      const hi = base * (1 + pct);
      let wbLo, wbHi;
      if (key === 'cement_cost' || key === 'water') {
        wbLo = baseWb;
        wbHi = baseWb;
      } else if (key === 'sigma') {
        wbLo = paulomiInverseWb(fcuK + 1.645 * lo, fce, gammaC, aggType);
        wbHi = paulomiInverseWb(fcuK + 1.645 * hi, fce, gammaC, aggType);
      } else if (key === 'alpha_a') {
        wbLo = 1.0 / ((fcuK + 1.645 * sigma) / (lo * gammaC * fce) + alphaB);
        wbHi = 1.0 / ((fcuK + 1.645 * sigma) / (hi * gammaC * fce) + alphaB);
      } else if (key === 'gamma_c') {
        wbLo = paulomiInverseWb(fcuK + 1.645 * sigma, fce, lo, aggType);
        wbHi = paulomiInverseWb(fcuK + 1.645 * sigma, fce, hi, aggType);
      } else {
        wbLo = paulomiInverseWb(fcuK + 1.645 * sigma, lo, gammaC, aggType);
        wbHi = paulomiInverseWb(fcuK + 1.645 * sigma, hi, gammaC, aggType);
      }

      const binderLo = key === 'water' ? lo / baseWb : water / wbLo;
      const binderHi = key === 'water' ? hi / baseWb : water / wbHi;

      let costLo, costHi;
      if (key === 'cement_cost') {
        const c0 = calcCostAndCO2(binder, 0, 0, sand, gravel, water).cost;
        costLo = c0 - (binder * base) / 1000.0 + (binder * lo) / 1000.0;
        costHi = costLo - (binder * lo) / 1000.0 + (binder * hi) / 1000.0;
      } else {
        costLo = calcCostAndCO2(binderLo, 0, 0, sand, gravel, water).cost;
        costHi = calcCostAndCO2(binderHi, 0, 0, sand, gravel, water).cost;
      }

      return {
        label,
        wb_impact: baseWb > 0 ? (Math.max(Math.abs(wbLo - baseWb), Math.abs(wbHi - baseWb)) / baseWb) * 100 : 0,
        cost_impact: baseCost > 0 ? (Math.max(Math.abs(costLo - baseCost), Math.abs(costHi - baseCost)) / baseCost) * 100 : 0,
        wb_lo_pct: ((wbLo - baseWb) / baseWb) * 100,
        wb_hi_pct: ((wbHi - baseWb) / baseWb) * 100,
        cost_lo_pct: ((costLo - baseCost) / baseCost) * 100,
        cost_hi_pct: ((costHi - baseCost) / baseCost) * 100,
      };
    });

    return { rows, base_wb: baseWb, base_cost: baseCost };
  }

  // ---------- 伪随机（可复现，替代 numpy RandomState）----------
  function makeRng(seed) {
    let s = seed >>> 0;
    const next = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    const normal = () => {
      let u = 0, v = 0;
      while (u === 0) u = next();
      while (v === 0) v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    return { next, normal };
  }

  // ---------- Monte Carlo ----------
  function strengthVec(wb, fce, gammaC, alphaA, alphaB) {
    return alphaA * gammaC * fce * (1.0 / wb - alphaB);
  }

  function monteCarlo(mean, std, n, seed, degrade, degradeRange) {
    n = n || 10000;
    seed = seed === undefined ? 42 : seed;
    degradeRange = degradeRange === undefined ? 0.10 : degradeRange;
    const rng = makeRng(seed);
    const sd = std || {};

    const wbS = new Float64Array(n), fceS = new Float64Array(n),
      gcS = new Float64Array(n), aaS = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      if (degrade) {
        wbS[i] = mean.wb * (1 - degradeRange) + rng.next() * mean.wb * 2 * degradeRange;
        fceS[i] = mean.fce * (1 - degradeRange) + rng.next() * mean.fce * 2 * degradeRange;
        gcS[i] = mean.gamma_c * (1 - degradeRange) + rng.next() * mean.gamma_c * 2 * degradeRange;
        aaS[i] = mean.alpha_a * (1 - degradeRange) + rng.next() * mean.alpha_a * 2 * degradeRange;
      } else {
        wbS[i] = mean.wb + rng.normal() * (sd.wb !== undefined ? sd.wb : mean.wb * 0.02);
        fceS[i] = mean.fce + rng.normal() * (sd.fce !== undefined ? sd.fce : 1.5);
        gcS[i] = mean.gamma_c + rng.normal() * (sd.gamma_c !== undefined ? sd.gamma_c : 0.01);
        aaS[i] = mean.alpha_a + rng.normal() * (sd.alpha_a !== undefined ? sd.alpha_a : 0.02);
      }
      wbS[i] = Math.min(0.85, Math.max(0.25, wbS[i]));
      fceS[i] = Math.min(70, Math.max(15, fceS[i]));
    }

    const ab = mean.alpha_b;
    const strengths = new Float64Array(n);
    let pass = 0, sum = 0, sum2 = 0;
    const fcu0 = mean.strength_target;
    for (let i = 0; i < n; i++) {
      let s = strengthVec(wbS[i], fceS[i], gcS[i], aaS[i], ab);
      s = Math.min(100, Math.max(0, s));
      strengths[i] = s;
      if (s >= fcu0) pass++;
      sum += s;
      sum2 += s * s;
    }
    const mu = sum / n;
    const sigmaS = Math.sqrt(Math.max(0, sum2 / n - mu * mu));

    // 单因素方差贡献
    const contrib = {};
    const mWb = mean.wb, mFce = mean.fce, mGc = mean.gamma_c, mAa = mean.alpha_a;
    const single = [
      ['fce (水泥实测强度)', (i) => strengthVec(mWb, fceS[i], mGc, mAa, ab)],
      ['W/B (水胶比)', (i) => strengthVec(wbS[i], mFce, mGc, mAa, ab)],
      ['γc (富裕系数)', (i) => strengthVec(mWb, mFce, gcS[i], mAa, ab)],
      ['αa (保罗米系数)', (i) => strengthVec(mWb, mFce, mGc, aaS[i], ab)],
    ];
    single.forEach(([lbl, fn]) => {
      let s1 = 0, s2 = 0;
      for (let i = 0; i < n; i++) { const v = fn(i); s1 += v; s2 += v * v; }
      const m = s1 / n;
      contrib[lbl] = Math.max(0, s2 / n - m * m);
    });
    const totalVar = Object.values(contrib).reduce((a, b) => a + b, 0);
    if (totalVar > 0) Object.keys(contrib).forEach((k) => (contrib[k] /= totalVar));

    return {
      strengths,
      p_pass: pass / n,
      mean: mu,
      std: sigmaS,
      contributions: contrib,
      fcu_0: fcu0,
    };
  }

  function searchWbForTargetP(mean, std, targetP, wbLo, wbHi, maxIter, seed, degrade) {
    targetP = targetP === undefined ? 0.95 : targetP;
    wbLo = wbLo === undefined ? 0.30 : wbLo;
    wbHi = wbHi === undefined ? 0.70 : wbHi;
    maxIter = maxIter || 20;
    let lo = wbLo, hi = wbHi, best = wbLo;
    for (let k = 0; k < maxIter; k++) {
      const mid = (lo + hi) / 2;
      const res = monteCarlo(Object.assign({}, mean, { wb: mid }), std, 2000, seed, degrade);
      if (res.p_pass >= targetP) { best = mid; lo = mid; } else { hi = mid; }
    }
    const finalRes = monteCarlo(Object.assign({}, mean, { wb: best }), std, 10000, seed, degrade);
    return { wb: best, p_pass: finalRes.p_pass, mean: finalRes.mean, std: finalRes.std };
  }

  global.ConcreteCore = {
    SIGMA_TABLE, GAMMA_C_TABLE, DURABILITY_TABLE, ALPHA_TABLE,
    WATER_TABLE_GRAVEL, WATER_TABLE_CRUSHED,
    SAND_RATIO_GRAVEL, SAND_RATIO_CRUSHED,
    SLUMP_POINTS, DMAX_POINTS, W_B_POINTS_SAND,
    STANDARD_SIEVES, DEFAULT_SAND_GRADE, DEFAULT_GRAVEL_GRADE,
    CONSTRAINT_NAMES, MATERIAL_PRICES, MATERIAL_CO2,
    getSigma, getGammaC, getWaterConsumption, getSandRatio, getDurabilityLimit,
    paulomiCoeffs, paulomiStrength, paulomiInverseWb,
    calculateAggregatesByWeight, constructionMix,
    synthesizeGradeCurve, computeFinenessModulus, classifyGrading,
    calcCostAndCO2, evaluateConstraintsGrid, sensitivityTornado,
    monteCarlo, searchWbForTargetP,
  };
})(window);
