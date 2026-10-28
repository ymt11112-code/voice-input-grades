/* 成績分析的純運算（不碰 DOM，可直接用 node 載入測試）：
 * 統計量、五標、單科分析、學期成績、跨學期／跨科模型、關注警示、學生概況。 */
(function (root) {
  'use strict';
  var AX = root.AX = root.AX || {};

  // ============================================================
  // 一、基本統計
  // ============================================================
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function mean(a) { return a.length ? sum(a) / a.length : null; }
  function median(a) {
    if (!a.length) return null;
    var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function sd(a) { // 母體標準差（全班就是全部母體）
    if (!a.length) return null;
    var m = mean(a), v = 0;
    for (var i = 0; i < a.length; i++) v += (a[i] - m) * (a[i] - m);
    return Math.sqrt(v / a.length);
  }
  function describe(a) {
    if (!a.length) return { n: 0, mean: null, median: null, sd: null, min: null, max: null };
    return { n: a.length, mean: mean(a), median: median(a), sd: sd(a), min: Math.min.apply(null, a), max: Math.max.apply(null, a) };
  }
  function nonNull(a) { return a.filter(function (v) { return v != null; }); }

  // 五標：把成績由高到低排，取第 12%／25%／50%／75%／88% 位置（無條件進位）的那個實際分數
  var TIER_DEFS = [
    { key: 'top', label: '頂標', p: 0.12 },
    { key: 'front', label: '前標', p: 0.25 },
    { key: 'mid', label: '均標', p: 0.50 },
    { key: 'back', label: '後標', p: 0.75 },
    { key: 'bottom', label: '底標', p: 0.88 }
  ];
  function tiers(values) {
    if (!values.length) return null;
    var s = values.slice().sort(function (a, b) { return b - a; }), out = {};
    TIER_DEFS.forEach(function (d) {
      var k = Math.max(1, Math.ceil(d.p * s.length - 1e-9));
      out[d.key] = s[k - 1];
    });
    return out;
  }
  function tierName(t, v) {
    if (!t || v == null) return '';
    for (var i = 0; i < TIER_DEFS.length; i++) if (v >= t[TIER_DEFS[i].key]) return TIER_DEFS[i].label;
    return '底標以下';
  }
  function compRank(values, v) { // 1,2,2,4 式名次
    var r = 1;
    for (var i = 0; i < values.length; i++) if (values[i] > v) r++;
    return r;
  }
  function topPercent(rank, n) { return n ? Math.max(1, Math.ceil(rank / n * 100 - 1e-9)) : null; }

  // 分組：items = [{v, i}]，回傳 nb 個等寬組距，最後一組含上限
  function histogram(items, lo, hi, nb) {
    var bins = [], w = (hi - lo) / nb, k;
    for (k = 0; k < nb; k++) bins.push({ lo: lo + w * k, hi: lo + w * (k + 1), idx: [] });
    items.forEach(function (o) {
      var b = hi > lo ? Math.floor((o.v - lo) * nb / (hi - lo) + 1e-9) : 0;
      b = Math.min(nb - 1, Math.max(0, b));
      bins[b].idx.push(o.i);
    });
    return bins;
  }

  function fmt(v, d) {
    if (v == null || isNaN(v)) return '—';
    d = d == null ? 1 : d;
    var s = Number(v).toFixed(d);
    return d > 0 ? s.replace(/\.?0+$/, '') : s;
  }
  function signed(v, d) {
    if (v == null || isNaN(v)) return '—';
    var s = fmt(Math.abs(v), d);
    return (v > 0.0499 ? '+' : (v < -0.0499 ? '−' : '')) + s;
  }

  // 各分數段人數（依得分率）：100 分、90 幾、80 幾、70 幾、60 幾、不及格（低於 60）。null（缺考）不計。
  function scoreBands(pcts) {
    var r = { b100: 0, b90: 0, b80: 0, b70: 0, b60: 0, fail: 0 };
    pcts.forEach(function (p) {
      if (p == null) return;
      p = p + 1e-9; // 避免 19/20*100 這類浮點誤差把 95 算成 94.99999
      if (p >= 100) r.b100++; else if (p >= 90) r.b90++; else if (p >= 80) r.b80++;
      else if (p >= 70) r.b70++; else if (p >= 60) r.b60++; else r.fail++;
    });
    return r;
  }

  // ============================================================
  // 二、單科單期分析（一個科目、一組項目）
  // ============================================================
  var DEFAULT_PASS = 60;
  var TEST_KINDS = { quiz: 1, midterm: 1, final: 1, other: 1 };
  var KIND_LABEL = { quiz: '平時測驗', midterm: '期中考', final: '期末考', homework: '作業', other: '課堂表現', skip: '不分析' };
  // 兩層權重（實際數字依各科目設定，每一組只看比例，不必剛好加總 100）：
  //   第一層 學期成績＝第一次定期考查總成績 × p1 ＋ 第二次定期考查總成績 × p2   （第一次＝期中、第二次＝期末）
  //   第二層 定期考查總成績＝平時成績 × daily ＋ 段考分數 × exam
  //   第三層 平時成績＝紙筆測驗 × quiz ＋ 作業 × homework ＋ 課堂 × other
  var DEFAULT_WEIGHTS = { daily: 50, exam: 50, quiz: 40, homework: 35, other: 25, p1: 50, p2: 50 };

  function defaultKind(cat) {
    var c = String(cat);
    if (/作業|習作|習題|學習單/.test(c)) return 'homework';
    if (c.indexOf('期中') > -1 || c.indexOf('第一次段考') > -1) return 'midterm';
    if (c.indexOf('期末') > -1 || c.indexOf('第二次段考') > -1) return 'final';
    if (/課堂|參與|發言|討論|表現|出席|口試/.test(c)) return 'other';
    return 'quiz';
  }

  // 每個項目屬於第幾次定期考查：期中考固定第 1 次、期末考固定第 2 次；其他項目看 it.period（1 或 2，手動指定），
  // 沒指定就看位置——同一學期內，排在期中考之前的算第 1 次，之後的算第 2 次（沒有期中考就全部算第 1 次）。
  function periodMap(items, kinds) {
    var firstMid = {};
    items.forEach(function (it, k) {
      if ((kinds[it.category] || defaultKind(it.category)) === 'midterm') { var t = it.term || ''; if (firstMid[t] === undefined) firstMid[t] = k; }
    });
    return items.map(function (it, k) {
      var kind = kinds[it.category] || defaultKind(it.category);
      if (kind === 'midterm') return 1;
      if (kind === 'final') return 2;
      if (it.period === 1 || it.period === 2) return it.period;
      var fm = firstMid[it.term || ''];
      return fm !== undefined && k > fm ? 2 : 1;
    });
  }

  // data = 單一科目資料；kinds = { 類別: kind }；opts.terms = 只納入這些學期（null＝全部）
  function analyze(data, kinds, passPct, opts) {
    passPct = passPct == null ? DEFAULT_PASS : passPct;
    kinds = kinds || {}; opts = opts || {};
    var S = data.students, nS = S.length;
    var quiz = [], hwOrder = [], hwMap = {};
    var periods = periodMap(data.items, kinds);

    data.items.forEach(function (it, k) {
      var term = it.term || '';
      if (opts.terms && opts.terms.indexOf(term) === -1) return;
      var kind = kinds[it.category] || defaultKind(it.category);
      if (kind === 'skip') return;
      var col = S.map(function (s) { return s.scores[k]; });
      if (!col.some(function (v) { return v != null; })) return; // 全班都沒成績＝還沒登記，不納入
      if (TEST_KINDS[kind]) {
        var q = buildQuiz(it, k, col, nS, passPct);
        q.kind = kind; q.term = term; q.period = periods[k];
        quiz.push(q);
      } else {
        if (!hwMap[it.category]) { hwMap[it.category] = { category: it.category, items: [], cols: [] }; hwOrder.push(it.category); }
        hwMap[it.category].items.push({ k: k, name: it.name, max: it.max, period: periods[k] });
        hwMap[it.category].cols.push(col);
      }
    });

    var homework = hwOrder.map(function (c) { return buildHomework(hwMap[c], nS, passPct); });
    return { students: S, quiz: quiz, homework: homework, passPct: passPct, kinds: kinds };
  }

  function buildQuiz(it, k, col, nS, passPct) {
    var maxAssumed = !(it.max > 0), mx = maxAssumed ? 100 : it.max;
    var pcts = col.map(function (v) { return v == null ? null : v / mx * 100; });
    var raw = [], pv = [];
    col.forEach(function (v, i) { if (v != null) { raw.push(v); pv.push(pcts[i]); } });
    return {
      k: k, name: it.name, category: it.category, difficulty: it.difficulty || '易', max: mx, maxAssumed: maxAssumed,
      scores: col, pcts: pcts, n: raw.length, absent: nS - raw.length,
      stats: describe(raw), pctStats: describe(pv), tiers: tiers(raw), tiersPct: tiers(pv),
      passRate: pv.filter(function (p) { return p >= passPct; }).length / pv.length * 100,
      ranks: col.map(function (v) { return v == null ? null : compRank(raw, v); })
    };
  }

  // 作業：只看「總和」。已登記的作業項目裡，空白視為缺交（以 0 分計入總和，並另外記缺交次數）
  function buildHomework(g, nS, passPct) {
    var nItems = g.items.length;
    var totalMax = g.items.every(function (it) { return it.max > 0; }) ? sum(g.items.map(function (it) { return it.max; })) : null;
    var sums = [], missing = [], i, j;
    for (i = 0; i < nS; i++) {
      var s = 0, m = 0;
      for (j = 0; j < nItems; j++) { var v = g.cols[j][i]; if (v == null) m++; else s += v; }
      sums.push(s); missing.push(m);
    }
    var pcts = totalMax ? sums.map(function (s2) { return s2 / totalMax * 100; }) : null;
    return {
      category: g.category, items: g.items, cols: g.cols, nItems: nItems, totalMax: totalMax,
      sums: sums, missing: missing, pcts: pcts,
      stats: describe(sums), tiers: tiers(sums),
      ranks: sums.map(function (v) { return compRank(sums, v); }),
      fullCount: missing.filter(function (m) { return m === 0; }).length,
      missingStudents: missing.filter(function (m) { return m > 0; }).length,
      passRate: pcts ? pcts.filter(function (p) { return p >= passPct; }).length / nS * 100 : null
    };
  }

  // 各生「測驗累計平均得分率」與名次。cats = 要納入的類別陣列（null＝全部測驗類）
  // 缺考超過一半的學生不排名（平均會失真）
  function studentAgg(A, cats) {
    var qs = A.quiz.filter(function (q) { return !cats || cats.indexOf(q.category) > -1; });
    var T = qs.length, need = Math.ceil(T / 2);
    var rows = A.students.map(function (s, i) {
      var ps = [];
      qs.forEach(function (q) { if (q.pcts[i] != null) ps.push(q.pcts[i]); });
      return { avg: ps.length ? mean(ps) : null, taken: ps.length, eligible: ps.length > 0 && ps.length >= need, rank: null };
    });
    var elig = rows.filter(function (r) { return r.eligible; }).map(function (r) { return r.avg; });
    rows.forEach(function (r) { if (r.eligible) r.rank = compRank(elig, r.avg); });
    return { T: T, rows: rows, eligibleN: elig.length, stats: describe(elig), tiers: tiers(elig), quiz: qs };
  }

  // 單一學生在每次測驗的表現（只含有成績的測驗），依登記順序
  function studentSeries(A, sIdx, cats) {
    var out = [];
    A.quiz.forEach(function (q) {
      if (cats && cats.indexOf(q.category) === -1) return;
      var sc = q.scores[sIdx];
      if (sc == null) return;
      out.push({
        q: q, score: sc, pct: q.pcts[sIdx], classMean: q.pctStats.mean, diff: q.pcts[sIdx] - q.pctStats.mean,
        rank: q.ranks[sIdx], n: q.n, tier: tierName(q.tiers, sc)
      });
    });
    return out;
  }

  // 進退步：用「跟班平均的差距」比較最近幾次與之前，才能排除某次考卷特別難／簡單的影響
  function trendJudge(series) {
    var m = series.length;
    if (m < 2) return null;
    var recentN = Math.min(3, Math.ceil(m / 2));
    var recent = series.slice(m - recentN), earlier = series.slice(0, m - recentN);
    var delta = mean(recent.map(function (x) { return x.diff; })) - mean(earlier.map(function (x) { return x.diff; }));
    var label = delta >= 5 ? '進步' : (delta <= -5 ? '退步' : '持平');
    return { delta: delta, label: label, recentN: recentN, earlierN: earlier.length };
  }

  // ============================================================
  // 三、學期成績（兩層權重）
  // ============================================================
  // 平時成績（紙筆測驗、作業、課堂）與段考分數（期中考／期末考）各占定期考查的一部分，
  // 定期考查有兩次（第一次＝期中、第二次＝期末），學期成績再把兩次的總成績依比例合成。皆換算成得分率（滿分 100）。
  // 某個成分全班都沒有資料（例如期末考還沒考）就不納入、其餘比例重新分配；
  // 個別學生缺某個成分（例如缺考期中考）也是同樣處理，但會標記 partial。
  // 第二次定期考查還沒考完（段考沒有成績）時，不計入學期成績，等期末考成績進來才合併。
  function wavg(pairs) { // pairs = [[權重, 值或 null]]；回傳 { v, miss }
    var num = 0, den = 0, miss = false;
    pairs.forEach(function (pr) { if (pr[1] == null) miss = true; else { num += pr[0] * pr[1]; den += pr[0]; } });
    return { v: den > 0 ? num / den : null, miss: miss };
  }

  function termSummary(A, weights) {
    var W = weights && weights.daily != null ? weights : DEFAULT_WEIGHTS;
    var n = A.students.length, i;
    function nulls() { var a = []; for (var j = 0; j < n; j++) a.push(null); return a; }
    function hasData(a) { return a.some(function (v) { return v != null; }); }
    function meanOf(qs) {
      var out = [];
      for (var s = 0; s < n; s++) { var ps = []; qs.forEach(function (q) { if (q.pcts[s] != null) ps.push(q.pcts[s]); }); out.push(ps.length ? mean(ps) : null); }
      return out;
    }
    // 作業：只看總和；空白（缺交）以 0 分計。groupsOf 回傳每個類別裡屬於指定次數的項目
    var hwNoMax = false;
    function homeworkOf(p) {
      var totalS = [], totalMax = 0, any = false;
      for (i = 0; i < n; i++) totalS.push(0);
      A.homework.forEach(function (g) {
        var idx = [];
        g.items.forEach(function (it, j) { if (p == null || it.period === p) idx.push(j); });
        if (!idx.length) return;
        if (!idx.every(function (j) { return g.items[j].max > 0; })) { hwNoMax = true; return; }
        any = true;
        idx.forEach(function (j) {
          totalMax += g.items[j].max;
          for (i = 0; i < n; i++) { var v = g.cols[j][i]; if (v != null) totalS[i] += v; }
        });
      });
      return any && totalMax > 0 ? totalS.map(function (t) { return t / totalMax * 100; }) : nulls();
    }
    var DAILY = ['quiz', 'homework', 'other'];

    var periods = [1, 2].map(function (p) {
      var c = {
        quiz: meanOf(A.quiz.filter(function (q) { return q.kind === 'quiz' && q.period === p; })),
        other: meanOf(A.quiz.filter(function (q) { return q.kind === 'other' && q.period === p; })),
        homework: homeworkOf(p)
      };
      var exam = meanOf(A.quiz.filter(function (q) { return q.kind === (p === 1 ? 'midterm' : 'final'); }));
      var dailyUsed = W.daily > 0 ? DAILY.filter(function (k) { return hasData(c[k]) && W[k] > 0; }) : [];
      var examUsed = hasData(exam) && W.exam > 0;
      var daily = [], total = [], partial = [], dailyOn = dailyUsed.length > 0 && W.daily > 0;
      for (i = 0; i < n; i++) {
        var dl = wavg(dailyUsed.map(function (k) { return [W[k], c[k][i]]; }));
        daily.push(dl.v);
        var tt = wavg((dailyOn ? [[W.daily, dl.v]] : []).concat(examUsed ? [[W.exam, exam[i]]] : []));
        total.push(tt.v);
        partial.push(tt.v != null && (tt.miss || dl.miss));
      }
      return {
        p: p, share: p === 1 ? W.p1 : W.p2, comps: c, exam: exam, daily: daily, total: total, partial: partial,
        dailyUsed: dailyUsed, examUsed: examUsed, used: dailyOn || examUsed,
        // 完成＝段考也有成績了（這個科目沒有段考則只要有平時成績）
        complete: (dailyOn || examUsed) && (W.exam <= 0 || examUsed)
      };
    });

    var inScore = periods.filter(function (pr) { return pr.complete && pr.share > 0; });
    var provisional = false;
    if (!inScore.length) { inScore = periods.filter(function (pr) { return pr.used && pr.share > 0; }); provisional = inScore.length > 0; }
    var scores = [], partial = [];
    for (i = 0; i < n; i++) {
      var sc = wavg(inScore.map(function (pr) { return [pr.share, pr.total[i]]; }));
      scores.push(sc.v);
      partial.push(sc.v != null && (provisional || sc.miss || inScore.some(function (pr) { return pr.partial[i]; })));
    }

    // 顯示用的整學期成分（兩次合併）：測驗、課堂＝全部項目平均；作業＝全部作業總和
    var comp = {
      quiz: meanOf(A.quiz.filter(function (q) { return q.kind === 'quiz'; })),
      other: meanOf(A.quiz.filter(function (q) { return q.kind === 'other'; })),
      homework: homeworkOf(null),
      midterm: periods[0].exam, final: periods[1].exam,
      daily1: periods[0].daily, daily2: periods[1].daily, total1: periods[0].total, total2: periods[1].total
    };
    var used = [];
    DAILY.forEach(function (k) { if (periods.some(function (pr) { return pr.dailyUsed.indexOf(k) > -1; })) used.push(k); });
    if (periods[0].examUsed) used.push('midterm');
    if (periods[1].examUsed) used.push('final');
    var vals = nonNull(scores);
    return {
      comp: comp, used: used, scores: scores, partial: partial, hwNoMax: hwNoMax, periods: periods, provisional: provisional,
      stats: describe(vals), tiers: tiers(vals),
      ranks: scores.map(function (v) { return v == null ? null : compRank(vals, v); }),
      weights: W
    };
  }

  // ============================================================
  // 四、跨學期、跨科目模型
  // ============================================================
  // raw = getAnalysisAll() 的結果。回傳：
  //   { terms:[出現過資料的學期，依時間順序], subjects:[{name, data, terms:[…], byTerm:{學期:{A,T}}, all:A, index:{key:idx}}], roster:[{key,name,seat}] }
  // 學生跨科比對用「姓名」（同一科內若有同名，才改用「姓名（座號）」區分）。
  function buildModel(raw, passPct, weightsOverride) {
    passPct = passPct == null ? DEFAULT_PASS : passPct;
    var weights = weightsOverride || raw.weights || DEFAULT_WEIGHTS;
    var kinds = raw.kinds || {};
    var termOrder = (raw.terms || []).slice();
    function termIdx(t) { var i = termOrder.indexOf(t); return i === -1 ? (t === '' ? 9999 : 9000) : i; }
    var subjects = [], roster = [], rosterSeen = {}, allTerms = {};

    raw.subjects.forEach(function (d) {
      var names = {}, dup = {};
      d.students.forEach(function (s) { if (names[s.name]) dup[s.name] = true; names[s.name] = true; });
      var index = {}, keys = [];
      d.students.forEach(function (s, i) {
        var key = dup[s.name] ? s.name + '（' + s.seat + '）' : s.name;
        keys.push(key); index[key] = i;
        if (!rosterSeen[key]) { rosterSeen[key] = true; roster.push({ key: key, name: s.name, seat: s.seat }); }
      });
      var termsHere = [];
      d.items.forEach(function (it) { var t = it.term || ''; if (termsHere.indexOf(t) === -1) termsHere.push(t); });
      termsHere.sort(function (a, b) { return termIdx(a) - termIdx(b); });
      var byTerm = {}, termsWithData = [];
      termsHere.forEach(function (t) {
        var A = analyze(d, kinds, passPct, { terms: [t] });
        if (!A.quiz.length && !A.homework.length) return;
        byTerm[t] = { A: A, T: termSummary(A, weightsOverride || (raw.subjectWeights && raw.subjectWeights[d.subject]) || weights) };
        termsWithData.push(t); allTerms[t] = true;
      });
      // 全部學期合併時，測驗依「學期→登記順序」排列（之後才補登的舊學期項目也會排回正確位置）
      var allA = analyze(d, kinds, passPct, null);
      allA.quiz = allA.quiz.map(function (q, i) { return { q: q, i: i }; })
        .sort(function (x, y) { return (termIdx(x.q.term) - termIdx(y.q.term)) || (x.i - y.i); })
        .map(function (x) { return x.q; });
      subjects.push({
        name: d.subject, data: d, terms: termsWithData, byTerm: byTerm, keys: keys, index: index,
        all: allA, layout: d.layout
      });
    });
    var terms = Object.keys(allTerms).sort(function (a, b) { return termIdx(a) - termIdx(b); });
    return { terms: terms, subjects: subjects, roster: roster, passPct: passPct, weights: weights, kinds: kinds, termOrder: termOrder, currentTerm: raw.currentTerm };
  }

  function subjectOf(model, name) {
    for (var i = 0; i < model.subjects.length; i++) if (model.subjects[i].name === name) return model.subjects[i];
    return null;
  }
  function termLabel(t) { return t; }

  // 學期預設值：目前學期若有資料就用它，否則取最後一個有資料的學期
  function defaultTerm(model, subject) {
    var list = subject ? subject.terms : model.terms;
    if (list.indexOf(model.currentTerm) > -1) return model.currentTerm;
    return list.length ? list[list.length - 1] : null;
  }

  // 某位學生在某科某學期的學期成績概況；沒有資料回傳 null
  function termRow(sm, term, idx) {
    var bt = sm.byTerm[term];
    if (!bt || idx == null) return null;
    var T = bt.T, sc = T.scores[idx];
    if (sc == null) return null;
    var m = T.stats.mean, s = T.stats.sd;
    return {
      term: term, score: sc, partial: T.partial[idx], rank: T.ranks[idx], n: T.stats.n,
      classMean: m, diff: sc - m, z: s > 0 ? (sc - m) / s : 0,
      tier: tierName(T.tiers, sc), comp: {
        quiz: T.comp.quiz[idx], homework: T.comp.homework[idx], other: T.comp.other[idx], midterm: T.comp.midterm[idx], final: T.comp.final[idx],
        daily1: T.comp.daily1[idx], daily2: T.comp.daily2[idx], total1: T.comp.total1[idx], total2: T.comp.total2[idx]
      }
    };
  }

  // 該科截至某學期（含）的所有測驗，依 學期→登記順序 排列
  function chronoTests(sm, uptoTerm, termOrderFn) {
    var out = [];
    sm.terms.forEach(function (t) {
      if (uptoTerm != null && termOrderFn(t) > termOrderFn(uptoTerm)) return;
      sm.byTerm[t].A.quiz.forEach(function (q) { out.push(q); });
    });
    return out;
  }

  // ============================================================
  // 五、關注警示
  // ============================================================
  var DEFAULT_ALERT = { drop: 12, decline: 10, termDrop: 8, miss: 3 };

  // 回傳這位學生的警示清單（依嚴重度排序）。level：'high'（警示）／'mid'（注意）
  // asOf：以哪個學期為「現在」（null＝各科自己最後有資料的學期）
  function alertsFor(model, key, th, asOf) {
    th = th || DEFAULT_ALERT;
    var out = [], pass = model.passPct;
    function termIdx(t) { var i = model.termOrder.indexOf(t); return i === -1 ? (t === '' ? 9999 : 9000) : i; }
    var zs = [];

    model.subjects.forEach(function (sm) {
      var idx = sm.index[key];
      if (idx === undefined || !sm.terms.length) return;
      var cur = asOf != null && sm.terms.indexOf(asOf) > -1 ? asOf : (asOf != null ? null : sm.terms[sm.terms.length - 1]);
      if (cur == null) return;
      var name = sm.name, tests = chronoTests(sm, cur, termIdx);

      // 相對班平均的差距序列（只含有參加的測驗）
      var ds = [];
      tests.forEach(function (q) { if (q.pcts[idx] != null) ds.push({ q: q, pct: q.pcts[idx], diff: q.pcts[idx] - q.pctStats.mean }); });
      var recentSet = tests.slice(-2);
      function isRecent(q) { return recentSet.indexOf(q) > -1; }

      // 1 單次突然落差
      if (ds.length >= 3) {
        var last = ds[ds.length - 1], prev = ds.slice(Math.max(0, ds.length - 6), ds.length - 1);
        var base = mean(prev.map(function (x) { return x.diff; })), delta = last.diff - base;
        if (isRecent(last.q) && delta <= -th.drop) {
          out.push({ subject: name, type: '突然落差', level: delta <= -th.drop * 1.5 ? 'high' : 'mid', term: cur,
            text: name + '「' + last.q.name + '」得分率 ' + fmt(last.pct) + '%（' + (last.diff >= 0 ? '高於' : '低於') + '班平均 ' + fmt(Math.abs(last.diff)) + ' 點），比他先前相對班平均的水準掉了 ' + fmt(-delta) + ' 點',
            soft: name + '最近一次考試比平常的表現低了一些，值得關心是否遇到困難。' });
        }
      }
      // 2 連續退步
      if (ds.length >= 3) {
        var a = ds[ds.length - 3], b = ds[ds.length - 2], c = ds[ds.length - 1];
        if (isRecent(c.q) && a.diff - b.diff >= 3 && b.diff - c.diff >= 3 && a.diff - c.diff >= th.decline) {
          out.push({ subject: name, type: '連續退步', level: 'mid', term: cur,
            text: name + '連續 3 次考試相對班平均明顯逐次下滑（' + signed(a.diff) + '→' + signed(b.diff) + '→' + signed(c.diff) + ' 點）',
            soft: name + '最近幾次考試的表現有逐漸下滑的趨勢。' });
        }
      }

      var tr = termRow(sm, cur, idx), T = sm.byTerm[cur].T, A = sm.byTerm[cur].A;
      if (tr) {
        zs.push({ subject: name, z: tr.z });
        // 3 學期成績低於及格線
        if (tr.score < pass) {
          out.push({ subject: name, type: '未達及格', level: tr.score < pass - 10 ? 'high' : 'mid', term: cur,
            text: name + (cur ? ' ' + cur : '') + '學期成績 ' + fmt(tr.score) + ' 分，低於及格線 ' + pass + ' 分',
            soft: name + '目前的學習成果還沒有達到及格水準，需要加強。' });
        }
        // 4 較上一學期退步（相對班平均）
        var ti = sm.terms.indexOf(cur), pt = ti > 0 ? sm.terms[ti - 1] : null;
        var ptr = pt != null ? termRow(sm, pt, idx) : null;
        // 連續三個學期相對班平均逐期下滑（每期退幅不大，但累積起來很可觀）
        var hist = [];
        sm.terms.slice(0, ti + 1).forEach(function (t) { var r2 = termRow(sm, t, idx); if (r2) hist.push(r2); });
        var h3 = hist.slice(-3), longDecline = false;
        if (hist.length >= 3 && h3[2].term === cur) {
          var s1 = h3[1].diff - h3[0].diff, s2 = h3[2].diff - h3[1].diff;
          longDecline = s1 <= -3 && s2 <= -3 && s1 + s2 <= -th.termDrop * 1.5;
        }
        if (ptr) {
          var chg = tr.diff - ptr.diff;
          if (longDecline && chg > -th.termDrop) {
            out.push({ subject: name, type: '學期退步', level: 'mid', term: cur,
              text: name + ' 連續三個學期相對班平均逐期下滑（' + h3.map(function (r2) { return r2.term + ' ' + signed(r2.diff); }).join(' → ') + ' 點）',
              soft: name + '連續幾個學期的整體表現都慢慢下降，建議一起討論調整學習方式。' });
          } else if (chg <= -th.termDrop) {
            out.push({ subject: name, type: '學期退步', level: chg <= -15 ? 'high' : 'mid', term: cur,
              text: name + ' 與 ' + pt + ' 相比，相對班平均的差距由 ' + signed(ptr.diff) + ' 變成 ' + signed(tr.diff) + ' 點（退步 ' + fmt(-chg) + ' 點）',
              soft: name + '和上一學期相比，整體表現有下降，值得一起了解原因。' });
          }
        }
      }
      // 5 作業缺交
      A.homework.forEach(function (h) {
        var m = h.missing[idx];
        if (m >= 2 && (m >= th.miss || m / h.nItems >= 0.4)) {
          out.push({ subject: name, type: '作業缺交', level: m >= th.miss && m / h.nItems >= 0.5 ? 'high' : 'mid', term: cur,
            text: name + (h.category ? '「' + h.category + '」' : '作業') + '缺交 ' + m + ' / ' + h.nItems + ' 次',
            soft: name + '的作業有幾次沒有繳交，請協助提醒按時完成。' });
        }
      });
      // 6 缺考
      var absent = A.quiz.filter(function (q) { return q.scores[idx] == null; });
      if (absent.length >= 2) {
        out.push({ subject: name, type: '缺考', level: 'mid', term: cur,
          text: name + '缺考 ' + absent.length + ' 次（' + absent.map(function (q) { return q.name; }).join('、') + '）',
          soft: name + '有幾次考試缺席，成績可能無法完整反映實力。' });
      }
    });

    // 7 單科明顯弱於其他科目（以相對班級的 z 分數比較）
    if (zs.length >= 3) {
      zs.sort(function (a, b) { return a.z - b.z; });
      var w = zs[0], others = mean(zs.slice(1).map(function (x) { return x.z; }));
      if (w.z <= -1 && others - w.z >= 1.2) {
        out.push({ subject: w.subject, type: '單科偏弱', level: 'mid', term: asOf,
          text: w.subject + '明顯弱於其他科目（相對班級 z=' + fmt(w.z, 2) + '，其他科平均 z=' + fmt(others, 2) + '）',
          soft: w.subject + '相對其他科目比較吃力，可以多給一些支持。' });
      }
    }
    // 範圍：作業缺交屬於「作業」，其餘（單次考試、學期成績相關）屬於「考試」
    out.forEach(function (a) { a.area = a.type === '作業缺交' ? 'homework' : 'exam'; });
    out.sort(function (a, b) { return (a.level === 'high' ? 0 : 1) - (b.level === 'high' ? 0 : 1); });
    return out;
  }

  // ============================================================
  // 六、單一學生的跨科、跨學期概況（個人概況、家長報告共用）
  // ============================================================
  // 回傳 { subjects:[{name, rows:[各學期 termRow], cur, prev, series(目前學期各次測驗), seriesAll, trend}], avgZ }
  function studentProfile(model, key, asOf) {
    var subs = [];
    model.subjects.forEach(function (sm) {
      var idx = sm.index[key];
      if (idx === undefined) return;
      var rows = [];
      sm.terms.forEach(function (t) { var r = termRow(sm, t, idx); if (r) rows.push(r); });
      var curTerm = asOf != null ? (sm.terms.indexOf(asOf) > -1 ? asOf : null) : (sm.terms.length ? sm.terms[sm.terms.length - 1] : null);
      var cur = null, prev = null;
      rows.forEach(function (r, i) { if (r.term === curTerm) { cur = r; prev = i > 0 ? rows[i - 1] : null; } });
      var seriesAll = [];
      sm.terms.forEach(function (t) { S_series(sm.byTerm[t].A, idx).forEach(function (x) { x.term = t; seriesAll.push(x); }); });
      var series = curTerm != null && sm.byTerm[curTerm] ? S_series(sm.byTerm[curTerm].A, idx) : [];
      var hw = curTerm != null && sm.byTerm[curTerm] ? sm.byTerm[curTerm].A.homework.map(function (h) {
        return { category: h.category, sum: h.sums[idx], totalMax: h.totalMax, missing: h.missing[idx], nItems: h.nItems, mean: h.stats.mean, rank: h.ranks[idx],
          missingNames: h.items.filter(function (it) { return sm.data.students[idx].scores[it.k] == null; }).map(function (it) { return it.name; }) };
      }) : [];
      subs.push({ name: sm.name, sm: sm, idx: idx, rows: rows, curTerm: curTerm, cur: cur, prev: prev, series: series, seriesAll: seriesAll, trend: trendJudge(series), hw: hw });
    });
    var zs = subs.filter(function (s) { return s.cur; }).map(function (s) { return s.cur.z; });
    return { subjects: subs, avgZ: zs.length ? mean(zs) : null };
  }
  function S_series(A, idx) { return studentSeries(A, idx, null); }

  // ============================================================
  // 七、獎狀名單（前 N 名、進步獎、學期領域前 N 名）
  // ============================================================
  // 期中階段＝第一次定期考查總成績（平時成績＋期中考）；期末階段＝學期成績（兩次定期考查各占設定的比例）
  function stageScores(T, phase) {
    return phase === 'midterm' ? T.periods[0].total.slice() : T.scores.slice();
  }

  // 取前 n 名；ties＝true 時，與第 n 名同分的人一併列入（獎狀常見做法）
  function pickTop(values, n, ties) {
    var cand = [];
    values.forEach(function (v, i) { if (v != null) cand.push(i); });
    if (!cand.length) return [];
    cand.sort(function (a, b) { return (values[b] - values[a]) || (a - b); });
    var all = cand.map(function (i) { return values[i]; });
    var cut = cand.length >= n ? values[cand[n - 1]] : -Infinity;
    var chosen = ties ? cand.filter(function (i) { return values[i] >= cut - 1e-9; }) : cand.slice(0, n);
    return chosen.map(function (i) { return { idx: i, value: values[i], rank: compRank(all, values[i]) }; });
  }

  function progressList(sm, term, o, excludeIdx) {
    var T = sm.byTerm[term].T, cur = T.comp.final, base;
    if (o.progressBase === 'prevFinal') {
      var ti = sm.terms.indexOf(term), pt = ti > 0 ? sm.terms[ti - 1] : null;
      if (pt == null) return { list: [], note: '沒有上一學期的期末考可以比較' };
      base = sm.byTerm[pt].T.comp.final;
    } else base = T.comp.midterm;
    var curVals = nonNull(cur), baseVals = nonNull(base);
    if (!curVals.length || !baseVals.length) return { list: [], note: '缺少期中考或期末考成績，無法比較' };
    var mc = mean(curVals), mb = mean(baseVals), rows = [];
    cur.forEach(function (c, i) {
      var b = base[i];
      if (c == null || b == null) return;
      var gain = o.progressMetric === 'rank' ? compRank(baseVals, b) - compRank(curVals, c)
        : (o.progressMetric === 'relative' ? (c - mc) - (b - mb) : c - b);
      rows.push({ idx: i, base: b, cur: c, gain: gain, baseRank: compRank(baseVals, b), curRank: compRank(curVals, c) });
    });
    var minGain = o.minGain == null ? 0 : o.minGain;
    rows = rows.filter(function (r) { return r.gain >= minGain - 1e-9 && r.gain > 0 && !(excludeIdx && excludeIdx.indexOf(r.idx) > -1); });
    rows.sort(function (a, b) { return (b.gain - a.gain) || (b.cur - a.cur) || (a.idx - b.idx); });
    var n = o.progressN;
    if (rows.length > n) {
      var cut = rows[n - 1].gain;
      rows = o.ties ? rows.filter(function (r) { return r.gain >= cut - 1e-9; }) : rows.slice(0, n);
    }
    return { list: rows, note: '' };
  }

  // 手動調整：o.excluded(kind, 科目, 學生key) 回傳 true 的人不列入不重複名單（但仍顯示在明細，讓老師可以勾回來）
  function markExcluded(list, kind, subject, o) {
    list.forEach(function (x) { x.excluded = !!(o.excluded && o.excluded(kind, subject, x.key)); });
  }
  function uniqueOf(subjects, field, sortBySeat) {
    var map = {}, list = [];
    subjects.forEach(function (s) {
      s[field].forEach(function (x) {
        if (x.excluded) return;
        if (!map[x.key]) { map[x.key] = { key: x.key, name: x.name, seat: x.seat, subjects: [] }; list.push(map[x.key]); }
        if (map[x.key].subjects.indexOf(s.name) === -1) map[x.key].subjects.push(s.name);
      });
    });
    if (sortBySeat) list.sort(function (a, b) { return (Number(a.seat) || 9999) - (Number(b.seat) || 9999); });
    return list;
  }

  // o = { term, phase:'midterm'|'final', topN, ties, basis:'exam'|'term', progressN, progressMetric:'score'|'relative'|'rank',
  //       progressBase:'midterm'|'prevFinal', minGain, excludeTop, subjects:[科目名]|null, sortBySeat, excluded:function }
  function awards(model, o) {
    var out = { subjects: [], missing: [], topUnique: [], progUnique: [] };
    function info(sm, idx) { var s = sm.data.students[idx]; return { key: sm.keys[idx], name: s.name, seat: s.seat }; }
    model.subjects.forEach(function (sm) {
      if (o.subjects && o.subjects.indexOf(sm.name) === -1) return;
      var bt = sm.byTerm[o.term];
      if (!bt) { out.missing.push({ subject: sm.name, why: '這個學期沒有任何成績' }); return; }
      var T = bt.T;
      var vals = o.basis === 'term' ? stageScores(T, o.phase) : (o.phase === 'midterm' ? T.comp.midterm : T.comp.final);
      if (!nonNull(vals).length) { out.missing.push({ subject: sm.name, why: o.phase === 'midterm' ? '沒有期中考成績' : '沒有期末考成績' }); return; }
      var top = pickTop(vals, o.topN, o.ties).map(function (x) { var r = info(sm, x.idx); r.value = x.value; r.rank = x.rank; r.idx = x.idx; return r; });
      var prog = [], progNote = '';
      if (o.phase === 'final') {
        var pr = progressList(sm, o.term, o, o.excludeTop ? top.map(function (x) { return x.idx; }) : null);
        progNote = pr.note;
        prog = pr.list.map(function (x) { var r = info(sm, x.idx); r.base = x.base; r.cur = x.cur; r.gain = x.gain; r.baseRank = x.baseRank; r.curRank = x.curRank; r.idx = x.idx; return r; });
      }
      markExcluded(top, 'top', sm.name, o); markExcluded(prog, 'prog', sm.name, o);
      out.subjects.push({ name: sm.name, top: top, prog: prog, progNote: progNote, n: nonNull(vals).length });
    });
    out.topUnique = uniqueOf(out.subjects, 'top', o.sortBySeat);
    out.progUnique = uniqueOf(out.subjects, 'prog', o.sortBySeat);
    return out;
  }

  // ---------- 學期領域成績（學校系統匯出的表） ----------
  var DOMAIN_ORDER = ['語文', '數學', '社會', '自然', '健體', '藝術', '綜合', '藝才'];
  var DOMAIN_ALIAS = { '自然科學': '自然', '自然與生活科技': '自然', '健康與體育': '健體', '藝術與人文': '藝術', '綜合活動': '綜合', '藝術才能': '藝才', '國語': '語文', '國語文': '語文', '本國語文': '語文' };
  var NON_DOMAIN = ['班級', '座號', '姓名', '名次', '排名', '班排', '班級排名', '平均', '總平均', '加權平均', '總分', '加權總分', '學號'];
  var STOP_COLS = ['名次', '排名', '班排', '班級排名', '平均', '總平均', '加權平均', '總分', '加權總分'];

  function normHeader(s) { return String(s == null ? '' : s).replace(/[（(][^）)]*[）)]/g, '').replace(/\s+/g, ''); }
  function toNum(v) {
    if (v === '' || v == null) return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  // values＝工作表的二維陣列。回傳 { domains:[{name,idx}], students:[{key,name,seat,scores:[]}], headerRow } 或 { error }
  function parseDomainSheet(values) {
    if (!values || !values.length) return { error: '這張工作表還是空的，請把學校匯出的成績貼進去' };
    var hr = -1, i, j;
    for (i = 0; i < Math.min(values.length, 30); i++) {
      var h = values[i].map(normHeader);
      if (h.indexOf('座號') > -1 && h.indexOf('姓名') > -1) { hr = i; break; }
    }
    if (hr < 0) return { error: '找不到標題列：貼上的內容需要包含「座號」「姓名」兩個標題' };
    var head = values[hr].map(normHeader), cs = head.indexOf('座號'), cn = head.indexOf('姓名');
    var stop = head.length;
    for (j = cn + 1; j < head.length; j++) if (STOP_COLS.indexOf(head[j]) > -1) { stop = j; break; }
    var cols = [], seen = {};
    for (j = 0; j < stop; j++) {
      if (j === cs || j === cn) continue;
      var raw = head[j];
      if (!raw || NON_DOMAIN.indexOf(raw) > -1) continue;
      var dn = DOMAIN_ALIAS[raw] || raw;
      if (seen[dn]) continue;
      seen[dn] = true; cols.push({ j: j, name: dn });
    }
    var students = [];
    for (i = hr + 1; i < values.length; i++) {
      var name = String(values[i][cn] == null ? '' : values[i][cn]).trim();
      if (!name || name === '平均' || name === '合計') continue;
      var sc = cols.map(function (c) { return toNum(values[i][c.j]); });
      if (!sc.some(function (v) { return v != null; })) continue;
      students.push({ name: name, seat: values[i][cs], scores: sc });
    }
    // 只留下真的有數字的領域（避免多貼到說明文字）
    var keep = [];
    cols.forEach(function (c, ci) { if (students.some(function (s) { return s.scores[ci] != null; })) keep.push(ci); });
    var domains = keep.map(function (ci, k) { return { name: cols[ci].name, idx: k }; });
    var dup = {}, nm = {};
    students.forEach(function (s) { if (nm[s.name]) dup[s.name] = true; nm[s.name] = true; });
    students.forEach(function (s) {
      s.scores = keep.map(function (ci) { return s.scores[ci]; });
      s.key = dup[s.name] ? s.name + '（' + s.seat + '）' : s.name;
    });
    if (!students.length) return { error: '找到標題列了，但底下沒有學生成績' };
    if (!domains.length) return { error: '找到「座號」「姓名」，但右邊沒有任何領域成績欄位' };
    return { domains: domains, students: students, headerRow: hr + 1 };
  }

  // o = { topN, ties, domains:[領域名]|null, sortBySeat, excluded:function }
  function domainAwards(P, o) {
    var out = { subjects: [], missing: [], topUnique: [], progUnique: [] };
    var order = P.domains.slice().sort(function (a, b) {
      var ia = DOMAIN_ORDER.indexOf(a.name), ib = DOMAIN_ORDER.indexOf(b.name);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.idx - b.idx;
    });
    order.forEach(function (d) {
      if (o.domains && o.domains.indexOf(d.name) === -1) return;
      var vals = P.students.map(function (s) { return s.scores[d.idx]; });
      var top = pickTop(vals, o.topN, o.ties).map(function (x) {
        var s = P.students[x.idx];
        return { key: s.key, name: s.name, seat: s.seat, value: x.value, rank: x.rank, idx: x.idx };
      });
      markExcluded(top, 'top', d.name, o);
      out.subjects.push({ name: d.name, top: top, prog: [], progNote: '', n: nonNull(vals).length });
    });
    out.topUnique = uniqueOf(out.subjects, 'top', o.sortBySeat);
    return out;
  }

  AX.stats = {
    sum: sum, mean: mean, median: median, sd: sd, describe: describe, scoreBands: scoreBands, nonNull: nonNull, tiers: tiers, tierName: tierName,
    TIER_DEFS: TIER_DEFS, compRank: compRank, topPercent: topPercent, histogram: histogram, fmt: fmt, signed: signed,
    DEFAULT_PASS: DEFAULT_PASS, DEFAULT_WEIGHTS: DEFAULT_WEIGHTS, DEFAULT_ALERT: DEFAULT_ALERT, KIND_LABEL: KIND_LABEL, TEST_KINDS: TEST_KINDS,
    defaultKind: defaultKind, analyze: analyze, studentAgg: studentAgg, studentSeries: studentSeries, trendJudge: trendJudge,
    termSummary: termSummary, buildModel: buildModel, subjectOf: subjectOf, termLabel: termLabel, defaultTerm: defaultTerm,
    termRow: termRow, chronoTests: chronoTests, alertsFor: alertsFor, studentProfile: studentProfile,
    awards: awards, stageScores: stageScores, pickTop: pickTop,
    parseDomainSheet: parseDomainSheet, domainAwards: domainAwards, DOMAIN_ORDER: DOMAIN_ORDER
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = AX;
})(typeof window !== 'undefined' ? window : globalThis);
