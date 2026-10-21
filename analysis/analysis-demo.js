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
        var nq = inProgress ? 4 : 6;
        for (var k = 1; k <= nq; k++) { items.push({ term: t, category: '平時測驗', name: '測驗' + k, max: k % 3 === 0 ? 20 : 100 }); }
        for (k = 1; k <= nq; k++) items.push({ term: t, category: '作業', name: '作業' + k, max: 10 });
        items.push({ term: t, category: '期中考', name: '期中考', max: 100 });
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
    return {
      domains: { '114下': grid },
      subjects: subjects, terms: TERMS.slice(), currentTerm: CURRENT,
      kinds: { '平時測驗': 'quiz', '作業': 'homework', '期中考': 'midterm', '期末考': 'final' },
      weights: { quiz: 30, homework: 10, midterm: 30, final: 30 },
      layout: { v1: [], v2: SUBJECTS.slice() }
    };
  }

  AX.demoCall = function (fn, args) {
    state = state || build();
    function clone(o) { return JSON.parse(JSON.stringify(o)); }
    if (fn === 'getAnalysisAll') return clone(state);
    if (fn === 'setCategoryKind') { state.kinds[args[0]] = args[1]; return clone(state.kinds); }
    if (fn === 'setWeights') { state.weights = clone(args[0]); return clone(state.weights); }
    if (fn === 'createDomainSheet') return { name: '領域成績_' + args[0], term: args[0], gid: 0, existed: true };
    if (fn === 'writeAwardsSheet') return { name: '獎狀名單_系統產生', gid: 0 };
    if (fn === 'getSpreadsheetInfo') return { url: 'https://docs.google.com/spreadsheets/d/demo/edit', subjectGids: {} };
    throw new Error('示範模式不支援：' + fn);
  };
  AX.demoBuild = function () { return build(); };

  if (typeof module !== 'undefined' && module.exports) module.exports = AX;
})(typeof window !== 'undefined' ? window : globalThis);
