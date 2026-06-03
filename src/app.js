/* Focal Lab · UI 와이어링. convert.js(Convert), formats.js(FORMATS/FORMAT_NOTES) 의존. */
(function () {
  "use strict";

  var C = window.Convert;
  var STOPS = [1.0, 1.4, 2.0, 2.8, 4.0, 5.6, 8, 11, 16, 22, 32, 45, 64];

  var $ = function (id) { return document.getElementById(id); };
  var fmtSel = $("format");

  // id → format 빠른 조회
  var INDEX = {};
  window.FORMATS.forEach(function (g) {
    g.items.forEach(function (f) { INDEX[f.id] = f; });
  });

  /* ---------- 셀렉트 구성 ---------- */
  window.FORMATS.forEach(function (g) {
    var og = document.createElement("optgroup");
    og.label = g.group;
    g.items.forEach(function (f) {
      var o = document.createElement("option");
      o.value = f.id;
      o.textContent = f.name;
      og.appendChild(o);
    });
    fmtSel.appendChild(og);
  });
  fmtSel.value = "6x6"; // 기본: 6×6 중형

  /* ---------- 데이터 주석 ---------- */
  var nl = $("notes-list");
  (window.FORMAT_NOTES || []).forEach(function (t) {
    var li = document.createElement("li"); li.textContent = t; nl.appendChild(li);
  });

  /* ---------- 입력 동기화 ---------- */
  function nearestStopIndex(f) {
    var best = 0, bestD = Infinity;
    STOPS.forEach(function (s, i) {
      var d = Math.abs(Math.log(s) - Math.log(f));
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  // 숫자 ↔ 슬라이더 양방향 연결
  function link(numId, rangeId, onChange, fromRange, toRange) {
    var num = $(numId), rng = $(rangeId);
    num.addEventListener("input", function () {
      if (toRange) rng.value = toRange(parseFloat(num.value));
      onChange();
    });
    rng.addEventListener("input", function () {
      num.value = fromRange ? fromRange(parseFloat(rng.value)) : rng.value;
      onChange();
    });
  }

  link("focal", "focal-range", update,
    function (v) { return v; },                       // range→num (mm 그대로)
    function (v) { return Math.min(600, Math.max(1, v)); });

  link("fnumber", "fnumber-range", update,
    function (i) { return STOPS[i]; },                 // range(index)→num(f값)
    function (f) { return nearestStopIndex(f); });

  link("distance", "distance-range", update,
    function (v) { return v; },
    function (v) { return Math.min(50, Math.max(0.1, v)); });

  // 포커스 시 캐럿을 값 끝으로 — 모바일에서 뒤에서부터 지우며 수정하기 편하게.
  // (탭의 기본 캐럿 배치 뒤에 실행되도록 rAF로 지연)
  ["focal", "fnumber", "distance"].forEach(function (id) {
    var el = $(id);
    el.addEventListener("focus", function () {
      requestAnimationFrame(function () {
        var n = el.value.length;
        try { el.setSelectionRange(n, n); } catch (e) {}
      });
    });
  });

  $("advanced").addEventListener("toggle", update);
  fmtSel.addEventListener("change", onFormatChange);

  // 모바일 하단 시트 접기/펼치기
  var sheet = $("inputs"), handle = $("sheet-handle");
  if (handle && sheet) {
    handle.addEventListener("click", function () {
      var collapsed = sheet.classList.toggle("sheet-collapsed");
      handle.setAttribute("aria-expanded", String(!collapsed));
    });

    // 모바일: 결과를 아래로 스크롤하면 시트 자동 접힘(펼침은 핸들 탭으로만)
    var mq = window.matchMedia("(max-width: 760px)");
    var lastY = window.scrollY;
    // 시트 입력칸 편집 중(키보드 표시 등)에는 자동 접힘 금지 — 키보드 표시가
    // 일으키는 스크롤 이벤트로 시트가 오동작 최소화되는 버그 방지.
    var editing = false;
    sheet.addEventListener("focusin", function () { editing = true; });
    sheet.addEventListener("focusout", function () { editing = false; lastY = window.scrollY; });
    window.addEventListener("scroll", function () {
      var y = window.scrollY;
      if (!editing && mq.matches && y > lastY + 4 && y > 40 && !sheet.classList.contains("sheet-collapsed")) {
        sheet.classList.add("sheet-collapsed");
        handle.setAttribute("aria-expanded", "false");
      }
      lastY = y;
    }, { passive: true });
  }

  function onFormatChange() {
    var f = INDEX[fmtSel.value];
    // 폰 등 네이티브 렌즈값이 있으면 프리필
    if (f.focal != null) {
      $("focal").value = f.focal;
      $("focal-range").value = Math.min(600, Math.max(1, f.focal));
    }
    if (f.fnumber != null) {
      $("fnumber").value = f.fnumber;
      $("fnumber-range").value = nearestStopIndex(f.fnumber);
    }
    $("format-note").textContent = f.note ? (f.est ? "추정 · " : "") + f.note : "";
    update();
  }

  /* ---------- 계산 & 렌더 ---------- */
  function fmtNum(x, d) {
    if (!isFinite(x)) return "∞";
    return x.toLocaleString("ko-KR", { maximumFractionDigits: d, minimumFractionDigits: 0 });
  }
  function fmtDist(m) {
    if (!isFinite(m)) return "∞";
    if (m >= 100) return fmtNum(m, 0) + " m";
    if (m >= 10) return fmtNum(m, 1) + " m";
    if (m >= 1) return fmtNum(m, 2) + " m";
    return fmtNum(m * 100, 1) + " cm";
  }

  /* ---------- 결과 카운트업 + 강조 펄스 ---------- */
  var REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function pulse(el) {
    if (REDUCED) return;
    var item = el.closest(".result-hero__item");
    el.classList.remove("is-bump"); if (item) item.classList.remove("is-bump");
    void el.offsetWidth; // 애니메이션 재시작용 reflow
    el.classList.add("is-bump"); if (item) item.classList.add("is-bump");
  }

  // 이전값에서 새 값으로 숫자를 보간하며 렌더. render(v) → innerHTML 문자열.
  function setStat(el, to, render) {
    var hadPrev = el.dataset.num !== undefined && el.dataset.num !== "";
    var from = hadPrev ? parseFloat(el.dataset.num) : to;
    el.dataset.num = to;
    if (!hadPrev || from === to || REDUCED) {
      el.innerHTML = render(to);
      if (hadPrev && from !== to) pulse(el);
      return;
    }
    pulse(el);
    var start = performance.now(), dur = 380;
    function frame(now) {
      var p = Math.min(1, (now - start) / dur);
      var e = 1 - Math.pow(1 - p, 3); // easeOutCubic
      el.innerHTML = render(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(frame);
      else el.innerHTML = render(to);
    }
    requestAnimationFrame(frame);
  }

  function update() {
    var f = INDEX[fmtSel.value];
    var focal = parseFloat($("focal").value);
    var N = parseFloat($("fnumber").value);
    if (!(focal > 0) || !(N > 0)) return;

    var crop = C.cropFactor(f);
    var ef = C.equivFocal(focal, f);
    var eN = C.equivAperture(N, f);

    setStat($("r-focal"), ef, function (v) { return fmtNum(v, 1) + "<small> mm</small>"; });
    $("r-focal-sub").textContent = (f.ref ? "기준 포맷" : focal + "mm × " + crop.toFixed(3) + " 크롭");
    setStat($("r-aperture"), eN, function (v) { return "f/" + fmtNum(v, 1); });
    $("r-aperture-sub").textContent = "심도·배경흐림이 FF 환산값과 동일";

    $("est-flag").innerHTML = f.est ? '<span class="badge-est">추정 데이터</span>' : "";

    // 실제 심도 (고급 펼침 시)
    var adv = $("advanced").open;
    var dofPanel = $("dof-panel");
    dofPanel.hidden = !adv;
    if (adv) {
      var dist = parseFloat($("distance").value);
      var d = C.dof(focal, N, dist, f);
      $("dof-dist").textContent = fmtDist(dist);
      $("r-hyper").textContent = fmtDist(d.hyperfocal);
      $("r-near").textContent = fmtDist(d.near);
      $("r-far").textContent = fmtDist(d.far);
      $("r-depth").textContent = isFinite(d.total) ? fmtDist(d.total) : "∞ (과초점 이상)";
      $("r-coc").textContent = d.coc.toFixed(3) + " mm";
      $("coc-hint").textContent = "착란원 " + d.coc.toFixed(3) + " mm";
    }

    // 모바일 시트 핸들 요약 (접힘 상태에서도 현재 입력값 확인)
    var sum = $("sheet-summary");
    if (sum) sum.textContent = f.name + " · " + fmtNum(focal, 1) + "mm · f/" + fmtNum(N, 1);

    drawViz(f, focal);
  }

  /* ---------- 통합 시각화: 프레임(상단) + 화각 부채꼴(하단) ---------- */
  function drawViz(f, focal) {
    var W = 360;
    var ff = C.FF;
    var fmtLong = Math.max(f.w, f.h), fmtShort = Math.min(f.w, f.h);
    var ffLong = Math.max(ff.w, ff.h), ffShort = Math.min(ff.w, ff.h);
    var crop = C.cropFactor(f), diag = C.diag(f);
    var aLong = C.aov(fmtLong, focal), aShort = C.aov(fmtShort, focal), aDiag = C.aov(diag, focal);

    function esc(s) { return escapeXml(s); }
    function n(v) { return v.toFixed(1); }

    /* ===== 상단: 프레임 + 치수 + 대각선 + 크롭 ===== */
    var topCx = 180, topCy = 95;
    var maxHalfW = Math.max(fmtLong, ffLong) / 2, maxHalfH = Math.max(fmtShort, ffShort) / 2;
    var scale = Math.min((W / 2 - 56) / maxHalfW, (75) / maxHalfH);
    var fw = fmtLong * scale, fh = fmtShort * scale;       // 포맷 사각형 px
    var ffw = ffLong * scale, ffh = ffShort * scale;       // FF 사각형 px
    var fx = topCx - fw / 2, fy = topCy - fh / 2;

    function rect(w, h, cls) {
      return '<rect class="' + cls + '" x="' + n(topCx - w / 2) + '" y="' + n(topCy - h / 2) +
        '" width="' + n(w) + '" height="' + n(h) + '" rx="2"/>';
    }
    var top =
      rect(fw, fh, "v-frame-fmt") +
      rect(ffw, ffh, "v-frame-ff") +
      // 대각선
      '<line class="v-diag" x1="' + n(fx) + '" y1="' + n(fy) + '" x2="' + n(fx + fw) + '" y2="' + n(fy + fh) + '"/>' +
      // 치수: 장변(위) · 단변(오른쪽)
      '<text class="v-dim" x="' + topCx + '" y="' + n(fy - 8) + '" text-anchor="middle">' + esc(fmtLong + " mm") + '</text>' +
      '<text class="v-dim" x="' + n(fx + fw + 8) + '" y="' + n(topCy) + '" dominant-baseline="middle">' + esc(fmtShort) + '</text>' +
      // 대각 mm (대각선 중앙 위)
      '<text class="v-diag-lbl" x="' + n(topCx + 6) + '" y="' + n(topCy - 4) + '">' + esc("대각 " + n(diag) + "mm") + '</text>' +
      // 크롭 배지(좌상단)
      '<text class="v-badge" x="14" y="22">' + esc("크롭 ×" + crop.toFixed(crop < 1 ? 3 : 2)) + '</text>' +
      // 포맷명 / FF 캡션
      '<text class="v-name" x="' + topCx + '" y="184" text-anchor="middle">' + esc(f.name) + '</text>' +
      '<text class="v-cap" x="346" y="22" text-anchor="end">▱ 풀프레임</text>';

    /* ===== 하단: 화각 부채꼴 ===== */
    var ax = 180, ay = 338;                                 // 꼭지점
    function ray(theta, r) {                                 // 수직축 기준 ±θ/2
      var h = theta * Math.PI / 360;                         // θ/2 in rad
      return { lx: ax - r * Math.sin(h), ly: ay - r * Math.cos(h),
               rx: ax + r * Math.sin(h), ry: ay - r * Math.cos(h) };
    }
    function wedge(theta, r, cls) {
      var p = ray(theta, r);
      var big = theta > 180 ? 1 : 0;
      return '<path class="' + cls + '" d="M' + n(ax) + ' ' + n(ay) + ' L' + n(p.lx) + ' ' + n(p.ly) +
        ' A' + n(r) + ' ' + n(r) + ' 0 ' + big + ' 1 ' + n(p.rx) + ' ' + n(p.ry) + ' Z"/>';
    }
    // 라벨은 각 링(부채꼴 띠) 중앙에 세로로 쌓아 겹치지 않게
    function ringLabel(y, text, cls) {
      return '<text class="v-ang ' + cls + '" x="' + ax + '" y="' + y + '" text-anchor="middle">' + esc(text) + '</text>';
    }
    var bottom =
      '<line class="v-axis" x1="' + ax + '" y1="' + ay + '" x2="' + ax + '" y2="216"/>' +
      wedge(aDiag, 120, "v-fan v-fan-3") +
      wedge(aLong, 96, "v-fan v-fan-2") +
      wedge(aShort, 72, "v-fan v-fan-1") +
      '<circle class="v-apex" cx="' + ax + '" cy="' + ay + '" r="3.5"/>' +
      ringLabel(232, "대각 " + n(aDiag) + "°", "v-ang-3") +
      ringLabel(259, "장변 " + n(aLong) + "°", "v-ang-2") +
      ringLabel(286, "단변 " + n(aShort) + "°", "v-ang-1") +
      '<text class="v-sub" x="14" y="210">화각 (시야각)</text>';

    $("viz").innerHTML = top + bottom;
  }

  function escapeXml(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
    });
  }

  // 초기 렌더
  onFormatChange();
})();
