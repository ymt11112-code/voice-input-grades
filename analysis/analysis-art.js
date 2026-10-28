/* 日系繪本風的手繪 SVG 插圖：科目小圖示、獎狀／進步獎、各頁面的主視覺。
 * 配色：和紙白 #FFFCF6、墨灰線 #3E3A39、珊瑚粉 #F2A497、山吹黃 #F6D27A、水色 #A8D3E6、若竹綠 #B9DAA5。平塗、不用漸層。
 * 動畫：只用 CSS（見 analysis-common.css），並尊重「減少動態效果」設定。 */
(function (root) {
  'use strict';
  var A = root.AXArt = {};
  var INK = '#3E3A39', CORAL = '#F2A497', YEL = '#F6D27A', AQUA = '#A8D3E6', GRN = '#B9DAA5', PAPER = '#FFFCF6';

  // 可愛的小臉（眼睛、腮紅、小嘴）；眼睛會偶爾眨一下
  function face(cx, cy, sp, k) {
    sp = sp || 7; k = k || 1;
    return '<g class="blink"><circle cx="' + (cx - sp) + '" cy="' + cy + '" r="' + (1.9 * k) + '" fill="' + INK + '" stroke="none"/><circle cx="' + (cx + sp) + '" cy="' + cy + '" r="' + (1.9 * k) + '" fill="' + INK + '" stroke="none"/></g>' +
      '<ellipse cx="' + (cx - sp - 3.6 * k) + '" cy="' + (cy + 4 * k) + '" rx="' + (3 * k) + '" ry="' + (2 * k) + '" fill="' + CORAL + '" stroke="none"/>' +
      '<ellipse cx="' + (cx + sp + 3.6 * k) + '" cy="' + (cy + 4 * k) + '" rx="' + (3 * k) + '" ry="' + (2 * k) + '" fill="' + CORAL + '" stroke="none"/>' +
      '<path d="M' + (cx - 2.2 * k) + ' ' + (cy + 3.6 * k) + ' q' + (2.2 * k) + ' ' + (2.4 * k) + ' ' + (4.4 * k) + ' 0" fill="none" stroke-width="' + (1.9 * k) + '"/>';
  }

  // 64×64 的小圖示（內容；外層會套上墨灰線條與圓角線頭）
  var ICON = {
    book: function () {
      return '<path d="M6 16 Q19 10 32 16 V52 Q19 46 6 52 Z" fill="' + AQUA + '"/><path d="M58 16 Q45 10 32 16 V52 Q45 46 58 52 Z" fill="' + YEL + '"/>' +
        '<path d="M12 25 Q19 22 26 25 M12 32 Q19 29 26 32" stroke-width="2.2"/><path d="M38 25 Q45 22 52 25" stroke-width="2.2"/>' +
        '<path d="M46 13 V28 l3.5 -3 3.5 3 V12" fill="' + CORAL + '"/>' + face(32, 43, 7);
    },
    math: function () {
      return '<rect x="9" y="9" width="46" height="46" rx="12" fill="' + YEL + '"/><path d="M17 23 h11 M22.5 17.5 v11" stroke-width="3"/><path d="M37 23 h11" stroke-width="3"/>' +
        '<path d="M17 52 l0 0" /><rect x="40" y="33" width="9" height="9" rx="2" fill="' + AQUA + '" stroke-width="2.4"/>' + face(27, 42, 6);
    },
    globe: function () {
      return '<circle cx="32" cy="30" r="21" fill="' + AQUA + '"/><path d="M15 22 q6 -7 12 -3 q3 5 -3 8 q-6 2 -9 -5z" fill="' + GRN + '" stroke-width="2.6"/>' +
        '<path d="M40 38 q9 -3 11 3 q-2 9 -10 7 q-4 -4 -1 -10z" fill="' + GRN + '" stroke-width="2.6"/>' + face(31, 30, 6) +
        '<path d="M14 52 q18 9 36 0" /><path d="M32 51 v6 M23 58 h18"/>';
    },
    sprout: function () {
      return '<path d="M18 40 H46 L42 57 H22 Z" fill="' + CORAL + '"/><rect x="14" y="33" width="36" height="9" rx="3.5" fill="' + CORAL + '"/><path d="M32 33 V19"/>' +
        '<g class="sway"><path d="M32 26 C22 26 17 18 19 11 C28 11 33 17 32 26Z" fill="' + GRN + '"/><path d="M32 21 C40 21 46 15 45 8 C37 8 32 14 32 21Z" fill="' + GRN + '"/></g>' + face(32, 48, 6, 0.9);
    },
    abc: function () {
      return '<rect x="5" y="10" width="54" height="34" rx="12" fill="' + AQUA + '"/><path d="M18 44 L15 57 L30 44" fill="' + AQUA + '"/>' +
        '<text x="32" y="33" text-anchor="middle" font-size="17" font-weight="700" fill="' + INK + '" stroke="none" font-family="Huninn, sans-serif">ABC</text>';
    },
    ball: function () {
      return '<circle cx="32" cy="32" r="22" fill="' + CORAL + '"/><path d="M10 32 Q32 22 54 32 M32 10 Q41 32 32 54 M32 10 Q23 32 32 54" stroke-width="2.6"/>';
    },
    palette: function () {
      return '<path d="M32 8 C16 8 6 20 8 33 C10 46 22 56 34 55 C42 54 40 47 44 44 C50 40 58 42 58 32 C58 18 46 8 32 8Z" fill="' + YEL + '"/>' +
        '<circle cx="22" cy="26" r="4" fill="' + CORAL + '" stroke-width="2.4"/><circle cx="34" cy="19" r="4" fill="' + AQUA + '" stroke-width="2.4"/><circle cx="46" cy="26" r="4" fill="' + GRN + '" stroke-width="2.4"/><circle cx="22" cy="40" r="3.4" fill="' + PAPER + '" stroke-width="2.4"/>';
    },
    star: function () {
      return '<path d="M32 7 L39 23 L57 25 L43.5 36.5 L47.5 54 L32 45 L16.5 54 L20.5 36.5 L7 25 L25 23Z" fill="' + YEL + '"/>' + face(32, 33, 6, 0.9);
    },
    pencil: function () {
      return '<g transform="rotate(-40 32 32)"><rect x="25" y="5" width="14" height="37" rx="2.5" fill="' + YEL + '"/><rect x="25" y="5" width="14" height="8" rx="2.5" fill="' + CORAL + '"/>' +
        '<path d="M25 42 H39 L32 57Z" fill="' + PAPER + '"/><path d="M29.2 51 H34.8 L32 57Z" fill="' + INK + '" stroke-width="1.4"/>' + face(32, 27, 4.2, 0.8) + '</g>';
    },
    trophy: function () {
      return '<path d="M20 8 H44 V24 a12 12 0 0 1 -24 0 Z" fill="' + YEL + '"/><path d="M20 12 H11 q0 14 10 14 M44 12 H53 q0 14 -10 14" fill="none"/>' +
        '<rect x="28" y="36" width="8" height="9" fill="' + YEL + '"/><rect x="19" y="45" width="26" height="11" rx="3.5" fill="' + CORAL + '"/>' + face(32, 21, 6, 0.9);
    },
    rosette: function () {
      return '<path d="M22 36 L15 58 L26 52 L32 60 L32 40Z" fill="' + AQUA + '"/><path d="M42 36 L49 58 L38 52 L32 60 L32 40Z" fill="' + AQUA + '"/>' +
        '<circle cx="32" cy="24" r="18" fill="' + CORAL + '"/><circle cx="32" cy="24" r="10.5" fill="' + YEL + '"/><path d="M32 29 V19 M27 23.5 L32 18.5 L37 23.5" stroke-width="2.8"/>';
    },
    magnifier: function () {
      return '<rect x="36" y="38" width="9" height="22" rx="4" fill="' + CORAL + '" transform="rotate(-45 40.5 49)"/><circle cx="26" cy="26" r="17" fill="' + AQUA + '"/>' + face(26, 25, 6);
    },
    envelope: function () {
      return '<rect x="5" y="14" width="54" height="38" rx="7" fill="' + YEL + '"/><path d="M6 19 L32 37 L58 19"/>' +
        '<path d="M32 49 C23 43 22 35 28 35 C30.5 35 32 37.5 32 37.5 C32 37.5 33.5 35 36 35 C42 35 41 43 32 49Z" fill="' + CORAL + '" stroke-width="2.6"/>';
    },
    bell: function () {
      return '<path d="M32 8 C20 8 18 20 18 30 L11 42 H53 L46 30 C46 20 44 8 32 8Z" fill="' + YEL + '"/><circle cx="32" cy="51" r="5.5" fill="' + CORAL + '"/><circle cx="32" cy="7" r="3" fill="' + CORAL + '" stroke-width="2.4"/>' + face(32, 29, 6.5);
    },
    bars: function () {
      return '<rect x="7" y="38" width="15" height="20" rx="3.5" fill="' + CORAL + '"/><rect x="24.5" y="26" width="15" height="32" rx="3.5" fill="' + YEL + '"/><rect x="42" y="12" width="15" height="46" rx="3.5" fill="' + AQUA + '"/>' +
        '<path d="M4 59 H60"/><path d="M49.5 12 V4" stroke-width="2.6"/><path d="M49.5 4 L58 7 L49.5 10" fill="' + GRN + '" stroke-width="2.4"/>' + face(49.5, 30, 3.4, 0.75);
    },
    stairs: function () {
      return '<path d="M5 58 V46 H21 V34 H37 V22 H53 V58Z" fill="' + AQUA + '"/><path d="M45 22 V12"/>' +
        '<g class="sway"><path d="M45 17 C39 17 37 11 38 7 C44 7 46 11 45 17Z" fill="' + GRN + '" stroke-width="2.6"/><path d="M45 14 C51 14 54 9 53 5 C47 5 45 9 45 14Z" fill="' + GRN + '" stroke-width="2.6"/></g>' + face(29, 47, 5, 0.85);
    },
    note: function () {
      return '<rect x="10" y="7" width="44" height="50" rx="7" fill="' + PAPER + '"/><path d="M19 20 H45 M19 30 H45 M19 40 H35" stroke-width="2.6"/><circle cx="46" cy="46" r="8" fill="' + CORAL + '"/><path d="M42.5 46 H49.5 M46 42.5 V49.5" stroke-width="2.4"/>';
    }
  };
  A.ICON = ICON;

  function svgWrap(inner, vb, size, extra) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '" width="' + size + '" height="' + (extra && extra.h ? extra.h : size) + '" aria-hidden="true" focusable="false">' +
      '<g fill="none" stroke="' + INK + '" stroke-width="' + ((extra && extra.sw) || 3.4) + '" stroke-linecap="round" stroke-linejoin="round">' + inner + '</g></svg>';
  }

  // 一顆小圖示（span 裡面放 svg），可以放在按鈕、標題旁邊
  A.icon = function (name, size) {
    var f = ICON[name] || ICON.pencil, s = document.createElement('span');
    s.className = 'art-icon'; s.setAttribute('aria-hidden', 'true');
    s.innerHTML = svgWrap(f(), '0 0 64 64', size || 24);
    return s;
  };
  // 依科目名稱挑圖示
  A.subjectName = function (n) {
    n = String(n || '');
    if (/英/.test(n)) return 'abc';
    if (/數/.test(n)) return 'math';
    if (/自然|科學|生活科技/.test(n)) return 'sprout';
    if (/社|地理|歷史|公民/.test(n)) return 'globe';
    if (/國|語文|文$/.test(n)) return 'book';
    if (/健|體/.test(n)) return 'ball';
    if (/藝|美|音/.test(n)) return 'palette';
    if (/綜合|本土|閩|客|族語/.test(n)) return 'star';
    return 'pencil';
  };
  A.subject = function (n, size) { return A.icon(A.subjectName(n), size || 20); };

  // ---- 各頁面的主視覺（寬 220×高 100 的小插畫，圖示會輕輕飄動）
  var HEROES = {
    dashboard: { title: '全班的學習概況', desc: '看看大家這學期的整體表現，找出需要加油的地方。', items: [['bars', 128, 8, 1.35, 0], ['book', 52, 36, 0.8, 0.6]] },
    personal: { title: '一個人的學習小檔案', desc: '每一次測驗、每一個科目，慢慢累積成他的樣子。', items: [['pencil', 126, 4, 1.45, 0], ['star', 54, 40, 0.7, 0.8]] },
    progress: { title: '成長的足跡', desc: '從前幾學年走到現在，看看每一步是怎麼長高的。', items: [['stairs', 126, 6, 1.4, 0], ['sprout', 52, 34, 0.85, 0.7]] },
    report: { title: '給家長的小信', desc: '把孩子的學習狀況，整理成家長看得懂的一頁。', items: [['envelope', 124, 12, 1.3, 0], ['star', 56, 40, 0.65, 0.9]] },
    attention: { title: '需要多一點關心', desc: '提早發現需要陪伴的孩子，就能早一點幫上忙。', items: [['bell', 128, 6, 1.4, 0], ['magnifier', 50, 34, 0.8, 0.7]] },
    awards: { title: '閃閃發亮的獎狀', desc: '前幾名與進步獎，一次整理好。', items: [['trophy', 108, 4, 1.4, 0], ['rosette', 158, 22, 0.95, 0.6], ['star', 52, 44, 0.55, 1.1]] },
    missing: { title: '找找看，哪裡還沒登記', desc: '補登成績、註記原因，讓每一筆都有著落。', items: [['magnifier', 126, 6, 1.4, 0], ['note', 52, 36, 0.8, 0.8]] }
  };
  function cloud(x, y, s, d) {
    return '<g class="art-drift" style="animation-delay:' + d + 's" transform="translate(' + x + ' ' + y + ') scale(' + s + ')"><path d="M4 26 q-4 0 -4 -6 q0 -6 7 -6 q2 -7 11 -6 q8 -3 12 4 q8 0 8 7 q0 7 -8 7z" fill="' + AQUA + '" opacity="0.55" stroke="none"/></g>';
  }
  A.hero = function (page) {
    var H = HEROES[page]; if (!H) return null;
    var inner = '<circle cx="24" cy="22" r="9" fill="' + YEL + '"/><g class="art-spin">' +
      [0, 60, 120, 180, 240, 300].map(function (a) { return '<path d="M24 5 v4" transform="rotate(' + a + ' 24 22)" stroke-width="2.6"/>'; }).join('') + '</g>' +
      cloud(150, 6, 1, 0) + cloud(92, 70, 0.8, 1.6) +
      '<path d="M4 92 H216" stroke-width="3"/><path d="M12 92 q4 -6 8 0 M200 92 q4 -6 8 0" stroke-width="2.4" stroke="' + GRN + '"/>';
    H.items.forEach(function (it) {
      var f = ICON[it[0]];
      inner += '<g class="art-bob" style="animation-delay:' + it[4] + 's"><g transform="translate(' + it[1] + ' ' + it[2] + ') scale(' + it[3] + ')">' + f() + '</g></g>';
    });
    var box = document.createElement('div');
    box.className = 'hero noprint';
    var tx = document.createElement('div'); tx.className = 'hero-tx';
    var h = document.createElement('div'); h.className = 'hero-title'; h.textContent = H.title;
    var p = document.createElement('div'); p.className = 'hero-desc'; p.textContent = H.desc;
    tx.appendChild(h); tx.appendChild(p);
    var art = document.createElement('div'); art.className = 'hero-art';
    art.innerHTML = svgWrap(inner, '0 0 220 100', 220, { h: 100, sw: 3 });
    box.appendChild(tx); box.appendChild(art);
    return box;
  };

  // 空白畫面用的小插畫（放進 CSS 變數，供 .empty::before 當背景）
  A.emptyUrl = function () {
    var inner = '<g transform="translate(14 4) scale(0.8)">' + ICON.book() + '</g><g transform="translate(60 22) scale(0.45)">' + ICON.star() + '</g>';
    return 'url("data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 64"><g fill="none" stroke="' + INK + '" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round">' + inner + '</g></svg>') + '")';
  };
  A.installTheme = function () {
    try { document.documentElement.style.setProperty('--art-empty', A.emptyUrl()); } catch (e) { /* 忽略 */ }
  };
  A.installTheme();
})(typeof window !== 'undefined' ? window : globalThis);
