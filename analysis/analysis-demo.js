/* 示範資料（網址加上 ?demo=1 時使用，不需要連線）。
 * 3 個學期（114上、114下、115上＝進行中）、5 科、28 位學生，並刻意埋了幾個情境方便看效果：
 *   9 號：數學最近一次考試突然大幅落差　　14 號：英語逐學期持續退步
 *   20 號：自然單科明顯偏弱　　11 號：作業常缺交　　3 號：缺考兩次 */
(function (root) {
  'use strict';
  var AX = root.AX = root.AX || {};

  function rng(seed) { // mulberry32
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  var SUBJECTS = ['國語', '數學', '自然', '社會', '英語'];
  var TERMS = ['114上', '114下', '115上'];
  var CURRENT = '115上';
  var FAM = '王李張陳林黃吳劉蔡楊許鄭謝郭洪曾邱廖賴徐周葉蘇莊呂江何蕭羅高';
  var GIV = ['小明', '雅婷', '志豪', '怡君', '宗翰', '佩珊', '承恩', '欣妤', '冠宇', '詩涵', '家豪', '品妍', '柏翰', '語安', '建宏', '思穎', '俊傑', '子晴', '彥廷', '芷若', '政宏', '亭妤', '育誠', '郁婷', '宥廷', '映彤', '昱翔', '宜蓁'];

  var state = null;

  // 各科預設權重（與後端 Code.gs 的 defaultWeightsFor_ 相同）：
  // 學期成績＝第一次定期考查 p1 ＋ 第二次定期考查 p2；定期考查＝平時 daily ＋ 段考 exam；平時＝紙筆 quiz ＋ 作業 homework ＋ 課堂 other
  function defaultWeightsFor(n) {
    if (/英/.test(n)) return { daily: 50, exam: 50, quiz: 40, homework: 40, other: 20, p1: 50, p2: 50 };
    if (/自然/.test(n)) return { daily: 50, exam: 50, quiz: 40, homework: 50, other: 10, p1: 50, p2: 50 };
    if (/綜合|健|體/.test(n)) return { daily: 100, exam: 0, quiz: 40, homework: 35, other: 25, p1: 50, p2: 50 };
    if (/本土|閩|客|原住民|族語/.test(n)) return { daily: 100, exam: 0, quiz: 40, homework: 30, other: 30, p1: 50, p2: 50 };
    return { daily: 50, exam: 50, quiz: 40, homework: 35, other: 25, p1: 50, p2: 50 };
  }

  function build() {
    var rand = rng(20261021);
    function gauss(r) { r = r || rand; return (r() + r() + r() + r() - 2) * 1.7; }
    var seen = {}, people = [];
    GIV.forEach(function (g, i) {
      var name;
      do { name = FAM.charAt(Math.floor(rand() * FAM.length)) + g; } while (seen[name]);
      seen[name] = true;
      rand(); people.push({ seat: i + 1, name: name, ability: 74 + gauss() * 9, slope: gauss() * 0.8, lazy: g === '家豪' || g === '宥廷' });
    });
    var subjects = SUBJECTS.map(function (subj, si) {
      var r = rng(777 + si * 31);
      var offsets = people.map(function () { return gauss(r) * 4; });
      // 該科的項目：依學期排列
      var items = [], plan = [];
      TERMS.forEach(function (t, ti) {
        var inProgress = t === CURRENT;
        var nq = inProgress ? 4 : 6, half = nq / 2, k;
        for (k = 1; k <= half; k++) items.push({ term: t, category: '平時測驗', name: '測驗' + k, max: k % 3 === 0 ? 20 : 100 });
        for (k = 1; k <= half; k++) items.push({ term: t, category: '作業', name: '作業' + k, max: 10 });
        items.push({ term: t, category: '期中考', name: '期中考', max: 100 });
        for (k = half + 1; k <= nq; k++) items.push({ term: t, category: '平時測驗', name: '測驗' + k, max: k % 3 === 0 ? 20 : 100 });
        for (k = half + 1; k <= nq; k++) items.push({ term: t, category: '作業', name: '作業' + k, max: 10 });
        if (!inProgress) items.push({ term: t, category: '期末考', name: '期末考', max: 100 });
      });
      var diffs = items.map(function () { return gauss(r) * 4; });
      var testCount = 0, lastTestIdx = -1;
      items.forEach(function (it, i) { if (it.category !== '作業') lastTestIdx = i; });
      var students = people.map(function (p, pi) {
        var tIdx = 0, scores = [], seat = p.seat;
        items.forEach(function (it, i) {
          if (it.category === '作業') {
            var miss = p.lazy ? 0.4 : 0.05;
            scores.push(r() < miss ? null : Math.max(0, Math.min(it.max, Math.round(it.max * (0.8 + gauss(r) * 0.08)))));
            return;
          }
          var tpos = tIdx++;
          var pct = p.ability + offsets[pi] + p.slope * (tpos - 10) * 0.5 + diffs[i] + gauss(r) * 4;
          if (seat === 5) pct = 90 + gauss(r) * 2.5 + diffs[i] * 0.4;                              // 穩定的高分
          if (seat === 14 && subj === '英語') pct = 92 - tpos * 1.9 + gauss(r) * 2 + diffs[i] * 0.3; // 逐學期持續退步
          if (seat === 20 && subj === '自然') pct = pct - 24;                                         // 單科偏弱
          if (seat === 9 && subj === '數學' && i === lastTestIdx) pct = pct - 34;                 // 最近一次大幅落差
          if (seat === 3 && subj === '國語' && (it.name === '測驗2' || it.name === '測驗3') && it.term === CURRENT) { scores.push(null); return; }
          pct = Math.max(20, Math.min(100, pct));
          scores.push(r() < 0.015 ? null : Math.round(pct / 100 * it.max));
        });
        return { row: 5 + pi, seat: p.seat, name: p.name, scores: scores };
      });
      items.forEach(function (it, i) { it.col = 3 + i; it.difficulty = it.category === '期末考' ? '難' : (it.category === '期中考' ? '中' : '易'); });
      return { subject: subj, layout: 2, items: items, students: students, kinds: {} };
    });
    // 學校系統匯出的「學期領域成績」：前面有標題列，欄位順序與老師的分數表不同，右邊還有老師自己算的名次欄
    var dr = rng(4242), grid = [['高雄市某某國小', '', '', '', '', '', '', '', '', '', '', '', ''], ['114學年度第2學期 學期領域成績加權平均班級排序一覽表', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['班級', '座\n號', '姓名', '語文\n(7.0)', '健體\n(3.0)', '數學\n(4.0)', '社會\n(3.0)', '藝才\n(6.0)', '自然科學\n(3.0)', '綜合\n(1.0)', '藝術', '名次', '平均', '', '語文', '數學', '社會', '藝才', '自然', '健體', '藝術', '綜合']];
    people.forEach(function (p) {
      function g(mu, sdv, int) { var v = Math.max(60, Math.min(100, mu + (dr() - 0.5) * sdv)); return int ? Math.round(v) : Math.round(v * 100) / 100; }
      var ab = p.ability + 12;
      grid.push(['413', p.seat < 10 ? '0' + p.seat : String(p.seat), p.name, g(ab, 14), g(93, 8, true), g(ab - 2, 18), g(ab, 14), g(92, 10), g(ab, 14), g(94, 6, true), g(94, 8), '', '', '', 9, 9, 9, 9, 9, 9, 9, 9]);
    });
    // 前一學年（113 學年）的歷史成績：學校算好的定期考查總成績，只有國數社自；當時班上還有兩位後來轉出的同學
    var hr = rng(913), history = [], HNAMES = people.map(function (q) { return { name: q.name, ability: q.ability }; }).concat([{ name: '陳轉出', ability: 80 }, { name: '林轉出', ability: 70 }]);
    [['113上', 1], ['113上', 2], ['113下', 1], ['113下', 2]].forEach(function (st) {
      ['國語', '數學', '自然', '社會'].forEach(function (sj) {
        HNAMES.forEach(function (q) {
          var v = q.ability + (hr() - 0.5) * 12 + (hr() - 0.5) * 6;
          history.push({ term: st[0], p: st[1], name: q.name, subject: sj, score: Math.round(Math.max(45, Math.min(100, v)) * 10) / 10 });
        });
      });
    });
    var out = {
      history: history,
      domains: { '114下': grid },
      missingNotes: [],
      subjects: subjects, terms: TERMS.slice(), currentTerm: CURRENT,
      kinds: { '平時測驗': 'quiz', '作業': 'homework', '期中考': 'midterm', '期末考': 'final' },
      weights: { daily: 50, exam: 50, quiz: 40, homework: 35, other: 25, p1: 50, p2: 50 },
      subjectWeights: (function () { var o = {}; SUBJECTS.forEach(function (n) { o[n] = defaultWeightsFor(n); }); return o; })(),
      layout: { v1: [], v2: SUBJECTS.slice() }
    };
    // 學校匯出的語文、數學、社會、自然：用系統算出來的學期成績（四捨五入到小數 2 位），再刻意埋 3 個「輸入錯誤」，方便看檢核效果
    if (AX.stats && AX.stats.semesterByDomain) {
      var M = AX.stats.buildModel(out, 60), D = AX.stats.semesterByDomain(M, '114下', {}), colOf = { '語文': 3, '數學': 5, '社會': 6, '自然': 8 };
      var byName = {}; M.roster.forEach(function (r, i) { byName[r.name] = i; });
      D.domains.forEach(function (dm) {
        if (colOf[dm.name] == null) return;
        grid.slice(3).forEach(function (row) { var i = byName[row[2]], v = i == null ? null : dm.vals[i]; if (v != null) row[colOf[dm.name]] = Math.round(v * 100) / 100; });
      });
      var typo = [[6, '數學', 5, -3.4], [17, '自然', 8, 2.7], [22, '語文', 3, -1.9]];
      typo.forEach(function (t) { grid.slice(3).forEach(function (row) { if (Number(row[1]) === t[0] && typeof row[t[2]] === 'number') row[t[2]] = Math.round((row[t[2]] + t[3]) * 100) / 100; }); });
    }
    return out;
  }

  AX.demoCall = function (fn, args) {
    state = state || build();
    function clone(o) { return JSON.parse(JSON.stringify(o)); }
    if (fn === 'getAnalysisAll') {
      var r = clone(state);
      // 網址加 &legacy=1：模擬還沒升級成學期格式的試算表（項目沒有學期，登記簿卻有一個預設學期）
      if (typeof location !== 'undefined' && /legacy=1/.test(location.search)) {
        r.subjects.forEach(function (d) { d.layout = 1; d.items.forEach(function (it) { it.term = ''; }); });
        r.terms = ['115上']; r.currentTerm = '115上'; r.domains = {};
      }
      return r;
    }
    if (fn === 'setCategoryKind') { state.kinds[args[0]] = args[1]; return clone(state.kinds); }
    if (fn === 'setWeights') { state.weights = clone(args[0]); return clone(state.weights); }
    if (fn === 'setSubjectWeights') { state.subjectWeights[args[0]] = args[1] === null ? defaultWeightsFor(args[0]) : clone(args[1]); return true; }
    if (fn === 'importHistory') {
      var keyOf = function (h) { return h.term + '|' + h.p; }, incoming = {};
      args[0].forEach(function (h) { incoming[keyOf(h)] = true; });
      state.history = state.history.filter(function (h) { return !incoming[keyOf(h)]; }).concat(clone(args[0]));
      return { imported: args[0].length, stages: Object.keys(incoming).length, history: clone(state.history) };
    }
    if (fn === 'deleteHistoryStage') { state.history = state.history.filter(function (h) { return !(h.term === args[0] && Number(h.p) === Number(args[1])); }); return clone(state.history); }
    if (fn === 'createDomainSheet') return { name: '領域成績_' + args[0], term: args[0], gid: 0, existed: true };
    if (fn === 'saveScores') {
      var sj = state.subjects.filter(function (x) { return x.subject === args[0]; })[0];
      var idx = -1; sj.items.forEach(function (it, i) { if (it.col === Number(args[1])) idx = i; });
      args[2].forEach(function (e) { sj.students.forEach(function (s) { if (s.row === Number(e.row)) s.scores[idx] = e.score === '' ? null : Number(e.score); }); });
      return true;
    }
    if (fn === 'setMissingNote') {
      var a = args, list = state.missingNotes;
      for (var i = list.length - 1; i >= 0; i--) { var n = list[i]; if (n.subject === a[0] && n.term === a[1] && n.item === a[2] && n.student === a[3]) list.splice(i, 1); }
      if (a[4] || a[5]) list.push({ subject: a[0], term: a[1], item: a[2], student: a[3], reason: a[4] || '', note: a[5] || '' });
      return clone(list);
    }
    if (fn === 'writeAwardsSheet') return { name: '獎狀名單_系統產生', gid: 0 };
    if (fn === 'getSpreadsheetInfo') return { url: 'https://docs.google.com/spreadsheets/d/demo/edit', subjectGids: {} };
    throw new Error('示範模式不支援：' + fn);
  };
  AX.demoBuild = function () { return build(); };

  if (typeof module !== 'undefined' && module.exports) module.exports = AX;
})(typeof window !== 'undefined' ? window : globalThis);
