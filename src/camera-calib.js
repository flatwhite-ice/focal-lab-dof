/* Focal Lab · 렌즈 실측 캘리브레이션 (window.CamCalib).
   convert.js(Convert) 의존. camera.html의 #cam-calib 마크업을 3단계 상태머신으로 구동.

   원리: 폭 t(mm)를 아는 목표물을 거리 d(mm)에 두고, 가이드 박스 좌우 변을 목표물
   양 끝에 맞추면 박스가 영상 프레임 폭에서 차지하는 비율 frac으로 카메라의 실제
   수평 화각이 풀린다: tan(cam/2) = tan(θ/2)/frac (Convert.fovFromTarget).
   결과는 줌 1 기준 '장변' 화각(fovLong)으로 정규화해 onSave(entry)로 반환 —
   스트림·영속화 소유권은 camera.js에 있다. */
(function () {
  "use strict";

  var C = window.Convert;
  var $ = function (id) { return document.getElementById(id); };
  var RAD = Math.PI / 180;

  var root = $("cam-calib"), stage = $("cam-stage");
  var canvas = $("calib-canvas"), ctx = canvas ? canvas.getContext("2d") : null;
  var steps = [$("calib-step0"), $("calib-step1"), $("calib-step2")];
  var lensEl = $("calib-lens");
  var targetSel = $("calib-target"), targetMmIn = $("calib-target-mm");
  var distIn = $("calib-dist"), distHint = $("calib-dist-hint");
  var fovOut = $("calib-fov"), fracRange = $("calib-frac-range");
  var minusBtn = $("calib-minus"), plusBtn = $("calib-plus");
  var zoomWarn = $("calib-zoom-warn");
  var resultEl = $("calib-result"), embedEl = $("calib-embed");

  var cb = null;        // open(api)에서 받은 camera.js 콜백 묶음
  var step = -1;
  var snap = null;      // 정렬 시작 시점 스트림 스냅샷 (줌/해상도 변경 감지 기준)
  var frac = 0.4;       // 가이드 박스 폭 / 영상 프레임 폭
  var rafId = null;
  var measured = null;  // 확인 단계 결과

  // camera.js의 lensType과 동일 규칙 (IIFE 분리로 소형 중복 허용)
  function lensType(s) {
    s = (s || "").toLowerCase();
    if (/ultra|초광각/.test(s)) return "ultra";
    if (/tele|망원/.test(s)) return "tele";
    if (/front|user|전면/.test(s)) return "front";
    return "wide";
  }

  function num(el) { var v = parseFloat(el.value); return isFinite(v) && v > 0 ? v : 0; }
  function targetWidthMm() { return num(targetMmIn); }
  function distMm() { return num(distIn) * 10; }
  function clampFrac(v) { return Math.min(1, Math.max(0.05, v)); }

  /* ---------- 캔버스 (camera.js measure 패턴) ---------- */
  var cssW = 0, cssH = 0;
  function measure() {
    if (!canvas) return;
    var rc = canvas.getBoundingClientRect();
    cssW = rc.width; cssH = rc.height;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ---------- 단계 전환 ---------- */
  function setStep(n) {
    step = n;
    for (var i = 0; i < steps.length; i++) steps[i].hidden = (i !== n);
    if (n === 1) { measure(); startLoop(); }
    else { stopLoop(); if (ctx) ctx.clearRect(0, 0, cssW, cssH); }
  }

  function open(api) {
    if (!root || !ctx) return;
    cb = api;
    var si = cb.getStreamInfo();
    lensEl.textContent = "현재 렌즈: " + (si.label || "이름 없는 카메라");
    zoomWarn.hidden = true;
    updateDistHint();
    root.hidden = false;
    // 본 오버레이(마스크/박스)와 하단 패널 숨김 → 정렬 방해 제거 (camera.css)
    stage.classList.add("is-calibrating");
    document.body.classList.add("is-calibrating");
    setStep(0);
  }
  function close() {
    stopLoop();
    root.hidden = true;
    stage.classList.remove("is-calibrating");
    document.body.classList.remove("is-calibrating");
    cb = null; snap = null; measured = null;
  }

  /* ---------- 준비: 권장 거리 ----------
     목표물이 프레임 폭의 ~40%를 차지하도록: D = t / (2·0.4·tan(h/2)) */
  function updateDistHint() {
    if (!cb) return;
    var t = targetWidthMm();
    var h = cb.getCamFov().h;   // 현재 해석된 수평 화각(추정 포함)
    if (!t || !h) { distHint.textContent = ""; return; }
    var d = t / (2 * 0.4 * Math.tan(h / 2 * RAD));
    var ultra = lensType(cb.getStreamInfo().label) === "ultra";
    distHint.textContent = "권장 거리: 약 " + Math.round(d / 10) + "cm (화면 폭의 ~40% 채움)" +
      (ultra ? " — 초광각은 문 폭 등 큰 목표물을 직접 입력하면 더 정확합니다." : "");
  }

  /* ---------- 정렬: 가이드 렌더 루프 ---------- */
  function startLoop() {
    stopLoop();
    var tick = function () {
      rafId = requestAnimationFrame(tick);
      drawGuide();
    };
    rafId = requestAnimationFrame(tick);
  }
  function stopLoop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function guardStream() {
    var si = cb.getStreamInfo();
    var bad = !snap || si.zoom !== snap.zoom || si.w !== snap.w || si.h !== snap.h;
    zoomWarn.hidden = !bad;
    return !bad;
  }

  function drawGuide() {
    if (!cb) return;
    measure();
    ctx.clearRect(0, 0, cssW, cssH);
    guardStream();

    var rect = cb.getVideoRect();
    var w = frac * rect.w;
    var cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    var x1 = cx - w / 2, x2 = cx + w / 2;
    var accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#2b6cff";

    ctx.save();
    // 가이드 박스 좌우 변: 풀하이트 수직선 (목표물 끝선 맞추기 용이)
    ctx.strokeStyle = accent; ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(0,0,0,.7)"; ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(x1, rect.y); ctx.lineTo(x1, rect.y + rect.h);
    ctx.moveTo(x2, rect.y); ctx.lineTo(x2, rect.y + rect.h);
    ctx.stroke();
    // 중앙 가로 밴드(얇게) + 십자선
    ctx.setLineDash([6, 6]); ctx.lineWidth = 1; ctx.strokeStyle = "rgba(255,255,255,.8)";
    ctx.beginPath();
    ctx.moveTo(x1, cy); ctx.lineTo(x2, cy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(255,255,255,.9)";
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy);
    ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10);
    ctx.stroke();
    ctx.restore();

    var t = targetWidthMm(), d = distMm();
    fovOut.textContent = (t && d)
      ? "측정 수평 화각: " + C.fovFromTarget(t, d, frac).toFixed(1) + "°"
      : "목표물 폭·거리를 입력하세요";
  }

  /* ---------- 확인: 장변·줌 1 정규화 ---------- */
  function computeMeasured() {
    var t = targetWidthMm(), d = distMm();
    var rect = cb.getVideoRect();
    var landscape = rect.vw >= rect.vh;
    var aspect = Math.max(rect.vw, rect.vh) / Math.min(rect.vw, rect.vh);
    var hMeas = C.fovFromTarget(t, d, frac);                    // 현재 수평(표시 기준)
    // 세로 표시면 수평 = 단변 → 장변으로 환산: tan(long/2) = tan(short/2)·aspect
    var longMeas = landscape ? hMeas : C.zoomFov(hMeas, 1 / aspect);
    var z = (snap && isFinite(snap.zoom) && snap.zoom) ? snap.zoom : 1;
    var fovLong = C.zoomFov(longMeas, 1 / z);                   // 줌 1 기준으로 역적용
    return {
      fovLong: +fovLong.toFixed(2),
      longMeas: longMeas, aspect: aspect, zoom: z,
      vw: rect.vw, vh: rect.vh, t: t, d: d
    };
  }

  function aspectBucket(a) {
    if (Math.abs(a - 16 / 9) <= 0.02) return "16:9";
    if (Math.abs(a - 4 / 3) <= 0.02) return "4:3";
    return a.toFixed(3);
  }

  function buildEntry(m) {
    var si = snap || cb.getStreamInfo();
    return {
      deviceId: si.deviceId || null,
      label: si.label || "",
      lens: lensType(si.label),
      fovLong: m.fovLong,
      aspect: +m.aspect.toFixed(4),
      w: si.w || m.vw, h: si.h || m.vh, zoom: m.zoom,
      target: { mm: m.t, distMm: m.d },
      ts: Date.now()
    };
  }

  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; });
  }

  function renderResult() {
    measured = computeMeasured();
    var entry = buildEntry(measured);
    // 비교 대상: 현재 해석값(저장 전이므로 calib 미반영 = 추정/테이블)의 장변
    var cur = cb.getCamFov();
    var curLong = Math.max(cur.h, cur.v);
    var diffPct = (Math.tan(measured.longMeas / 2 * RAD) / Math.tan(curLong / 2 * RAD) - 1) * 100;
    resultEl.innerHTML =
      '<p><b>장변 ' + measured.fovLong.toFixed(1) + '°</b> (줌 1 기준)</p>' +
      '<p>기존 ' + (cur.src === "derived" ? "추정" : "테이블") + '값 ' + curLong.toFixed(1) + '° → 차이 ' +
      (diffPct >= 0 ? "+" : "") + diffPct.toFixed(1) + '% (tan 기준)</p>' +
      '<p class="hint">' + esc(entry.label || "이름 없는 카메라") + ' · ' + entry.w + '×' + entry.h +
      ' · zoom ' + entry.zoom + ' · 목표물 ' + measured.t + 'mm @ ' + (measured.d / 10) + 'cm</p>';
    var iso = new Date().toISOString().slice(0, 10);
    var embed = '{ model: "' + (cb.getModel() || "내 기기") + '", lens: "' + entry.lens +
      '", aspect: "' + aspectBucket(measured.aspect) + '", fovLong: ' + measured.fovLong.toFixed(1) +
      ', note: "실측 ' + iso + '" },';
    embedEl.textContent = embed;
    try { console.log("[focal-lab] VIDEO_FOV entry:", embed); } catch (e) {}
    return entry;
  }

  /* ---------- 이벤트 ---------- */
  targetSel.addEventListener("change", function () {
    if (targetSel.value === "custom") { targetMmIn.focus(); targetMmIn.select(); }
    else targetMmIn.value = targetSel.value;
    updateDistHint();
  });
  targetMmIn.addEventListener("input", updateDistHint);
  distIn.addEventListener("input", updateDistHint);

  fracRange.addEventListener("input", function () {
    frac = clampFrac(parseFloat(fracRange.value) || 0.4);
  });
  minusBtn.addEventListener("click", function () {
    frac = clampFrac(frac - 0.002); fracRange.value = String(frac);
  });
  plusBtn.addEventListener("click", function () {
    frac = clampFrac(frac + 0.002); fracRange.value = String(frac);
  });

  $("calib-next").addEventListener("click", function () {
    if (!targetWidthMm() || !distMm()) {
      distHint.textContent = "목표물 폭과 거리를 올바르게 입력하세요.";
      return;
    }
    snap = cb.getStreamInfo();           // 줌/해상도 변경 감지 기준 고정
    zoomWarn.hidden = true;
    setStep(1);
  });
  $("calib-back1").addEventListener("click", function () { setStep(0); });
  $("calib-cancel0").addEventListener("click", close);
  $("calib-cancel2").addEventListener("click", close);

  $("calib-done").addEventListener("click", function () {
    if (!guardStream()) return;          // 줌이 바뀐 채로는 확정 불가
    renderResult();
    setStep(2);
  });
  $("calib-retry").addEventListener("click", function () {
    snap = cb.getStreamInfo();
    setStep(1);
  });

  $("calib-copy").addEventListener("click", function () {
    var text = embedEl.textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () {});
    } else {
      var ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta);
      ta.select(); try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
    }
  });

  $("calib-save").addEventListener("click", function () {
    if (!measured) return;
    cb.onSave(buildEntry(measured));
    close();
  });

  window.addEventListener("resize", function () { if (step === 1) measure(); });

  window.CamCalib = { open: open };
})();
