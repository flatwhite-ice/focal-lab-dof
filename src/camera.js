/* Focal Lab · 카메라 화각 오버레이(뷰파인더) 와이어링.
   convert.js(Convert), formats.js(FORMATS) 의존.

   정확도 설계:
   - video는 object-fit: contain → 센서 프레임 '전체'를 레터박스로 표시(잘림 없음).
     덕분에 오버레이를 영상 프레임 좌표에 정확히 매핑할 수 있다.
   - 기준 카메라는 formats.js의 실제 폰 렌즈(센서 w/h + 실초점)를 선택 → 추측 제거.
   - 영상 실제 종횡비/방향을 반영해 카메라 화각을 계산하고, 직선투영(tan 비)으로 박스 크기 결정.
   - 선택 포맷 프레임 밖을 어둡게(뷰파인더 마스크). 미세 오차는 정밀 보정(±)으로 흡수. */
(function () {
  "use strict";

  var C = window.Convert;
  var $ = function (id) { return document.getElementById(id); };
  var RAD = Math.PI / 180;

  var fmtSel = $("cam-format"), noteEl = $("cam-format-note");
  var focalNum = $("cam-focal"), focalRange = $("cam-focal-range");
  var refSel = $("cam-ref");
  var corrRange = $("cam-corr"), corrVal = $("cam-corr-val");
  var video = $("cam-video"), canvas = $("cam-canvas"), ctx = canvas.getContext("2d");
  var readout = $("cam-readout"), warnEl = $("cam-warn");
  var msg = $("cam-msg"), msgText = $("cam-msg-text"), startBtn = $("cam-start");
  var devSel = $("cam-device"), devField = $("cam-device-field");
  var panel = $("cam-panel"), handle = $("cam-handle"), summaryEl = $("cam-summary");

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

  /* ---------- 기준 카메라(폰 렌즈) 목록 ----------
     focal(실초점)이 정의된 엔트리만 = 폰 렌즈. id 충돌 가능성이 있어 배열 인덱스를 값으로 사용. */
  var PHONES = [];
  window.FORMATS.forEach(function (g) {
    var phones = g.items.filter(function (f) { return f.focal != null; });
    if (!phones.length) return;
    var og = document.createElement("optgroup");
    og.label = g.group;
    phones.forEach(function (f) {
      var idx = PHONES.push(f) - 1;
      var o = document.createElement("option");
      o.value = String(idx); o.textContent = f.name;
      og.appendChild(o);
    });
    refSel.appendChild(og);
  });

  function findPhone(pred) {
    for (var i = 0; i < PHONES.length; i++) if (pred(PHONES[i].name)) return i;
    return -1;
  }
  // 기본 기준 렌즈: 17 Pro 초광각 → 임의 초광각 → 첫 폰
  var DEFAULT_REF = (function () {
    var i = findPhone(function (n) { return /17\s*pro/i.test(n) && /초광각/.test(n); });
    if (i < 0) i = findPhone(function (n) { return /초광각/.test(n); });
    if (i < 0) i = 0;
    return i;
  })();

  /* ---------- 상태 & 영속화 ---------- */
  var INPUTS_KEY = "focal-lab-inputs";   // 포맷·초점 (app.js와 공유)
  var CAM_KEY = "focal-lab-cam";         // { ref:<phone name>, corr:<배율> }

  var clampFocal = function (v) { return Math.min(600, Math.max(1, v)); };
  var clampCorr = function (v) { return Math.min(1.6, Math.max(0.6, v)); };

  var state = { fmtId: "6x6", focal: 80, ref: DEFAULT_REF, corr: 1 };
  var hasSavedRef = false;   // 사용자가 기준 렌즈를 고른 적 있으면 자동선택이 덮어쓰지 않음

  (function loadState() {
    try {
      var s = JSON.parse(localStorage.getItem(INPUTS_KEY));
      if (s && INDEX[s.format]) state.fmtId = s.format;
      if (s && isFinite(parseFloat(s.focal))) state.focal = clampFocal(parseFloat(s.focal));
    } catch (e) {}
    try {
      var c = JSON.parse(localStorage.getItem(CAM_KEY));
      if (c && typeof c === "object") {
        if (c.ref) {
          var i = findPhone(function (n) { return n === c.ref; });
          if (i >= 0) { state.ref = i; hasSavedRef = true; }
        }
        if (isFinite(parseFloat(c.corr))) state.corr = clampCorr(parseFloat(c.corr));
      }
    } catch (e) {}
  })();

  function saveInputs() {
    var obj = {};
    try { obj = JSON.parse(localStorage.getItem(INPUTS_KEY)) || {}; } catch (e) {}
    if (typeof obj !== "object" || !obj) obj = {};
    obj.format = state.fmtId;
    obj.focal = String(state.focal);
    try { localStorage.setItem(INPUTS_KEY, JSON.stringify(obj)); } catch (e) {}
  }
  function saveCam() {
    try { localStorage.setItem(CAM_KEY, JSON.stringify({ ref: PHONES[state.ref].name, corr: state.corr })); } catch (e) {}
  }

  // 컨트롤 초기값
  fmtSel.value = state.fmtId;
  focalNum.value = state.focal;
  focalRange.value = state.focal;
  refSel.value = String(state.ref);
  corrRange.value = state.corr;

  /* ---------- 메타 표기 ---------- */
  function curFmt() { return INDEX[state.fmtId] || INDEX["6x6"]; }
  function updateNote() {
    var f = curFmt();
    noteEl.textContent = f.note ? (f.est ? "추정 · " : "") + f.note : "";
  }
  function updateSummary() { summaryEl.textContent = curFmt().name + " · " + state.focal + "mm"; }
  function updateCorrLabel() {
    var pct = Math.round((state.corr - 1) * 100);
    corrVal.textContent = (pct > 0 ? "+" : "") + pct + "%";
  }
  updateNote(); updateSummary(); updateCorrLabel();

  /* ---------- 카메라(기준 렌즈) 화각 ----------
     영상 프레임의 수평/수직 화각을 element 좌표 기준으로 산출.
     ref 폰 렌즈의 센서 w/h(4:3, 가로기준)와 실초점으로 계산하고,
     영상 종횡비(센서 크롭)와 element 방향(가로/세로)을 반영. */
  function cameraFOV(vw, vh) {
    var r = PHONES[state.ref] || PHONES[DEFAULT_REF];
    var fp = r.focal;
    var sLong = Math.max(r.w, r.h), sShort = Math.min(r.w, r.h);  // 센서 가로/세로(mm)
    var sensorAspect = sLong / sShort;
    // 영상 프레임 종횡비(가로:세로 = 긴변:짧은변)
    var aLS = (vw && vh) ? Math.max(vw, vh) / Math.min(vw, vh) : sensorAspect;
    // 영상이 센서를 어떻게 크롭하는지 → 실제 사용된 센서 변 길이
    var effLong, effShort;
    if (aLS >= sensorAspect) { effLong = sLong; effShort = sLong / aLS; }  // 더 와이드 → 위아래 크롭
    else { effShort = sShort; effLong = sShort * aLS; }                    // 더 정사각 → 좌우 크롭
    var Flong = C.aov(effLong, fp), Fshort = C.aov(effShort, fp);
    // element 방향에 맞춰 h/v 매핑 (세로영상이면 짧은변이 수평)
    var landscape = (vw >= vh);
    return {
      h: landscape ? Flong : Fshort,
      v: landscape ? Fshort : Flong,
      diag: C.aov(Math.hypot(effLong, effShort), fp),   // 역산된 라이브뷰 대각 화각(검증용)
      name: r.name
    };
  }

  /* ---------- 캔버스 측정 ---------- */
  var cssW = 0, cssH = 0;
  function measure() {
    var rc = canvas.getBoundingClientRect();
    cssW = rc.width; cssH = rc.height;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // contain: 영상 프레임이 스테이지 안에 들어가도록 레터박스된 표시 사각형
  function videoRect() {
    var vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return { x: 0, y: 0, w: cssW, h: cssH, vw: cssW || 1, vh: cssH || 1, live: false };
    var scale = Math.min(cssW / vw, cssH / vh);
    var w = vw * scale, h = vh * scale;
    return { x: (cssW - w) / 2, y: (cssH - h) / 2, w: w, h: h, vw: vw, vh: vh, live: true };
  }

  /* ---------- 렌더 ---------- */
  function accent() {
    return getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#2b6cff";
  }
  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; });
  }

  // 영상 사각형(rect) 안에서, 카메라화각(cam) 대비 목표화각(tH,tV)이 차지하는 박스
  function boxFor(rect, cam, tH, tV) {
    var fracW = Math.tan(tH / 2 * RAD) / (Math.tan(cam.h / 2 * RAD) * state.corr);
    var fracV = Math.tan(tV / 2 * RAD) / (Math.tan(cam.v / 2 * RAD) * state.corr);
    var over = fracW > 1 || fracV > 1;
    var w = Math.min(fracW, 1) * rect.w, h = Math.min(fracV, 1) * rect.h;
    return { x: rect.x + (rect.w - w) / 2, y: rect.y + (rect.h - h) / 2, w: w, h: h, over: over };
  }
  function strokeBox(b, color, dash, lw, label) {
    ctx.save();
    ctx.lineWidth = lw; ctx.strokeStyle = color; ctx.setLineDash(dash || []);
    ctx.shadowColor = "rgba(0,0,0,.7)"; ctx.shadowBlur = 4;
    ctx.strokeRect(b.x + lw / 2, b.y + lw / 2, Math.max(0, b.w - lw), Math.max(0, b.h - lw));
    ctx.restore();
    if (label) {
      ctx.save();
      ctx.font = "700 12px " + getComputedStyle(document.body).fontFamily;
      ctx.textBaseline = "top"; ctx.fillStyle = color;
      ctx.shadowColor = "rgba(0,0,0,.9)"; ctx.shadowBlur = 3;
      ctx.fillText(label, Math.max(4, b.x + 6), Math.max(4, b.y + 6));
      ctx.restore();
    }
  }

  function render() {
    if (!cssW || !cssH) measure();
    ctx.clearRect(0, 0, cssW, cssH);

    var rect = videoRect();
    var cam = cameraFOV(rect.vw, rect.vh);
    var f = curFmt(), focal = state.focal;

    // 표시 방향(가로/세로)에 맞춰 포맷 장변=긴축 정렬
    var dispLandscape = rect.w >= rect.h;
    var fmtLong = Math.max(f.w, f.h), fmtShort = Math.min(f.w, f.h);
    var tLong = C.aov(fmtLong, focal), tShort = C.aov(fmtShort, focal);
    var ffLong = C.aov(36, focal), ffShort = C.aov(24, focal);
    var fmtBox = boxFor(rect, cam, dispLandscape ? tLong : tShort, dispLandscape ? tShort : tLong);
    var ffBox = boxFor(rect, cam, dispLandscape ? ffLong : ffShort, dispLandscape ? ffShort : ffLong);

    // 뷰파인더 마스크: 전체를 어둡게 → 선택 포맷 박스만 투명(라이브뷰 노출)
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.5)";
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.clearRect(fmtBox.x, fmtBox.y, fmtBox.w, fmtBox.h);
    ctx.restore();

    // 풀프레임(흰 점선) → 환산 포맷(accent 실선) 순으로
    strokeBox(ffBox, "#ffffff", [7, 6], 2, "풀프레임");
    strokeBox(fmtBox, accent(), [], 3, f.name);

    // 중앙 십자
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 1;
    var cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy);
    ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10);
    ctx.stroke();
    ctx.restore();

    // 상단 수치
    var ef = C.equivFocal(focal, f), ang = C.angles(focal, f);
    readout.innerHTML =
      '<span class="ro-fmt">' + esc(f.name) + ' · ' + focal + 'mm → 환산 ' + ef.toFixed(1) + 'mm</span>' +
      '<span>포맷 화각 <b>' + ang.d.toFixed(1) + '°</b></span>' +
      '<span class="ro-ff">기준 ' + esc(cam.name) + ' · 화면 ' + cam.h.toFixed(0) + '°×' + cam.v.toFixed(0) + '° · 대각 ' + cam.diag.toFixed(0) + '°</span>';

    if (fmtBox.over) {
      warnEl.hidden = false;
      warnEl.textContent = "선택 화각이 기준 렌즈보다 넓어 화면에 다 담기지 않습니다 — 더 넓은 렌즈를 쓰거나 초점거리를 늘려보세요.";
    } else { warnEl.hidden = true; }
  }

  var rafId = null;
  function scheduleRender() {
    if (rafId) return;
    rafId = requestAnimationFrame(function () { rafId = null; render(); });
  }

  /* ---------- 입력 와이어링 ---------- */
  function onInputChange() { updateSummary(); saveInputs(); scheduleRender(); }

  fmtSel.addEventListener("change", function () {
    state.fmtId = fmtSel.value; updateNote(); onInputChange();
  });
  focalNum.addEventListener("input", function () {
    var v = parseFloat(focalNum.value);
    if (isFinite(v)) { state.focal = clampFocal(v); focalRange.value = state.focal; }
    onInputChange();
  });
  focalRange.addEventListener("input", function () {
    state.focal = clampFocal(parseFloat(focalRange.value));
    focalNum.value = state.focal; onInputChange();
  });
  refSel.addEventListener("change", function () {
    state.ref = parseInt(refSel.value, 10) || 0;
    hasSavedRef = true; saveCam(); scheduleRender();
    switchPhysicalForRef(PHONES[state.ref].name);   // 실제 카메라도 best-effort 전환
  });
  corrRange.addEventListener("input", function () {
    state.corr = clampCorr(parseFloat(corrRange.value));
    updateCorrLabel(); saveCam(); scheduleRender();
  });

  handle.addEventListener("click", function () {
    var collapsed = panel.classList.toggle("is-collapsed");
    handle.setAttribute("aria-expanded", String(!collapsed));
  });

  window.addEventListener("resize", function () { measure(); scheduleRender(); });
  window.addEventListener("orientationchange", function () {
    setTimeout(function () { measure(); scheduleRender(); }, 250);
  });

  /* ---------- 카메라 시작 / 렌즈 전환 ---------- */
  var stream = null, currentDeviceId = null, autoPicked = false;

  function showMsg(text, btnLabel) {
    msgText.textContent = text;
    startBtn.hidden = !btnLabel;
    if (btnLabel) startBtn.textContent = btnLabel;
    msg.hidden = false;
  }
  function stopStream() {
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
  }
  function lensType(s) {
    s = (s || "").toLowerCase();
    if (/ultra|초광각/.test(s)) return "ultra";
    if (/tele|망원/.test(s)) return "tele";
    return "wide";
  }

  function startCamera(deviceId) {
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
      showMsg("이 브라우저는 카메라를 지원하지 않거나 보안 컨텍스트(HTTPS/localhost)가 아닙니다. 오버레이 수치는 계속 확인할 수 있어요.", null);
      return;
    }
    showMsg("카메라를 켜는 중…", null);
    stopStream();
    var videoC = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "environment" } };
    videoC.width = { ideal: 1920 }; videoC.height = { ideal: 1080 };
    navigator.mediaDevices.getUserMedia({ video: videoC, audio: false }).then(function (s) {
      stream = s;
      video.srcObject = s;
      video.play().catch(function () {});
      msg.hidden = true;
      var track = s.getVideoTracks()[0];
      var st = (track && track.getSettings) ? track.getSettings() : {};
      currentDeviceId = st.deviceId || deviceId || null;
      populateDevices();
      if (deviceId === undefined) autoSelectWidest();   // 최초: 가장 넓은 렌즈로
      measure(); render();
    }).catch(function (err) {
      var name = err && err.name;
      var t = "카메라를 시작할 수 없습니다.";
      if (name === "NotAllowedError" || name === "SecurityError") t = "카메라 권한이 거부되었습니다. 브라우저 설정에서 허용 후 다시 시도하세요.";
      else if (name === "NotFoundError" || name === "OverconstrainedError") t = "선택한 렌즈/카메라를 사용할 수 없습니다.";
      showMsg(t + " (오버레이 수치는 계속 확인 가능)", "다시 시도");
    });
  }

  function getCams() {
    if (!(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices))
      return Promise.resolve([]);
    return navigator.mediaDevices.enumerateDevices().then(function (list) {
      return list.filter(function (d) { return d.kind === "videoinput"; });
    }).catch(function () { return []; });
  }

  function populateDevices() {
    getCams().then(function (cams) {
      if (cams.length <= 1) { devField.hidden = true; return; }
      devSel.innerHTML = "";
      cams.forEach(function (d, i) {
        var o = document.createElement("option");
        o.value = d.deviceId; o.textContent = d.label || ("카메라 " + (i + 1));
        devSel.appendChild(o);
      });
      if (currentDeviceId) devSel.value = currentDeviceId;
      devField.hidden = false;
    });
  }

  // 최초 1회: 가장 넓은(초광각) 후면 렌즈로 전환 + 기준 렌즈 기본값을 초광각으로
  function autoSelectWidest() {
    if (autoPicked) return;
    autoPicked = true;
    getCams().then(function (cams) {
      var ultra = cams.filter(function (d) { return lensType(d.label) === "ultra"; });
      if (ultra.length && ultra[0].deviceId && ultra[0].deviceId !== currentDeviceId) {
        startCamera(ultra[0].deviceId);
      }
      if (!hasSavedRef) {   // 사용자가 기준을 안 골랐으면 초광각 기본
        var i = findPhone(function (n) { return /초광각/.test(n); });
        if (i >= 0) { state.ref = i; refSel.value = String(i); scheduleRender(); }
      }
    });
  }

  // 기준 렌즈 선택에 맞춰 실제 카메라 장치를 best-effort 전환
  function switchPhysicalForRef(refName) {
    var want = lensType(refName);
    getCams().then(function (cams) {
      var match = null;
      for (var i = 0; i < cams.length; i++) {
        var t = lensType(cams[i].label);
        if (t === want) { match = cams[i]; break; }
        if (want === "wide" && t === "wide" && !match) match = cams[i];
      }
      if (match && match.deviceId && match.deviceId !== currentDeviceId) startCamera(match.deviceId);
    });
  }

  devSel.addEventListener("change", function () { startCamera(devSel.value); });
  startBtn.addEventListener("click", function () { startCamera(); });
  video.addEventListener("loadedmetadata", function () { measure(); render(); });
  window.addEventListener("pagehide", stopStream);

  /* ---------- 초기 렌더 ---------- */
  measure();
  render();
})();
