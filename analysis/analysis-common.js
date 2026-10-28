/* 成績分析頁面共用程式（畫面層）：連線、圖表、共用元件、設定面板。
 * 統計運算在 analysis-stats.js，示範資料在 analysis-demo.js，請一起載入。 */
(function (root) {
  'use strict';
  var AX = root.AX = root.AX || {};
  var S = AX.stats, fmt = S.fmt;

  // ============================================================
  // 一、DOM 小工具
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
  // 二、連線（與「登記分數」獨立頁面共用同一組網址／密碼，放在同一個網站空間時只需輸入一次）
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
        if (json.error.indexOf('不允許呼叫此函式') > -1) {
          throw new Error('後端還是舊版：請把最新的 Code.gs 貼進 Apps Script，並「管理部署作業 → 編輯 → 新版本」重新部署');
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

  // 頁面外殼：連線設定按鈕、示範資料提示
  AX.shell = function () {
    app = document.querySelector('.app');
    injectShell();
    var btn = $('connBtn');
    if (btn) {
      if (DEMO) { btn.textContent = '示範資料（離開）'; btn.onclick = function () { location.search = ''; }; }
      else btn.onclick = AX.openGate;
    }
    if (root.AXArt) {
      var pg = (location.pathname.split('/').pop() || '').replace(/\.html.*$/, '').toLowerCase();
      var top = document.querySelector('.top'), hero = AXArt.hero(pg);
      if (top && hero) top.parentNode.insertBefore(hero, top.nextSibling);
      var ttl = document.querySelector('.top .title');
      if (ttl) { ttl.textContent = ''; ttl.appendChild(AXArt.icon('bars', 32)); ttl.appendChild(document.createTextNode('成績分析')); }
    }
    if (DEMO) {
      document.querySelectorAll('.pages a').forEach(function (a) { a.href += '?demo=1'; });
      app.insertBefore(el('div', { 'class': 'note noprint' }, '目前顯示的是系統產生的示範資料，不是真實成績。'), $('content'));
    }
  };

  // 還沒升級成學期格式的科目，項目沒有學期。為了讓畫面上不會出現「未分學期」這種選項，
  // 一律把沒有學期的項目視為屬於「目前學期」。（升級成學期格式後就是真正的學期了）
  AX.normalizeRaw = function (raw) {
    var cur = raw.currentTerm || (raw.terms && raw.terms.length ? raw.terms[raw.terms.length - 1] : '');
    raw.subjects.forEach(function (d) { d.items.forEach(function (it) { if (!it.term) it.term = cur; }); });
    return raw;
  };

  // 讀回全部科目資料 → 建立分析模型。回傳 { raw, model }
  AX.load = function () {
    return AX.call('getAnalysisAll').then(function (raw) {
      AX.normalizeRaw(raw);
      return { raw: raw, model: S.buildModel(raw, AX.getPass()) };   // 權重用各科目自己的設定（raw.subjectWeights）
    });
  };

  AX.pageUrl = function (page, params) {
    var parts = [];
    for (var k in (params || {})) if (params[k] != null && params[k] !== '') parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
    if (DEMO) parts.push('demo=1');
    return page + (parts.length ? '?' + parts.join('&') : '');
  };

  // ============================================================
  // 三、共用元件
  // ============================================================
  AX.card = function (title, sub) {
    var c = el('div', { 'class': 'card' });
    if (title) c.appendChild(el('h2', null, title));
    if (sub) c.appendChild(el('p', { 'class': 'sub' }, sub));
    return c;
  };
  AX.tile = function (k, v, unit, d, dcls) {
    var t = el('div', { 'class': 'tile' });
    t.appendChild(el('div', { 'class': 'k' }, k));
    var vv = el('div', { 'class': 'v' }, v);
    if (unit) vv.appendChild(el('small', null, unit));
    t.appendChild(vv);
    if (d) t.appendChild(el('div', { 'class': 'd ' + (dcls || '') }, d));
    return t;
  };
  AX.chips = function (pairs) {
    var c = el('div', { 'class': 'chips' });
    pairs.forEach(function (p) { var s = el('span', { 'class': 'chip' }, p[0]); s.appendChild(el('b', null, p[1])); c.appendChild(s); });
    return c;
  };
  AX.cls = function (v, eps) { eps = eps == null ? 0.05 : eps; return v > eps ? 'up' : (v < -eps ? 'down' : 'flat'); };
  AX.rankMove = function (prev, cur) { // 名次數字變小＝進步
    var d = prev - cur;
    return d > 0 ? '▲ ' + d + ' 名' : (d < 0 ? '▼ ' + (-d) + ' 名' : '名次不變');
  };
  AX.niceRange = function (vals) {
    vals = vals.filter(function (v) { return v != null; });
    if (!vals.length) return { lo: 0, hi: 100, ticks: [0, 20, 40, 60, 80, 100] };
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    lo = Math.max(0, Math.floor((lo - 5) / 10) * 10); hi = Math.min(100, Math.ceil((hi + 5) / 10) * 10);
    if (hi - lo < 20) { hi = Math.min(100, lo + 20); lo = Math.max(0, hi - 20); }
    var step = hi - lo > 50 ? 20 : 10, ticks = [];
    for (var t = lo; t <= hi; t += step) ticks.push(t);
    return { lo: lo, hi: hi, ticks: ticks };
  };
  AX.studentList = function (rows) { // rows: [{label, href, rank, value}]
    var ul = el('ul', { 'class': 'list' });
    rows.forEach(function (r) {
      var li = el('li');
      li.appendChild(el('span', { 'class': 'rk' }, r.rank == null ? '' : String(r.rank)));
      var nm = el('span', { 'class': 'nm' });
      nm.appendChild(r.href ? el('a', { 'class': 'link', href: r.href, title: '看個人概況' }, r.label) : document.createTextNode(r.label));
      li.appendChild(nm);
      li.appendChild(el('span', { 'class': 'vl' }, r.value));
      ul.appendChild(li);
    });
    return ul;
  };
  // 一排按鈕：items=[{label,value}]，on＝目前選中的 value，onPick(value)
  AX.btnGroup = function (box, items, on, onPick) {
    clear(box);
    items.forEach(function (it) {
      var b = el('button', { 'class': it.value === on ? 'on' : '' }, it.label);
      if (box.id === 'subjectBtns' && root.AXArt) b.insertBefore(AXArt.subject(it.label, 20), b.firstChild);   // 科目按鈕前面放一個小圖示
      b.onclick = function () { onPick(it.value); };
      box.appendChild(b);
    });
  };

  // ============================================================
  // 四、設定（分析方式、學期成績權重、及格線、警示門檻）
  // ============================================================
  AX.getPass = function () { var p = Number(lsGet('AX_PASS')); return p > 0 && p <= 100 ? p : S.DEFAULT_PASS; };
  AX.setPass = function (p) { lsSet('AX_PASS', String(p)); };
  AX.getAlertTh = function () {
    var out = {}, saved = {};
    try { saved = JSON.parse(lsGet('AX_ALERT') || '{}'); } catch (e) { saved = {}; }
    for (var k in S.DEFAULT_ALERT) { var v = Number(saved[k]); out[k] = v > 0 ? v : S.DEFAULT_ALERT[k]; }
    return out;
  };
  AX.setAlertTh = function (th) { lsSet('AX_ALERT', JSON.stringify(th)); };

  // 設定面板。ctx = { raw, model, showAlert:bool, onChange(needReload:boolean) }
  AX.renderSettings = function (box, ctx) {
    clear(box);
    var raw = ctx.raw, kinds = raw.kinds;

    // 類別分析方式
    var cats = [];
    raw.subjects.forEach(function (d) { d.items.forEach(function (it) { if (cats.indexOf(it.category) === -1) cats.push(it.category); }); });
    var g1 = el('div', { 'class': 'setgrp' });
    g1.appendChild(el('div', { 'class': 'h3' }, '類別怎麼分析'));
    g1.appendChild(el('p', { 'class': 'muted small' }, '平時測驗（紙筆測驗）／課堂表現＝逐次分析並算進平時成績；作業＝只看總和、算進平時成績；期中考、期末考＝逐次分析，分別是第一次、第二次定期考查的段考分數；不分析＝略過。各項比例見下方各科目權重。設定存在試算表，所有分析頁面共用。'));
    var row1 = el('div', { 'class': 'bar' });
    if (!cats.length) row1.appendChild(el('span', { 'class': 'muted small' }, '還沒有登記項目'));
    cats.forEach(function (c) {
      var g = el('span', { 'class': 'grp' });
      g.appendChild(el('span', { 'class': 'lbl' }, c || '（未分類）'));
      var sel = el('select');
      ['quiz', 'midterm', 'final', 'homework', 'other', 'skip'].forEach(function (k) {
        var o = el('option', { value: k }, S.KIND_LABEL[k]);
        if ((kinds[c] || S.defaultKind(c)) === k) o.selected = true;
        sel.appendChild(o);
      });
      sel.onchange = function () {
        AX.call('setCategoryKind', c, sel.value).then(function () { ctx.onChange(true); }).catch(showError);
      };
      g.appendChild(sel);
      row1.appendChild(g);
    });
    g1.appendChild(row1);
    box.appendChild(g1);

    // 各科目學期成績權重（兩層）
    var g2 = el('div', { 'class': 'setgrp' });
    g2.appendChild(el('div', { 'class': 'h3' }, '各科目學期成績權重'));
    g2.appendChild(el('p', { 'class': 'muted small' }, '學期成績＝第一次定期考查（期中）＋第二次定期考查（期末）；每次定期考查＝平時成績＋段考分數；平時成績＝紙筆測驗＋作業＋課堂表現。各科預設依學校公布的評量方式（綜合、健體、本土語沒有段考，平時成績就是定期考查的 100%）。數字可以直接修改，改完離開欄位就自動儲存；每一組的比例不用剛好是 100，會自動換算。某個成分沒有資料（例如期末考還沒考）時會自動略過並重新分配。平時項目屬於第一次還是第二次定期考查，在登記面板的「項目管理」設定（預設：期中考之前算第一次，之後算第二次）。'));
    var GROUPS = [['學期成績', ['p1', 'p2'], ['第一次定期考查', '第二次定期考查']], ['每次定期考查', ['daily', 'exam'], ['平時成績', '段考分數']], ['平時成績', ['quiz', 'homework', 'other'], ['紙筆測驗', '作業', '課堂表現']]];
    var KEYS = [], KLABEL = [];
    GROUPS.forEach(function (g) { g[1].forEach(function (k, i) { KEYS.push(k); KLABEL.push(g[2][i]); }); });
    var wtb = el('table', { 'class': 'stats' }), wthead = el('thead'), wh0 = el('tr'), wh = el('tr');
    wh0.appendChild(el('th', { 'class': 'l', rowspan: '2' }, '科目'));
    GROUPS.forEach(function (g) { wh0.appendChild(el('th', { colspan: String(g[1].length + 1), 'class': 'grp-h' }, g[0] + '的比例')); });
    wh0.appendChild(el('th', { rowspan: '2' }, ''));
    GROUPS.forEach(function (g) { g[2].forEach(function (lb) { wh.appendChild(el('th', null, lb)); }); wh.appendChild(el('th', null, '合計')); });
    wthead.appendChild(wh0); wthead.appendChild(wh); wtb.appendChild(wthead);
    var wbody = el('tbody');
    raw.subjects.forEach(function (d) {
      var w = (raw.subjectWeights && raw.subjectWeights[d.subject]) || S.DEFAULT_WEIGHTS;
      if (w.daily == null) w = S.DEFAULT_WEIGHTS;
      var tr = el('tr'), inputs = {}, sums = [];
      tr.appendChild(el('td', { 'class': 'l' }, d.subject));
      function refresh() { GROUPS.forEach(function (g, gi) { var t = 0; g[1].forEach(function (k) { t += Number(inputs[k].value) || 0; }); sums[gi].textContent = fmt(t); }); }
      GROUPS.forEach(function (g, gi) {
        g[1].forEach(function (k) {
          var inp = el('input', { type: 'number', min: '0', step: 'any' }); inp.value = w[k]; inp.style.width = '64px'; inputs[k] = inp;
          inp.oninput = refresh;
          inp.onchange = function () {
            var nw = {}; KEYS.forEach(function (x) { nw[x] = Number(inputs[x].value) || 0; });
            AX.call('setSubjectWeights', d.subject, nw).then(function () { toast('已儲存「' + d.subject + '」的權重'); ctx.onChange(true); }).catch(showError);
          };
          var td = el('td'); td.appendChild(inp); tr.appendChild(td);
        });
        sums[gi] = el('td', { 'class': 'muted' }); tr.appendChild(sums[gi]);
      });
      refresh();
      var rb = el('button', null, '還原預設');
      rb.onclick = function () { AX.call('setSubjectWeights', d.subject, null).then(function () { toast('已還原「' + d.subject + '」的預設權重'); ctx.onChange(true); }).catch(showError); };
      var tdb = el('td'); tdb.appendChild(rb); tr.appendChild(tdb);
      wbody.appendChild(tr);
    });
    wtb.appendChild(wbody);
    var wwrap = el('div', { 'class': 'tbl-wrap' }); wwrap.appendChild(wtb);
    g2.appendChild(wwrap);
    box.appendChild(g2);

    // 及格線與警示門檻（只存在這個瀏覽器）
    var g3 = el('div', { 'class': 'setgrp' });
    g3.appendChild(el('div', { 'class': 'h3' }, ctx.showAlert ? '及格線與警示門檻' : '及格線'));
    var row3 = el('div', { 'class': 'bar' });
    function numField(label, value, onSet, min) {
      var g = el('span', { 'class': 'grp' }); g.appendChild(el('span', { 'class': 'lbl' }, label));
      var inp = el('input', { type: 'number', min: String(min || 1), step: '1' }); inp.value = value;
      inp.onchange = function () { var v = Number(inp.value); if (!(v >= (min || 1))) { inp.value = value; return; } value = v; onSet(v); };
      g.appendChild(inp); row3.appendChild(g);
    }
    numField('及格線（分／得分率%）', AX.getPass(), function (v) { AX.setPass(v); ctx.onChange(true); });
    if (ctx.showAlert) {
      var th = AX.getAlertTh();
      var upd = function (k) { return function (v) { th[k] = v; AX.setAlertTh(th); ctx.onChange(false); }; };
      numField('單次落差（點）', th.drop, upd('drop'));
      numField('連續退步（點）', th.decline, upd('decline'));
      numField('學期退步（點）', th.termDrop, upd('termDrop'));
      numField('作業缺交（次）', th.miss, upd('miss'));
    }
    g3.appendChild(row3);
    if (ctx.showAlert) g3.appendChild(el('p', { 'class': 'muted small' }, '「點」指相對班平均的差距（百分點）。例如單次落差 12：最近一次考試比他先前相對班平均的水準低了 12 點以上，就會提醒。這些門檻只存在這個瀏覽器。'));
    box.appendChild(g3);
  };

  // ============================================================
  // 五、圖表（純 SVG，含滑鼠／觸控提示）
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
  AX.legend = legend;

  /* 折線圖
   * o = { labels:[], series:[{name,color,values:[number|null]}], band:{lo:[],hi:[],color,name}, yMin,yMax,ticks:[],
   *       invert:bool, height, tipRows:function(i)->{title,rows:[{color,name,value}],note}, yFmt, ariaLabel, noLegend, groups:[{from,to,label}] } */
  AX.lineChart = function (box, o) {
    clear(box);
    var multi = o.series.length + (o.band ? 1 : 0) > 1;
    if (multi && !o.noLegend) {
      var ent = o.series.map(function (s) { return { name: s.name, color: s.color }; });
      if (o.band) ent.push({ name: o.band.name, color: o.band.color, kind: 'bx' });
      legend(box, ent);
    }
    var holder = el('div', { 'class': 'chart' });
    box.appendChild(holder);
    var W = Math.max(240, holder.clientWidth || box.clientWidth || 600), H = o.height || 250;
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

    // 學期分隔：在不同學期之間畫一條細線，下方標學期名
    if (o.groups) o.groups.forEach(function (g, gi) {
      if (gi > 0) {
        var xs = (X(g.from - 1) + X(g.from)) / 2;
        svg.appendChild(sv('line', { x1: xs, x2: xs, y1: m.t, y2: m.t + ph + 18, 'class': 'ax-grid' }));
      }
      svg.appendChild(sv('text', { x: (X(g.from) + X(g.to)) / 2, y: H - 6, 'text-anchor': 'middle', 'class': 'ax-title' }, g.label));
    });

    var step = Math.max(1, Math.ceil(n / Math.max(1, Math.floor((pw - 2 * padX) / 52))));
    var maxChars = (pw / n) > 64 ? 7 : 5;
    o.labels.forEach(function (lb, i) {
      if (i % step !== 0) return;
      svg.appendChild(sv('text', { x: X(i), y: m.t + ph + 16, 'text-anchor': 'middle', 'class': 'ax-text' }, shortLabel(lb, maxChars)));
    });

    if (o.band) {
      var up = [], dn = [];
      for (var i = 0; i < n; i++) if (o.band.lo[i] != null && o.band.hi[i] != null) { up.push([X(i), Y(o.band.hi[i])]); dn.unshift([X(i), Y(o.band.lo[i])]); }
      if (up.length > 1) {
        var d = 'M' + up.concat(dn).map(function (p) { return p[0] + ' ' + p[1]; }).join('L') + 'Z';
        svg.appendChild(sv('path', { d: d, fill: o.band.color, opacity: 0.12 }));
      }
    }

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
   * o = { bins:[{label,short,count,names:[],highlight}], color, hiColor, hiName, name, markBefore, markLabel, countUnit, height, ariaLabel, xTitle } */
  AX.barChart = function (box, o) {
    clear(box);
    if (o.hiColor && o.hiName) legend(box, [{ name: o.name || '全班', color: o.color, kind: 'sq' }, { name: o.hiName, color: o.hiColor, kind: 'sq' }]);
    var holder = el('div', { 'class': 'chart' });
    box.appendChild(holder);
    var W = Math.max(240, holder.clientWidth || box.clientWidth || 500), H = o.height || 220;
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
        svg.appendChild(sv('path', { d: d, fill: b.highlight ? o.hiColor : o.color, 'class': 'hbar' }));
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

  /* 雙向長條圖（正＝高於基準、負＝低於基準），用來看各科相對班級／相對自己的強弱
   * o = { rows:[{label, value, text, tip:{title,rows,note}}], unit, ariaLabel } */
  AX.divBars = function (box, o) {
    clear(box);
    var holder = el('div', { 'class': 'chart' });
    box.appendChild(holder);
    var W = Math.max(260, holder.clientWidth || box.clientWidth || 500);
    var rowH = 34, m = { l: 58, r: 54, t: 10, b: 24 }, H = m.t + rowH * o.rows.length + m.b;
    var pw = W - m.l - m.r;
    var maxAbs = Math.max(5, Math.max.apply(null, o.rows.map(function (r) { return Math.abs(r.value); })));
    maxAbs = Math.ceil(maxAbs / 5) * 5;
    function X(v) { return m.l + pw / 2 + (v / maxAbs) * (pw / 2); }
    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, height: H, role: 'img', 'aria-label': o.ariaLabel || '各科強弱' });
    holder.appendChild(svg);
    [-maxAbs, 0, maxAbs].forEach(function (t) {
      svg.appendChild(sv('line', { x1: X(t), x2: X(t), y1: m.t, y2: m.t + rowH * o.rows.length, 'class': t === 0 ? 'ax-base' : 'ax-grid' }));
      svg.appendChild(sv('text', { x: X(t), y: H - 8, 'text-anchor': 'middle', 'class': 'ax-text' }, (t > 0 ? '+' : '') + t));
    });
    o.rows.forEach(function (r, i) {
      var cy = m.t + rowH * i + rowH / 2, bh = 18;
      svg.appendChild(sv('text', { x: m.l - 8, y: cy + 4, 'text-anchor': 'end', 'class': 'ax-val' }, r.label));
      var x0 = X(0), x1 = X(r.value), pos = r.value >= 0;
      if (Math.abs(x1 - x0) > 0.5) {
        var w = Math.abs(x1 - x0), rr = Math.min(4, w), x = Math.min(x0, x1);
        // 數據端 4px 圓角、零線端貼齊
        var d = pos
          ? 'M' + x + ' ' + (cy - bh / 2) + 'H' + (x + w - rr) + 'Q' + (x + w) + ' ' + (cy - bh / 2) + ' ' + (x + w) + ' ' + (cy - bh / 2 + rr) + 'V' + (cy + bh / 2 - rr) + 'Q' + (x + w) + ' ' + (cy + bh / 2) + ' ' + (x + w - rr) + ' ' + (cy + bh / 2) + 'H' + x + 'Z'
          : 'M' + (x + w) + ' ' + (cy - bh / 2) + 'H' + (x + rr) + 'Q' + x + ' ' + (cy - bh / 2) + ' ' + x + ' ' + (cy - bh / 2 + rr) + 'V' + (cy + bh / 2 - rr) + 'Q' + x + ' ' + (cy + bh / 2) + ' ' + (x + rr) + ' ' + (cy + bh / 2) + 'H' + (x + w) + 'Z';
        svg.appendChild(sv('path', { d: d, fill: pos ? 'var(--div-pos)' : 'var(--div-neg)', 'class': 'hbar' }));
      }
      svg.appendChild(sv('text', { x: pos ? x1 + 6 : x1 - 6, y: cy + 4, 'text-anchor': pos ? 'start' : 'end', 'class': 'ax-val' }, r.text));
      var hit = sv('rect', { x: 0, y: m.t + rowH * i, width: W, height: rowH, fill: 'transparent' });
      function go(ev) { if (r.tip) showTip(ev.clientX, ev.clientY, r.tip); }
      hit.addEventListener('pointermove', go); hit.addEventListener('pointerdown', go); hit.addEventListener('pointerleave', hideTip);
      svg.appendChild(hit);
    });
  };

  // 把「每位學生一個得分率」整理成 10 個組距（0–9 … 90–100），給 barChart 用
  // pcts：與 students 同順序的陣列（null 略過）；hiIdx：要標示成「本人」的學生索引
  AX.pctBins = function (students, pcts, hiIdx) {
    var items = [];
    pcts.forEach(function (p, i) { if (p != null) items.push({ v: Math.max(0, p), i: i }); });
    return S.histogram(items, 0, 100, 10).map(function (b, k) {
      return {
        label: k < 9 ? (k * 10) + '–' + (k * 10 + 9) : '90–100', short: String(k * 10), count: b.idx.length,
        names: b.idx.map(function (i) { return students[i].name; }),
        highlight: hiIdx != null && b.idx.indexOf(hiIdx) > -1
      };
    });
  };

  // 視窗寬度改變時重畫（只在寬度真的變了才重畫，避免捲動時手機網址列伸縮造成閃爍）
  AX.onResize = function (fn) {
    var lastW = window.innerWidth, h;
    window.addEventListener('resize', function () {
      clearTimeout(h);
      h = setTimeout(function () { if (window.innerWidth !== lastW) { lastW = window.innerWidth; fn(); } }, 150);
    });
  };

  AX.el = el; AX.$ = $; AX.clear = clear; AX.toast = toast; AX.showError = showError; AX.qs = qs;
  AX.seatLabel = seatLabel; AX.lsGet = lsGet; AX.lsSet = lsSet;
})(typeof window !== 'undefined' ? window : globalThis);
