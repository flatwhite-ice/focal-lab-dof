/* Focal Lab · 카메라 화각 오버레이 와이어링.
   convert.js(Convert), formats.js(FORMATS) 의존. 라이브뷰 위에 환산 포맷 / 풀프레임
   프레이밍 가이드를 canvas로 그린다. 각도는 전부 Convert.aov 등 순수 엔진으로 계산. */
(function () {
  "use strict";

  var C = window.Convert;
  var $ = function (id) { return document.getElementById(id); };
  var RAD = Math.PI / 180;

  var fmtSel = $("cam-format");
  var focalRange = $("cam-focal"), focalVal = $("cam-focal-val");
  var calRange = $("cam-cal"), calVal = $("cam-cal-val");
  var video = $("cam-video"), canvas = $("cam-canvas"), ctx = canvas.getContext("2d");
  var readout = $("cam-readout"), warnEl = $("cam-warn");
  var msg = $("cam-msg"), msgText = $("cam-msg-text"), startBtn = $("cam-start");

  /* ---------- 포맷 인덱스 + 셀렉트 (app.js 패턴 재사용) ---------- */
  var INDEX = {};
  window.FORMATS.forEach(function (g) {
    var og = document.createElement("optgroup");
    og.label = g.group;
    g.items.forEach(function (f) {
      INDEX[f.id] = f;
      var o = document.createElement("option");
      o.value = f.id; o.textContent = f.name;
      og.appendChild(o);
    });
    fmtSel.appendChild(og);
  });

  /* ---------- 상태 & 영속화 (메인 앱과 공유) ---------- */
  var INPUTS_KEY = "focal-lab-inputs";   // 포맷·초점 (app.js와 동일)
  var CAM_KEY = "focal-lab-cam";         // 기준 카메라 보정값(환산 초점거리)

  var clampFocal = function (v) { return Math.min(600, Math.max(1, v)); };
  var clampCal = function (v) { return Math.min(80, Math.max(10, v)); };

  var state = { fmtId: "6x6", focal: 80, camEquiv: 26 };

  (function loadState() {
    try {
      var s = JSON.parse(localStorage.getItem(INPUTS_KEY));
      if (s && INDEX[s.format]) state.fmtId = s.format;
      if (s && isFinite(parseFloat(s.focal))) state.focal = clampFocal(parseFloat(s.focal));
    } catch (e) {}
    try {
      var cam = parseFloat(localStorage.getItem(CAM_KEY));
      if (isFinite(cam)) state.camEquiv = clampCal(cam);
    } catch (e) {}
  })();

  function saveInputs() {
    // 메인 앱 저장 형태를 보존하며 포맷·초점만 갱신 (다른 필드는 유지)
    var obj = {};
    try { obj = JSON.parse(localStorage.getItem(INPUTS_KEY)) || {}; } catch (e) {}
    if (typeof obj !== "object" || !obj) obj = {};
    obj.format = state.fmtId;
    obj.focal = String(state.focal);
    try { localStorage.setItem(INPUTS_KEY, JSON.stringify(obj)); } catch (e) {}
  }
  function saveCam() {
    try { localStorage.setItem(CAM_KEY, String(state.camEquiv)); } catch (e) {}
  }

  // 컨트롤 초기값 반영
  fmtSel.value = state.fmtId;
  focalRange.value = state.focal;
  calRange.value = state.camEquiv;

  /* ---------- 카메라 화각(기준) ---------- */
  // camEquiv(환산 초점거리)와 화면 종횡비로 카메라의 수평/수직 화각을 산출.
  function cameraFOV(W, H) {
    var aScreen = W / H;
    var diagFOV = C.aov(C.FF_DIAG, state.camEquiv);          // 대각 화각(도)
    var halfDiagTan = Math.tan(diagFOV / 2 * RAD);
    var wFrac = aScreen / Math.hypot(aScreen, 1);
    var hFrac = 1 / Math.hypot(aScreen, 1);
    return {
      h: 2 * Math.atan(halfDiagTan * wFrac) / RAD,
      v: 2 * Math.atan(halfDiagTan * hFrac) / RAD
    };
  }

  /* ---------- 캔버스 측정 (DPR 대응) ---------- */
  var cssW = 0, cssH = 0;
  function measure() {
    var r = canvas.getBoundingClientRect();
    cssW = r.width; cssH = r.height;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ---------- 렌더 ---------- */
  function accent() {
    return getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#2b6cff";
  }

  // 중앙 정렬 사각형. frac>1이면 화면 밖 → 화면에 클램프(점선이 잘림). over 반환.
  function drawBox(tH, tV, cam, color, dash, lineW, label) {
    var fracW = Math.tan(tH / 2 * RAD) / Math.tan(cam.h / 2 * RAD);
    var fracV = Math.tan(tV / 2 * RAD) / Math.tan(cam.v / 2 * RAD);
    var over = fracW > 1 || fracV > 1;
    var w = Math.min(fracW, 1) * cssW;
    var h = Math.min(fracV, 1) * cssH;
    var x = (cssW - w) / 2, y = (cssH - h) / 2;

    ctx.save();
    ctx.lineWidth = lineW;
    ctx.strokeStyle = color;
    ctx.setLineDash(dash || []);
    ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 4;
    ctx.strokeRect(x + lineW / 2, y + lineW / 2, Math.max(0, w - lineW), Math.max(0, h - lineW));
    ctx.restore();

    // 라벨 (박스 좌상단 안쪽)
    if (label) {
      ctx.save();
      ctx.font = "700 12px " + getComputedStyle(document.body).fontFamily;
      ctx.textBaseline = "top";
      ctx.shadowColor = "rgba(0,0,0,.85)"; ctx.shadowBlur = 3;
      ctx.fillStyle = color;
      var lx = Math.max(4, x + 6), ly = Math.max(4, y + 6);
      ctx.fillText(label, lx, ly);
      ctx.restore();
    }
    return over;
  }

  function render() {
    if (!cssW || !cssH) measure();
    ctx.clearRect(0, 0, cssW, cssH);

    var f = INDEX[state.fmtId] || INDEX["6x6"];
    var focal = state.focal;
    var cam = cameraFOV(cssW, cssH);

    var fmtLong = Math.max(f.w, f.h), fmtShort = Math.min(f.w, f.h);

    // 풀프레임 (회색 점선) — 같은 물리 초점 기준
    drawBox(C.aov(36, focal), C.aov(24, focal), cam, "#ffffff", [7, 6], 2, "풀프레임");
    // 환산 포맷 (accent 실선)
    var over = drawBox(C.aov(fmtLong, focal), C.aov(fmtShort, focal), cam, accent(), [], 3, f.name);

    // 중앙 십자
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 1;
    var cx = cssW / 2, cy = cssH / 2;
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy);
    ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10);
    ctx.stroke();
    ctx.restore();

    // 상단 수치
    var ef = C.equivFocal(focal, f);
    var ang = C.angles(focal, f);
    var ffAng = C.angles(focal, C.FF);
    readout.innerHTML =
      '<span class="ro-fmt">' + esc(f.name) + '</span>' +
      '<span>물리 <b>' + focal + 'mm</b></span>' +
      '<span>환산 <b>' + ef.toFixed(1) + 'mm</b></span>' +
      '<span>화각 <b>' + ang.d.toFixed(1) + '°</b> (대각)</span>' +
      '<span class="ro-ff">풀프레임 ' + ffAng.d.toFixed(1) + '°</span>';

    // 넓은 화각 경고
    if (over) {
      warnEl.hidden = false;
      warnEl.textContent = "선택 화각이 기준 카메라보다 넓습니다 — 보정값을 넓히거나 더 넓은 렌즈가 필요해요.";
    } else {
      warnEl.hidden = true;
    }
  }

  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
    });
  }

  // rAF 디바운스 렌더
  var rafId = null;
  function scheduleRender() {
    if (rafId) return;
    rafId = requestAnimationFrame(function () { rafId = null; render(); });
  }

  /* ---------- 입력 와이어링 ---------- */
  function syncLabels() {
    focalVal.textContent = state.focal + "mm";
    calVal.textContent = state.camEquiv + "mm";
  }
  syncLabels();

  fmtSel.addEventListener("change", function () {
    state.fmtId = fmtSel.value;
    saveInputs(); scheduleRender();
  });
  focalRange.addEventListener("input", function () {
    state.focal = clampFocal(parseFloat(focalRange.value));
    syncLabels(); saveInputs(); scheduleRender();
  });
  calRange.addEventListener("input", function () {
    state.camEquiv = clampCal(parseFloat(calRange.value));
    syncLabels(); saveCam(); scheduleRender();
  });

  window.addEventListener("resize", function () { measure(); scheduleRender(); });
  window.addEventListener("orientationchange", function () {
    setTimeout(function () { measure(); scheduleRender(); }, 250);
  });

  /* ---------- 카메라 시작 ---------- */
  var stream = null;
  function showMsg(text, btnLabel) {
    msgText.textContent = text;
    startBtn.hidden = !btnLabel;
    if (btnLabel) startBtn.textContent = btnLabel;
    msg.hidden = false;
  }

  function startCamera() {
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
      showMsg("이 브라우저는 카메라를 지원하지 않거나 보안 컨텍스트(HTTPS/localhost)가 아닙니다. 가이드 수치는 계속 확인할 수 있어요.", null);
      return;
    }
    showMsg("카메라를 켜는 중…", null);
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    }).then(function (s) {
      stream = s;
      video.srcObject = s;
      video.play().catch(function () {});
      msg.hidden = true;
      measure(); render();
    }).catch(function (err) {
      var name = err && err.name;
      var t = "카메라를 시작할 수 없습니다.";
      if (name === "NotAllowedError" || name === "SecurityError") t = "카메라 권한이 거부되었습니다. 브라우저 설정에서 허용 후 다시 시도하세요.";
      else if (name === "NotFoundError" || name === "OverconstrainedError") t = "사용 가능한 카메라를 찾지 못했습니다.";
      showMsg(t + " (가이드 수치는 계속 확인 가능)", "다시 시도");
    });
  }

  startBtn.addEventListener("click", startCamera);

  // 페이지를 떠날 때 트랙 정리
  window.addEventListener("pagehide", function () {
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
  });

  /* ---------- 초기 렌더 (영상 없이도 가이드/수치 표시) ---------- */
  measure();
  render();
})();
