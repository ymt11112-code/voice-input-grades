/* 成績分析頁面（全班概況／個人概況）共用程式：統計運算、連線、圖表、示範資料。
 * 前半段是純運算（沒有用到 DOM），可以直接用 node 載入測試。 */
(function (root) {
  'use strict';
  var AX = {};

  // ============================================================
  // 一、統計運算
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

  var DEFAULT_PASS = 60;

  function defaultKind(cat) { return String(cat).indexOf('作業') > -1 ? 'homework' : 'quiz'; }

  // data = getAnalysisData() 的結果；kinds = { 類別: quiz|homework|skip }；passPct = 及格線（得分率 %）
  function analyze(data, kinds, passPct) {
    passPct = passPct == null ? DEFAULT_PASS : passPct;
    kinds = kinds || {};
    var S = data.students, nS = S.length;
    var quiz = [], hwOrder = [], hwMap = {};

    data.items.forEach(function (it, k) {
      var kind = kinds[it.category] || defaultKind(it.category);
      if (kind === 'skip') return;
      var col = S.map(function (s) { return s.scores[k]; });
      if (!col.some(function (v) { return v != null; })) return; // 全班都沒成績＝還沒登記，不納入
      if (kind === 'quiz') {
        quiz.push(buildQuiz(it, k, col, nS, passPct));
      } else {
        if (!hwMap[it.category]) { hwMap[it.category] = { category: it.category, items: [], cols: [] }; hwOrder.push(it.category); }
        hwMap[it.category].items.push({ k: k, name: it.name, max: it.max });
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
      k: k, name: it.name, category: it.category, max: mx, maxAssumed: maxAssumed,
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
      category: g.category, items: g.items, nItems: nItems, totalMax: totalMax,
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

  // 所在位置百分比：名次 r / 人數 n
  function topPercent(rank, n) { return n ? Math.max(1, Math.ceil(rank / n * 100 - 1e-9)) : null; }

  function fmt(v, d) {
    if (v == null || isNaN(v)) return '—';
    d = d == null ? 1 : d;
    var s = Number(v).toFixed(d);
    return d > 0 ? s.replace(/\.?0+$/, '') : s;
  }
  function signed(v, d) { if (v == null) return '—'; var s = fmt(Math.abs(v), d); return (v > 0.0499 ? '+' : (v < -0.0499 ? '−' : '')) + s; }

  AX.stats = {
    sum: sum, mean: mean, median: median, sd: sd, describe: describe, tiers: tiers, tierName: tierName,
    TIER_DEFS: TIER_DEFS, compRank: compRank, histogram: histogram, analyze: analyze, studentAgg: studentAgg,
    studentSeries: studentSeries, trendJudge: trendJudge, topPercent: topPercent, defaultKind: defaultKind,
    DEFAULT_PASS: DEFAULT_PASS, fmt: fmt, signed: signed
  };

  if (typeof document === 'undefined') { // node 測試用
    if (typeof module !== 'undefined') module.exports = AX;
    return;
  }

  // ============================================================
  // 二、DOM 小工具
  // ============================================================
  var SVGNS = 'http://www.w3.org/2000/svg';
  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) { if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); }
    if (text != null) e.textContent = text;
    return e;
  }
  function sv(tag, attrs, text) {
    var e = document.createElementNS(SVGNS, tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 無痕視窗等情況忽略 */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* 忽略 */ } }
  function qs() {
    var o = {};
    location.search.replace(/^\?/, '').split('&').forEach(function (p) {
      if (!p) return;
      var kv = p.split('=');
      try { o[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' ')); } catch (e) { /* 忽略壞掉的參數 */ }
    });
    return o;
  }
  function seatLabel(s) { return (s.seat !== '' && s.seat != null ? s.seat + ' 號 ' : '') + s.name; }

  var toastTimer;
  function toast(msg, isErr) {
    var t = $('axToast');
    t.textContent = msg; t.className = 'toast ' + (isErr ? 'err' : 'ok'); t.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.style.display = 'none'; }, 3500);
  }
  function showError(err) { toast((err && err.message) ? err.message : String(err), true); }

  // ============================================================
  // 三、連線（與「登記分數」獨立頁面共用同一組網址／密碼，放在同一個網站空間時只需輸入一次）
  // ============================================================
  var CONN = { url: lsGet('WEBAPP_URL') || '', token: lsGet('WEBAPP_TOKEN') || '' };
  var gateResolve = null;
  var DEMO = !!qs().demo;
  AX.isDemo = DEMO;

  function looksLikeUrl(u) { return /^https:\/\/script\.google\.com\/.+\/exec(\?.*)?$/.test(u || ''); }

  function injectShell() {
    var gate = el('div', { 'class': 'gate', id: 'axGate' });
    var box = el('div', { 'class': 'box' });
    box.appendChild(el('h3', null, '連線設定'));
    var err = el('p', { 'class': 'err', id: 'axGateErr' }); err.hidden = true; box.appendChild(err);
    box.appendChild(el('p', { 'class': 'muted small' }, '網址與密碼和「登記分數」頁面使用同一組：試算表選單「📊 登記分數」→ 開啟面板 →「系統設定」→「語音輸入設定」可複製密碼；網址在 Apps Script「部署 → 管理部署作業」。存好之後同一個瀏覽器不用再輸入。'));
    box.appendChild(el('label', null, '網頁應用程式網址（結尾是 /exec）'));
    box.appendChild(el('input', { type: 'text', id: 'axGateUrl', autocomplete: 'off', placeholder: 'https://script.google.com/macros/s/.../exec' }));
    box.appendChild(el('label', null, '密碼'));
    box.appendChild(el('input', { type: 'text', id: 'axGateToken', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' }));
    var btns = el('div', { 'class': 'btns' });
    var save = el('button', { 'class': 'primary' }, '儲存並連線');
    save.onclick = submitGate;
    var demo = el('button', null, '先看示範資料');
    demo.onclick = function () { location.search = '?demo=1'; };
    btns.appendChild(save); btns.appendChild(demo);
    box.appendChild(btns);
    gate.appendChild(box);
    document.body.appendChild(gate);
    document.body.appendChild(el('div', { 'class': 'toast', id: 'axToast' }));
    document.body.appendChild(el('div', { 'class': 'tip', id: 'axTip' }));
  }

  function openGate(message) {
    $('axGateUrl').value = CONN.url || '';
    $('axGateToken').value = CONN.token || '';
    var err = $('axGateErr');
    err.hidden = !message; err.textContent = message || '';
    $('axGate').style.display = 'flex';
    setTimeout(function () { $(CONN.url ? 'axGateToken' : 'axGateUrl').focus(); }, 50);
  }
  function submitGate() {
    var u = $('axGateUrl').value.trim().replace(/^https:\/\/script\.google\.com\/a\/[^/]+\/macros\//, 'https://script.google.com/macros/')
      .replace(/^https:\/\/script\.google\.com\/a\/macros\/[^/]+\//, 'https://script.google.com/macros/');
    var t = $('axGateToken').value.trim();
    if (!looksLikeUrl(u)) {
      return openGate(/docs\.google\.com/.test(u)
        ? '這裡貼到的是試算表網址，要填的是「網頁應用程式」網址（https://script.google.com/macros/s/一長串/exec）。'
        : '網址格式不對，正確格式是 https://script.google.com/macros/s/一長串/exec（結尾是 /exec）。');
    }
    if (!t) return $('axGateToken').focus();
    CONN.url = u; CONN.token = t;
    lsSet('WEBAPP_URL', u); lsSet('WEBAPP_TOKEN', t);
    $('axGate').style.display = 'none';
    if (gateResolve) { var r = gateResolve; gateResolve = null; r(); }
    else location.reload();
  }
  function ensureConn() {
    if (CONN.url && CONN.token) return Promise.resolve();
    return new Promise(function (resolve) { gateResolve = resolve; openGate(); });
  }
  AX.openGate = function () { gateResolve = null; openGate(); };

  function post(fn, args, retries) {
    return fetch(CONN.url, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ fn: fn, args: args, token: CONN.token })
    }).then(function (r) { return r.text(); }).then(function (text) {
      var json;
      try { json = JSON.parse(text); } catch (e) { var pe = new Error('伺服器回傳非預期內容，網址可能不正確或部署已失效'); pe.retry = true; throw pe; }
      if (json && json.error) {
        if (json.error.indexOf('密碼不正確') > -1) {
          CONN.token = ''; lsDel('WEBAPP_TOKEN');
          openGate('密碼不正確，請重新貼上密碼。');
        }
        throw new Error(json.error);
      }
      return json.result;
    }).catch(function (err) {
      if ((err instanceof TypeError || err.retry) && retries > 0) {
        return new Promise(function (r) { setTimeout(r, 600); }).then(function () { return post(fn, args, retries - 1); });
      }
      if (err instanceof TypeError) err = new Error('網路連線失敗，請檢查網路，或按「連線設定」確認網址（存取權限需為「所有人」）');
      throw err;
    });
  }

  var app;
  function setLoading(on) { if (app) app.classList.toggle('loading', on); }
  AX.call = function (fn) {
    var args = Array.prototype.slice.call(arguments, 1);
    setLoading(true);
    var p = DEMO ? Promise.resolve().then(function () { return AX.demoCall(fn, args); })
      : ensureConn().then(function () { return post(fn, args, 2); });
    return p.then(function (r) { setLoading(false); return r; }, function (e) { setLoading(false); throw e; });
  };

  // 頁面外殼：連線設定按鈕、示範資料提示、共用元件
  AX.shell = function () {
    app = document.querySelector('.app');
    injectShell();
    var btn = $('connBtn');
    if (btn) {
      if (DEMO) { btn.textContent = '示範資料（離開）'; btn.onclick = function () { location.search = ''; }; }
      else btn.onclick = AX.openGate;
    }
    var nav = document.querySelectorAll('.pages a');
    if (DEMO) for (var i = 0; i < nav.length; i++) nav[i].href += '?demo=1';
    if (DEMO) {
      var note = el('div', { 'class': 'note' }, '目前顯示的是系統產生的示範資料，不是真實成績。');
      app.insertBefore(note, $('content'));
    }
  };

  // ============================================================
  // 四、圖表（純 SVG，含滑鼠／觸控提示）
  // ============================================================
  var tipEl;
  function showTip(clientX, clientY, spec) {
    tipEl = tipEl || $('axTip');
    clear(tipEl);
    if (spec.title) tipEl.appendChild(el('div', { 'class': 't' }, spec.title));
    (spec.rows || []).forEach(function (r) {
      var row = el('div', { 'class': 'r' });
      if (r.color) { var k = el('i'); k.style.background = r.color; row.appendChild(k); }
      row.appendChild(el('b', null, r.value));
      row.appendChild(el('span', null, r.name));
      tipEl.appendChild(row);
    });
    if (spec.note) tipEl.appendChild(el('div', { 'class': 'n' }, spec.note));
    tipEl.style.display = 'block';
    var w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    var x = clientX + 14, y = clientY + 14;
    if (x + w > window.innerWidth - 8) x = clientX - w - 14;
    if (y + h > window.innerHeight - 8) y = clientY - h - 14;
    tipEl.style.left = Math.max(4, x) + 'px';
    tipEl.style.top = Math.max(4, y) + 'px';
  }
  function hideTip() { tipEl = tipEl || $('axTip'); if (tipEl) tipEl.style.display = 'none'; }

  function shortLabel(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  function legend(box, entries) {
    var lg = el('div', { 'class': 'legend' });
    entries.forEach(function (e) {
      var s = el('span');
      var i = el('i', { 'class': e.kind || 'ln' }); i.style.background = e.color;
      s.appendChild(i); s.appendChild(document.createTextNode(e.name));
      lg.appendChild(s);
    });
    box.appendChild(lg);
  }

  /* 折線圖
   * o = { labels:[], series:[{name,color,values:[number|null]}], band:{lo:[],hi:[],color,name}, yMin,yMax,ticks:[],
   *       invert:bool, height, tipRows:function(i)->{title,rows:[{color,name,value}],note}, yFmt, ariaLabel } */
  AX.lineChart = function (box, o) {
    clear(box);
    var multi = o.series.length + (o.band ? 1 : 0) > 1;
    if (multi) {
      var ent = o.series.map(function (s) { return { name: s.name, color: s.color }; });
      if (o.band) ent.push({ name: o.band.name, color: o.band.color, kind: 'bx' });
      legend(box, ent);
    }
    var holder = el('div', { 'class': 'chart' });
    box.appendChild(holder);
    var W = Math.max(280, holder.clientWidth || box.clientWidth || 600), H = o.height || 250;
    var m = { l: 40, r: 14, t: 12, b: 44 };
    var n = o.labels.length, pw = W - m.l - m.r, ph = H - m.t - m.b, padX = 14;
    function X(i) { return n === 1 ? m.l + pw / 2 : m.l + padX + (pw - 2 * padX) * i / (n - 1); }
    function Y(v) { var f = (v - o.yMin) / (o.yMax - o.yMin); return m.t + ph * (o.invert ? f : 1 - f); }
    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, height: H, role: 'img', 'aria-label': o.ariaLabel || '折線圖' });
    holder.appendChild(svg);

    o.ticks.forEach(function (t) {
      var y = Y(t);
      svg.appendChild(sv('line', { x1: m.l, x2: W - m.r, y1: y, y2: y, 'class': 'ax-grid' }));
      svg.appendChild(sv('text', { x: m.l - 6, y: y + 4, 'text-anchor': 'end', 'class': 'ax-text' }, o.yFmt ? o.yFmt(t) : String(t)));
    });
    svg.appendChild(sv('line', { x1: m.l, x2: W - m.r, y1: m.t + ph, y2: m.t + ph, 'class': 'ax-base' }));

    var step = Math.max(1, Math.ceil(n / Math.max(1, Math.floor((pw - 2 * padX) / 52))));
    var maxChars = (pw / n) > 64 ? 7 : 4;
    o.labels.forEach(function (lb, i) {
      if (i % step !== 0) return;
      svg.appendChild(sv('text', { x: X(i), y: H - m.b + 16, 'text-anchor': 'middle', 'class': 'ax-text' }, shortLabel(lb, maxChars)));
    });

    if (o.band) {
      var up = [], dn = [];
      for (var i = 0; i < n; i++) if (o.band.lo[i] != null && o.band.hi[i] != null) { up.push([X(i), Y(o.band.hi[i])]); dn.unshift([X(i), Y(o.band.lo[i])]); }
      if (up.length > 1) {
        var d = 'M' + up.concat(dn).map(function (p) { return p[0] + ' ' + p[1]; }).join('L') + 'Z';
        svg.appendChild(sv('path', { d: d, fill: o.band.color, opacity: 0.12 }));
      }
    }

    var dotSets = [];
    o.series.forEach(function (s) {
      var segs = [], cur = [];
      s.values.forEach(function (v, i) { if (v == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([X(i), Y(v)]); });
      if (cur.length) segs.push(cur);
      segs.forEach(function (sg) {
        if (sg.length > 1) svg.appendChild(sv('path', { d: 'M' + sg.map(function (p) { return p[0] + ' ' + p[1]; }).join('L'), fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      });
      if (n <= 24) s.values.forEach(function (v, i) {
        if (v != null) svg.appendChild(sv('circle', { cx: X(i), cy: Y(v), r: 4, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 2 }));
      });
      dotSets.push(s);
    });

    var cross = sv('line', { y1: m.t, y2: m.t + ph, 'class': 'ax-cross', visibility: 'hidden' });
    svg.appendChild(cross);
    var hov = o.series.map(function (s) { var c = sv('circle', { r: 5.5, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 2, visibility: 'hidden' }); svg.appendChild(c); return c; });
    var hit = sv('rect', { x: m.l, y: m.t, width: pw, height: ph, fill: 'transparent', style: 'touch-action:pan-y' });
    svg.appendChild(hit);

    function at(ev) {
      var r = svg.getBoundingClientRect(), sx = W / r.width;
      var px = (ev.clientX - r.left) * sx, best = 0, bd = 1e9;
      for (var i = 0; i < n; i++) { var dd = Math.abs(X(i) - px); if (dd < bd) { bd = dd; best = i; } }
      cross.setAttribute('x1', X(best)); cross.setAttribute('x2', X(best)); cross.setAttribute('visibility', 'visible');
      o.series.forEach(function (s, k) {
        var v = s.values[best];
        if (v == null) hov[k].setAttribute('visibility', 'hidden');
        else { hov[k].setAttribute('cx', X(best)); hov[k].setAttribute('cy', Y(v)); hov[k].setAttribute('visibility', 'visible'); }
      });
      showTip(ev.clientX, ev.clientY, o.tipRows(best));
    }
    function off() { cross.setAttribute('visibility', 'hidden'); hov.forEach(function (c) { c.setAttribute('visibility', 'hidden'); }); hideTip(); }
    hit.addEventListener('pointermove', at);
    hit.addEventListener('pointerdown', at);
    hit.addEventListener('pointerleave', off);
  };

  /* 直條圖（組距分布）
   * o = { bins:[{label,count,names:[],highlight}], color, hiColor, markBefore:index, markLabel, countUnit, height, ariaLabel, xTitle } */
  AX.barChart = function (box, o) {
    clear(box);
    if (o.hiColor && o.hiName) legend(box, [{ name: o.name || '全班', color: o.color, kind: 'sq' }, { name: o.hiName, color: o.hiColor, kind: 'sq' }]);
    var holder = el('div', { 'class': 'chart' });
    box.appendChild(holder);
    var W = Math.max(260, holder.clientWidth || box.clientWidth || 500), H = o.height || 220;
    var m = { l: 30, r: 10, t: 22, b: o.xTitle ? 46 : 32 };
    var nb = o.bins.length, pw = W - m.l - m.r, ph = H - m.t - m.b, slot = pw / nb, bw = Math.min(24, slot - 6);
    var maxC = Math.max(1, Math.max.apply(null, o.bins.map(function (b) { return b.count; })));
    var yMax = maxC <= 4 ? maxC : Math.ceil(maxC / 2) * 2;
    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, height: H, role: 'img', 'aria-label': o.ariaLabel || '分布圖' });
    holder.appendChild(svg);
    function Y(c) { return m.t + ph * (1 - c / yMax); }
    var tickStep = yMax <= 6 ? 1 : (yMax <= 12 ? 2 : 5);
    for (var t = 0; t <= yMax; t += tickStep) {
      svg.appendChild(sv('line', { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), 'class': t === 0 ? 'ax-base' : 'ax-grid' }));
      svg.appendChild(sv('text', { x: m.l - 6, y: Y(t) + 4, 'text-anchor': 'end', 'class': 'ax-text' }, String(t)));
    }
    o.bins.forEach(function (b, i) {
      var cx = m.l + slot * (i + 0.5), x = cx - bw / 2;
      if (b.count > 0) {
        var top = Y(b.count), h = m.t + ph - top, r = Math.min(4, h, bw / 2);
        var d = 'M' + x + ' ' + (m.t + ph) + 'V' + (top + r) + 'Q' + x + ' ' + top + ' ' + (x + r) + ' ' + top + 'H' + (x + bw - r) + 'Q' + (x + bw) + ' ' + top + ' ' + (x + bw) + ' ' + (top + r) + 'V' + (m.t + ph) + 'Z';
        svg.appendChild(sv('path', { d: d, fill: b.highlight ? o.hiColor : o.color, 'class': 'hbar', 'data-i': i }));
        svg.appendChild(sv('text', { x: cx, y: top - 5, 'text-anchor': 'middle', 'class': 'ax-val' }, String(b.count)));
      }
      var lb = slot >= 46 ? b.label : (b.short || b.label);
      svg.appendChild(sv('text', { x: cx, y: m.t + ph + 15, 'text-anchor': 'middle', 'class': 'ax-text' }, lb));
    });
    if (o.markBefore != null) {
      var mx = m.l + slot * o.markBefore;
      svg.appendChild(sv('line', { x1: mx, x2: mx, y1: m.t - 4, y2: m.t + ph, 'class': 'ax-mark' }));
      svg.appendChild(sv('text', { x: mx + 4, y: m.t - 8, 'class': 'ax-text' }, o.markLabel || ''));
    }
    if (o.xTitle) svg.appendChild(sv('text', { x: m.l + pw / 2, y: H - 6, 'text-anchor': 'middle', 'class': 'ax-title' }, o.xTitle));
    o.bins.forEach(function (b, i) {
      var r = sv('rect', { x: m.l + slot * i, y: m.t, width: slot, height: ph, fill: 'transparent' });
      function go(ev) {
        var names = b.names || [], shown = names.slice(0, 14);
        showTip(ev.clientX, ev.clientY, {
          title: b.label, rows: [{ value: b.count + ' ' + (o.countUnit || '人'), name: '' }],
          note: names.length ? shown.join('、') + (names.length > shown.length ? ' …等 ' + names.length + ' 人' : '') : ''
        });
      }
      r.addEventListener('pointermove', go); r.addEventListener('pointerdown', go); r.addEventListener('pointerleave', hideTip);
      svg.appendChild(r);
    });
  };

  // 把「每位學生一個得分率」整理成 10 個組距（0–9 … 90–100），給 barChart 用
  // pcts：與 students 同順序的陣列（null 略過）；hiIdx：要標示成「本人」的學生索引
  AX.pctBins = function (students, pcts, hiIdx) {
    var items = [];
    pcts.forEach(function (p, i) { if (p != null) items.push({ v: Math.max(0, p), i: i }); });
    return AX.stats.histogram(items, 0, 100, 10).map(function (b, k) {
      return {
        label: k < 9 ? (k * 10) + '–' + (k * 10 + 9) : '90–100', short: String(k * 10), count: b.idx.length,
        names: b.idx.map(function (i) { return students[i].name; }),
        highlight: hiIdx != null && b.idx.indexOf(hiIdx) > -1
      };
    });
  };

  // 重新排版：視窗寬度改變時重畫（只在寬度真的變了才重畫，避免捲動時手機網址列伸縮造成閃爍）
  AX.onResize = function (fn) {
    var lastW = window.innerWidth, h;
    window.addEventListener('resize', function () {
      clearTimeout(h);
      h = setTimeout(function () { if (window.innerWidth !== lastW) { lastW = window.innerWidth; fn(); } }, 150);
    });
  };

  // ============================================================
  // 五、各頁共用：科目／類別分析設定
  // ============================================================
  AX.KIND_LABEL = { quiz: '逐項分析', homework: '只看總和', skip: '不分析' };

  // 載入初始資料，回傳 { subjects, kinds }
  AX.loadInit = function () {
    return AX.call('getAnalysisInit').then(function (d) { return d; });
  };
  AX.getPass = function () { var p = Number(lsGet('AX_PASS')); return p > 0 && p <= 100 ? p : DEFAULT_PASS; };
  AX.setPass = function (p) { lsSet('AX_PASS', String(p)); };

  // 在 box 裡畫出「類別分析方式」設定（每個類別一個下拉）；改變時存回試算表並呼叫 onChange(newKinds)
  AX.renderKindSettings = function (box, categories, kinds, onChange) {
    clear(box);
    if (!categories.length) { box.appendChild(el('span', { 'class': 'muted small' }, '這個科目還沒有登記項目')); return; }
    categories.forEach(function (c) {
      var g = el('span', { 'class': 'grp' });
      g.appendChild(el('span', { 'class': 'lbl' }, c || '（未分類）'));
      var sel = el('select');
      ['quiz', 'homework', 'skip'].forEach(function (k) {
        var o = el('option', { value: k }, AX.KIND_LABEL[k]);
        if ((kinds[c] || defaultKind(c)) === k) o.selected = true;
        sel.appendChild(o);
      });
      sel.onchange = function () {
        var prev = kinds[c];
        kinds[c] = sel.value;
        AX.call('setCategoryKind', c, sel.value).then(function (nk) {
          for (var k in nk) kinds[k] = nk[k];
          onChange(kinds);
        }).catch(function (e) { kinds[c] = prev; showError(e); });
      };
      g.appendChild(sel);
      box.appendChild(g);
    });
  };

  AX.el = el; AX.$ = $; AX.clear = clear; AX.toast = toast; AX.showError = showError; AX.qs = qs;
  AX.seatLabel = seatLabel; AX.lsGet = lsGet; AX.lsSet = lsSet; AX.legend = legend;

  // ============================================================
  // 六、示範資料（網址加上 ?demo=1 時使用，不需要連線）
  // ============================================================
  function rng(seed) { // mulberry32
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var demoKinds = { '平時測驗': 'quiz', '作業': 'homework', '期中考': 'quiz' };
  var demoCache = {};
  function demoBuild(subject, seedBase) {
    var rand = rng(seedBase);
    function gauss() { return (rand() + rand() + rand() + rand() - 2) * 1.7; }
    var FAM = '王李張陳林黃吳劉蔡楊許鄭謝郭洪曾邱廖賴徐周葉蘇莊呂江何蕭羅高';
    var GIV = ['小明', '雅婷', '志豪', '怡君', '宗翰', '佩珊', '承恩', '欣妤', '冠宇', '詩涵', '家豪', '品妍', '柏翰', '語安', '建宏', '思穎', '俊傑', '子晴', '彥廷', '芷若', '政宏', '亭妤', '育誠', '郁婷', '宥廷', '映彤', '昱翔', '宜蓁'];
    var items = [], students = [], i, k;
    for (k = 1; k <= 9; k++) items.push({ category: '平時測驗', name: '測驗' + k, max: k % 4 === 0 ? 20 : 100 });
    for (k = 1; k <= 8; k++) items.push({ category: '作業', name: '作業' + k, max: 10 });
    items.push({ category: '期中考', name: '第一次段考', max: 100 });
    var diff = items.map(function () { return gauss() * 4; });
    for (i = 0; i < GIV.length; i++) {
      var ability = 74 + gauss() * 10, slope = gauss() * 1.4, lazy = rand() < 0.2;
      var scores = [];
      var qi = 0;
      items.forEach(function (it, idx) {
        if (it.category === '作業') {
          var miss = lazy ? 0.35 : 0.06;
          scores.push(rand() < miss ? null : Math.max(0, Math.min(it.max, Math.round(it.max * (0.78 + gauss() * 0.1)))));
        } else {
          var t = it.category === '期中考' ? 9 : qi++;
          var pct = ability + slope * (t - 4) + diff[idx] + gauss() * 5;
          pct = Math.max(20, Math.min(100, pct));
          scores.push(rand() < 0.03 ? null : Math.round(pct / 100 * it.max));
        }
      });
      students.push({ row: 4 + i, seat: i + 1, name: FAM.charAt(Math.floor(rand() * FAM.length)) + GIV[i], scores: scores });
    }
    return { subject: subject, items: items, students: students, kinds: JSON.parse(JSON.stringify(demoKinds)) };
  }
  AX.demoCall = function (fn, args) {
    var subjects = ['數學', '國語', '自然'];
    if (fn === 'getAnalysisInit') return { subjects: subjects, categories: ['平時測驗', '作業', '期中考'], kinds: JSON.parse(JSON.stringify(demoKinds)) };
    if (fn === 'getAnalysisData') {
      var s = args[0], idx = subjects.indexOf(s);
      if (idx < 0) throw new Error('找不到科目：' + s);
      if (!demoCache[s]) demoCache[s] = demoBuild(s, 1000 + idx * 77);
      var d = JSON.parse(JSON.stringify(demoCache[s]));
      d.kinds = JSON.parse(JSON.stringify(demoKinds));
      return d;
    }
    if (fn === 'setCategoryKind') { demoKinds[args[0]] = args[1]; return JSON.parse(JSON.stringify(demoKinds)); }
    throw new Error('示範模式不支援：' + fn);
  };

  root.AX = AX;
})(typeof window !== 'undefined' ? window : globalThis);
