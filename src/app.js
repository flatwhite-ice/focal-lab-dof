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

  // 시각화 진입 애니메이션 상태: 현재 표시 중인 {scale, a:[6 각도]} 와 진행 중 rAF
  var lastFmtId = null, vizCur = null, vizRAF = null;

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

  /* ---------- 통합 시각화: 프레임(상단) + 화각 부채꼴(하단) ----------
     drawViz: 목표값을 계산해 진입 애니메이션(rAF 보간)을 구동.
     renderViz: 주어진 그룹 scale(사각형 확대용)·각도 배열 a[6]로 한 프레임을 그림(순수). */

  // a = [aDiag, aLong, aShort, ffADiag, ffALong, ffAShort] (도). gscale = 환산 포맷 사각형 그룹 확대(0~1).
  function renderViz(f, gscale, a) {
    var W = 360;
    var ff = C.FF;
    var fmtLong = Math.max(f.w, f.h), fmtShort = Math.min(f.w, f.h);
    var ffLong = Math.max(ff.w, ff.h), ffShort = Math.min(ff.w, ff.h);
    var crop = C.cropFactor(f), diag = C.diag(f);

    function esc(s) { return escapeXml(s); }
    function n(v) { return v.toFixed(1); }

    /* ===== 상단: 프레임 + 치수 + 대각선 + 크롭 ===== */
    var topCx = 180, topCy = 95;
    var maxHalfW = Math.max(fmtLong, ffLong) / 2, maxHalfH = Math.max(fmtShort, ffShort) / 2;
    var pxScale = Math.min((W / 2 - 56) / maxHalfW, (75) / maxHalfH);
    var fw = fmtLong * pxScale, fh = fmtShort * pxScale;   // 포맷 사각형 px
    var ffw = ffLong * pxScale, ffh = ffShort * pxScale;   // FF 사각형 px
    var fx = topCx - fw / 2, fy = topCy - fh / 2;

    function rect(w, h, cls) {
      return '<rect class="' + cls + '" x="' + n(topCx - w / 2) + '" y="' + n(topCy - h / 2) +
        '" width="' + n(w) + '" height="' + n(h) + '" rx="2"/>';
    }
    // 환산 포맷 사각형 그룹 — 중심(소실점)에서 gscale로 확대 + 페이드 (포맷 변경 시 등장)
    var grpAttr = gscale >= 0.999 ? "" :
      ' transform="translate(' + topCx + ' ' + topCy + ') scale(' + gscale.toFixed(3) +
      ') translate(' + (-topCx) + ' ' + (-topCy) + ')" opacity="' + Math.max(0, gscale).toFixed(3) + '"';
    var fmtGroup =
      '<g' + grpAttr + '>' +
        rect(fw, fh, "v-frame-fmt") +
        '<line class="v-diag" x1="' + n(fx) + '" y1="' + n(fy) + '" x2="' + n(fx + fw) + '" y2="' + n(fy + fh) + '"/>' +
        '<text class="v-dim" x="' + topCx + '" y="' + n(fy - 8) + '" text-anchor="middle">' + esc(fmtLong + " mm") + '</text>' +
        '<text class="v-dim" x="' + n(fx + fw + 8) + '" y="' + n(topCy) + '" dominant-baseline="middle">' + esc(fmtShort + " mm") + '</text>' +
        '<text class="v-diag-lbl" x="' + n(topCx + 6) + '" y="' + n(topCy - 4) + '">' + esc("대각 " + n(diag) + "mm") + '</text>' +
        '<text class="v-name" x="' + topCx + '" y="184" text-anchor="middle">' + esc(f.name) + '</text>' +
      '</g>';
    var top =
      rect(ffw, ffh, "v-frame-ff") +                       // 풀프레임 기준틀 (고정)
      fmtGroup +
      // 크롭 배지 / 범례 (고정)
      '<text class="v-badge" x="14" y="22">' + esc("크롭 ×" + crop.toFixed(crop < 1 ? 3 : 2)) + '</text>' +
      '<text class="v-cap-fmt" x="346" y="20" text-anchor="end">▰ 환산 포맷</text>' +
      '<text class="v-cap" x="346" y="38" text-anchor="end">▱ 풀프레임</text>';

    /* ===== 하단: 화각 부채꼴 2개 (좌=풀프레임 / 우=환산 포맷) — 넓은 쪽이 위(북) ===== */
    var apexY = 300;                                        // 두 부채꼴 공통 꼭지점 Y (아래, 위로 열림)
    var R_DIAG = 80, R_LONG = 62, R_SHORT = 44;             // 중첩 반지름 (두 부채꼴 공유 → 직접 비교)
    // 수직 상향축 기준 ±θ/2 로 벌어진 부채꼴 (위로 열림)
    function ray(cx, theta, r) {
      var h = theta * Math.PI / 360;                         // θ/2 in rad
      return { lx: cx - r * Math.sin(h), rx: cx + r * Math.sin(h), y: apexY - r * Math.cos(h) };
    }
    function wedge(cx, theta, r, cls) {
      if (theta < 0.05) return "";                           // 0°(펼침 시작)에서는 부채꼴 생략
      var p = ray(cx, theta, r), big = theta > 180 ? 1 : 0;
      return '<path class="' + cls + '" d="M' + n(cx) + ' ' + n(apexY) + ' L' + n(p.lx) + ' ' + n(p.y) +
        ' A' + n(r) + ' ' + n(r) + ' 0 ' + big + ' 1 ' + n(p.rx) + ' ' + n(p.y) + ' Z"/>';
    }
    // 한 꼭지점에 대각/장변/단변 부채꼴 + 축 + 꼭지점 점
    // base: "v-fan"(환산 포맷, accent) | "v-fan-ff"(풀프레임, 회색 점선). stroke=base, fill=base-N
    function fan(cx, aD, aL, aS, base) {
      return '<line class="v-axis" x1="' + cx + '" y1="' + apexY + '" x2="' + cx + '" y2="' + n(apexY - R_DIAG) + '"/>' +
        wedge(cx, aD, R_DIAG, base + " " + base + "-3") +
        wedge(cx, aL, R_LONG, base + " " + base + "-2") +
        wedge(cx, aS, R_SHORT, base + " " + base + "-1") +
        '<circle class="' + (base === "v-fan" ? "v-apex" : "v-apex-ff") + '" cx="' + cx + '" cy="' + apexY + '" r="3.5"/>';
    }
    // 꼭지점(아래) 아래쪽 라벨 묶음 (제목 + 대각/장변/단변)
    function fanLabels(cx, title, titleCls, aD, aL, aS, angCls) {
      return '<text class="' + titleCls + '" x="' + cx + '" y="318" text-anchor="middle">' + esc(title) + '</text>' +
        '<text class="v-ang ' + angCls + '" x="' + cx + '" y="336" text-anchor="middle">' + esc("대각 " + n(aD) + "°") + '</text>' +
        '<text class="v-ang ' + angCls + '" x="' + cx + '" y="354" text-anchor="middle">' + esc("장변 " + n(aL) + "°") + '</text>' +
        '<text class="v-ang ' + angCls + '" x="' + cx + '" y="372" text-anchor="middle">' + esc("단변 " + n(aS) + "°") + '</text>';
    }
    var fmtCx = 264, ffCx = 96;
    var bottom =
      '<text class="v-sub" x="14" y="212">화각 (시야각)</text>' +
      fan(fmtCx, a[0], a[1], a[2], "v-fan") +
      fan(ffCx, a[3], a[4], a[5], "v-fan-ff") +
      fanLabels(fmtCx, "환산 포맷", "v-fan-title-fmt", a[0], a[1], a[2], "v-ang-2") +
      fanLabels(ffCx, "풀프레임", "v-fan-title-ff", a[3], a[4], a[5], "v-ang-ff");

    $("viz").innerHTML = top + bottom;
  }

  function drawViz(f, focal) {
    var ff = C.FF, diag = C.diag(f), ffDiag = C.diag(ff);
    var L = Math.max(f.w, f.h), S = Math.min(f.w, f.h);
    var fL = Math.max(ff.w, ff.h), fS = Math.min(ff.w, ff.h);
    // 풀프레임 화각은 같은 물리 초점거리 기준(환산 초점 아님) → 크롭에 따른 화각 차이가 드러남
    var target = [C.aov(diag, focal), C.aov(L, focal), C.aov(S, focal),
                  C.aov(ffDiag, focal), C.aov(fL, focal), C.aov(fS, focal)];
    var fmtChanged = f.id !== lastFmtId; lastFmtId = f.id;

    if (REDUCED) { vizCur = { scale: 1, a: target }; renderViz(f, 1, target); return; }

    // 포맷 변경/최초 → 0에서 등장. 값 변경 → 현재 표시값에서 이어서 보간(깜빡임 방지)
    var from = (vizCur && !fmtChanged) ? vizCur : { scale: 0, a: [0, 0, 0, 0, 0, 0] };
    // 변화 없음(조리개·거리 변경 등)이면 1회만 그리고 종료 — 불필요한 rAF 루프 방지
    if (!fmtChanged && from.scale === 1 &&
        target.every(function (v, i) { return Math.abs(v - from.a[i]) < 0.05; })) {
      vizCur = { scale: 1, a: target }; renderViz(f, 1, target); return;
    }
    if (vizRAF) cancelAnimationFrame(vizRAF);
    var t0 = performance.now(), DUR = 360;                  // 빠르고 부드럽게
    (function frame(now) {
      var p = Math.min(1, (now - t0) / DUR), e = 1 - Math.pow(1 - p, 3);   // easeOutCubic
      vizCur = {
        scale: from.scale + (1 - from.scale) * e,
        a: target.map(function (v, i) { return from.a[i] + (v - from.a[i]) * e; })
      };
      renderViz(f, vizCur.scale, vizCur.a);
      vizRAF = p < 1 ? requestAnimationFrame(frame) : null;
    })(performance.now());
  }

  function escapeXml(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
    });
  }

  // 초기 렌더
  onFormatChange();
})();
