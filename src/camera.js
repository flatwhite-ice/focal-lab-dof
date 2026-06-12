/* Focal Lab · 카메라 화각 오버레이(뷰파인더) 와이어링.
   convert.js(Convert), formats.js(FORMATS), camera-data.js(CameraData), camera-calib.js(CamCalib) 의존.

   정확도 설계:
   - video는 object-fit: contain → 영상 프레임 '전체'를 레터박스로 표시(잘림 없음).
     덕분에 오버레이를 영상 프레임 좌표에 정확히 매핑할 수 있다.
   - 기준 화각(fovLong = 줌 1 기준 영상 장변 화각)은 우선순위 체인으로 결정(resolveFOV):
     ① 사용자 실측 캘리브레이션(렌즈별 영속, focal-lab-cam v2) →
     ② CameraData.VIDEO_FOV 실측 테이블 →
     ③ formats.js 폰 렌즈(스틸 환산초점 역산)에서 유도(추정).
     스틸 스펙 역산은 비디오 스트림의 EIS 마진·리드아웃 크롭을 모르므로 폴백일 뿐이다.
   - 단변 화각은 현재 스트림 종횡비에서 tan-공간으로 유도, 스트림 zoom(getSettings) 반영.
   - 직선투영(tan 비)으로 박스 크기 결정. 선택 포맷 프레임 밖은 어둡게(뷰파인더 마스크).
   - 정밀 보정(±)은 실측 후 남는 잔여 오차 트림 용도로 존속. */
(function () {
  "use strict";

  var C = window.Convert;
  var CD = window.CameraData || { VIDEO_FOV: [], SCREENS: [] };
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
  var streamInfoEl = $("cam-stream-info"), calibBtn = $("cam-calib-open"), modelHintEl = $("cam-model-hint");

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

  /* ---------- 상태 & 영속화 ----------
     focal-lab-cam v2: { v:2, ref:<phone name>, corr:<배율>,
       calib:[{ deviceId, label, lens, fovLong(줌1 장변 화각°), aspect, w, h, zoom,
                target:{mm,distMm}, ts }] }
     v1({ref,corr})은 로드 시 승계하고 다음 저장에서 v2로 기록. */
  var INPUTS_KEY = "focal-lab-inputs";   // 포맷·초점 (app.js와 공유)
  var CAM_KEY = "focal-lab-cam";

  var clampFocal = function (v) { return Math.min(600, Math.max(1, v)); };
  var clampCorr = function (v) { return Math.min(1.6, Math.max(0.6, v)); };

  var state = { fmtId: "6x6", focal: 80, ref: DEFAULT_REF, corr: 1, calib: [] };
  var hasSavedRef = false;   // 사용자가 기준 렌즈를 고른 적 있으면 자동선택이 덮어쓰지 않음

  function validCalib(e) {
    return e && typeof e === "object" &&
      isFinite(e.fovLong) && e.fovLong > 0 && e.fovLong < 180 &&
      isFinite(e.aspect) && e.aspect >= 1;
  }

  (function loadState() {
    try {
      var s = JSON.parse(localStorage.getItem(INPUTS_KEY));
      if (s && INDEX[s.format]) state.fmtId = s.format;
      if (s && isFinite(parseFloat(s.focal))) state.focal = clampFocal(parseFloat(s.focal));
    } catch (e) {}
    try {
      var c = JSON.parse(localStorage.getItem(CAM_KEY));
      if (c && typeof c === "object") {       // v1·v2 공통 필드
        if (c.ref) {
          var i = findPhone(function (n) { return n === c.ref; });
          if (i >= 0) { state.ref = i; hasSavedRef = true; }
        }
        if (isFinite(parseFloat(c.corr))) state.corr = clampCorr(parseFloat(c.corr));
        if (c.v === 2 && Array.isArray(c.calib)) state.calib = c.calib.filter(validCalib);
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
    try {
      localStorage.setItem(CAM_KEY, JSON.stringify({
        v: 2, ref: PHONES[state.ref].name, corr: state.corr, calib: state.calib
      }));
    } catch (e) {}
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

  /* ---------- 스트림 인트로스펙션 ----------
     현재 비디오 트랙의 getSettings()를 보관. zoom은 iOS 17+ Safari에서만
     노출될 수 있으므로 null 허용(null ⇒ 1로 취급). 1.5s 폴링으로 변화 감지. */
  var streamInfo = { w: 0, h: 0, aspect: 0, zoom: null, deviceId: null, label: "" };
  var streamPoll = null;

  function updateStreamInfo() {
    var track = stream && stream.getVideoTracks()[0];
    if (!track || !track.getSettings) return false;
    var st = track.getSettings();
    var zoom = isFinite(st.zoom) ? st.zoom : null;
    var changed = st.width !== streamInfo.w || st.height !== streamInfo.h || zoom !== streamInfo.zoom;
    streamInfo = {
      w: st.width || 0, h: st.height || 0,
      aspect: (st.width && st.height) ? Math.max(st.width, st.height) / Math.min(st.width, st.height) : 0,
      zoom: zoom, deviceId: st.deviceId || null, label: track.label || ""
    };
    return changed;
  }
  function updateStreamReadout() {
    if (!streamInfoEl) return;
    if (!streamInfo.w) { streamInfoEl.textContent = "스트림 없음"; return; }
    streamInfoEl.textContent = streamInfo.w + "×" + streamInfo.h +
      " · zoom " + (streamInfo.zoom == null ? "—" : streamInfo.zoom) +
      (streamInfo.label ? " · " + streamInfo.label : "");
  }
  function startStreamPoll() {
    stopStreamPoll();
    streamPoll = setInterval(function () {
      if (updateStreamInfo()) { updateStreamReadout(); scheduleRender(); }
    }, 1500);
  }
  function stopStreamPoll() {
    if (streamPoll) { clearInterval(streamPoll); streamPoll = null; }
  }

  /* ---------- 카메라 화각 결정 ----------
     정규 값은 fovLong = 줌 1 기준 영상 '장변' 화각(도).
     소스 우선순위: ① 사용자 실측(calib) ② 실측 테이블(VIDEO_FOV) ③ 스틸 스펙 역산. */
  function refPhone() { return PHONES[state.ref] || PHONES[DEFAULT_REF]; }

  // ③ 폴백: ref 폰 렌즈(센서 w/h + 실초점)에서 장변 화각 유도.
  //   영상이 센서(4:3)보다 와이드면 장변은 전부 사용된다고 가정(검증 불가 → '추정').
  function derivedFovLong(aspect) {
    var r = refPhone();
    var sLong = Math.max(r.w, r.h), sShort = Math.min(r.w, r.h);
    var sensorAspect = sLong / sShort;
    var effLong = (aspect >= sensorAspect) ? sLong : sShort * aspect;
    return C.aov(effLong, r.focal);
  }

  // ① 현재 스트리밍 중인 렌즈의 실측값. deviceId → label → 렌즈 종류 순으로 매칭.
  function findCalib() {
    if (!streamInfo.deviceId && !streamInfo.label) return null;
    var i, e;
    for (i = 0; i < state.calib.length; i++) {
      e = state.calib[i];
      if (streamInfo.deviceId && e.deviceId === streamInfo.deviceId) return e;
    }
    for (i = 0; i < state.calib.length; i++) {
      e = state.calib[i];
      if (streamInfo.label && e.label === streamInfo.label) return e;
    }
    var lens = lensType(streamInfo.label);
    for (i = 0; i < state.calib.length; i++) {
      if (state.calib[i].lens === lens) return state.calib[i];
    }
    return null;
  }

  // ② 실측 테이블: 추정 모델 + 렌즈 종류 + 종횡비 버킷 일치.
  function aspectOf(s) { return s === "4:3" ? 4 / 3 : s === "16:9" ? 16 / 9 : parseFloat(s); }
  function findTable(aspect) {
    if (!detectedModel) return null;
    var lens = streamInfo.label ? lensType(streamInfo.label) : lensType(refPhone().name);
    for (var i = 0; i < CD.VIDEO_FOV.length; i++) {
      var t = CD.VIDEO_FOV[i];
      if (t.model === detectedModel && t.lens === lens &&
          isFinite(aspectOf(t.aspect)) && Math.abs(aspectOf(t.aspect) - aspect) <= 0.02) return t;
    }
    return null;
  }

  function resolveFOV(vw, vh) {
    var aspect = (vw && vh) ? Math.max(vw, vh) / Math.min(vw, vh) : 4 / 3;
    var src, fovLong, aspectNote = false, name;
    var cal = findCalib();
    if (cal) {
      src = "calib"; fovLong = cal.fovLong;
      aspectNote = Math.abs(cal.aspect - aspect) > 0.02;  // 측정 당시와 비율이 다르면 표기
      name = streamInfo.label || cal.label || refPhone().name;
    } else {
      var t = findTable(aspect);
      if (t) { src = "table"; fovLong = t.fovLong; name = t.model + " (실측 테이블)"; }
      else { src = "derived"; fovLong = derivedFovLong(aspect); name = refPhone().name; }
    }
    var z = (streamInfo.zoom && isFinite(streamInfo.zoom)) ? streamInfo.zoom : 1;
    var hL = C.zoomFov(fovLong, z);          // 현재 줌 반영 장변
    var hS = C.shortFov(hL, aspect);         // 종횡비에서 단변 유도
    var landscape = (vw >= vh);
    var diag = 2 * Math.atan(Math.hypot(Math.tan(hL / 2 * RAD), Math.tan(hS / 2 * RAD))) / RAD;
    return {
      h: landscape ? hL : hS,
      v: landscape ? hS : hL,
      diag: diag, src: src, aspectNote: aspectNote, name: name
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
    var cam = resolveFOV(rect.vw, rect.vh);
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

    // 상단 수치 (+ 화각 소스 배지: 실측 > 테이블 > 추정)
    var ef = C.equivFocal(focal, f), ang = C.angles(focal, f);
    var badge = cam.src === "calib" ? (cam.aspectNote ? "실측·비율보정" : "실측")
      : cam.src === "table" ? "테이블" : "추정";
    readout.innerHTML =
      '<span class="ro-fmt">' + esc(f.name) + ' · ' + focal + 'mm → 환산 ' + ef.toFixed(1) + 'mm</span>' +
      '<span>포맷 화각 <b>' + ang.d.toFixed(1) + '°</b></span>' +
      '<span class="ro-ff">기준 ' + esc(cam.name) + ' · 화면 ' + cam.h.toFixed(0) + '°×' + cam.v.toFixed(0) + '° · 대각 ' + cam.diag.toFixed(0) + '°' +
      ' <b class="ro-src ro-src--' + cam.src + '">' + badge + '</b></span>';

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
    stopStreamPoll();
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    streamInfo = { w: 0, h: 0, aspect: 0, zoom: null, deviceId: null, label: "" };
    if (calibBtn) calibBtn.disabled = true;
    updateStreamReadout();
  }
  function lensType(s) {
    s = (s || "").toLowerCase();
    if (/ultra|초광각/.test(s)) return "ultra";
    if (/tele|망원/.test(s)) return "tele";
    if (/front|user|전면/.test(s)) return "front";
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
      updateStreamInfo();
      updateStreamReadout();
      startStreamPoll();
      if (calibBtn) calibBtn.disabled = false;
      currentDeviceId = streamInfo.deviceId || deviceId || null;
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
      updateModelHint(cams);
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

  /* ---------- 기기(모델) 자동 추정 ----------
     화면 논리 해상도 + DPR → CameraData.SCREENS 후보 → 후면 망원 유무로 Pro 압축.
     추정일 뿐이므로 '추천 + 사용자 확인(적용 링크)'만 하고 저장된 ref는 덮어쓰지 않음. */
  var detectedModel = null;
  var LENS_RE = { ultra: /초광각/, tele: /망원/, wide: /광각|메인/ };

  function isRear(label) { return !/front|user|전면/i.test(label || ""); }

  // 모델 문자열이 PHONES 이름의 머리와 '경계까지' 일치하는 항목 탐색
  // (예: "iPhone 17"이 "iPhone 17 Pro …"에 오매칭되지 않도록 다음 토큰이 ·,/ 인지 확인)
  function phoneForModel(model, pred) {
    return findPhone(function (n) {
      if (n.indexOf(model) !== 0) return false;
      var rest = n.slice(model.length);   // 단일카메라기는 접미사 없이 이름이 곧 모델
      if (rest !== "" && !/^\s*[·\/(]/.test(rest)) return false;
      return pred ? pred(n) : true;
    });
  }
  function phoneForModelLens(model, lens) {
    var re = LENS_RE[lens] || LENS_RE.wide;
    var i = phoneForModel(model, function (n) { return re.test(n); });
    return i >= 0 ? i : phoneForModel(model);
  }

  function detectModel(cams) {
    var sw = Math.min(screen.width, screen.height), sh = Math.max(screen.width, screen.height);
    var dpr = window.devicePixelRatio || 1;
    var row = null;
    for (var i = 0; i < CD.SCREENS.length; i++) {
      var r = CD.SCREENS[i];
      if (r.w === sw && r.h === sh && Math.abs(r.dpr - dpr) < 0.5) { row = r; break; }
    }
    if (!row) return null;
    var cand = row.models.slice();
    var rear = cams.filter(function (d) { return isRear(d.label); });
    var labeled = rear.some(function (d) { return !!d.label; });   // 라벨은 권한 허용 후에만
    if (labeled) {
      var hasTele = rear.some(function (d) { return lensType(d.label) === "tele"; });
      var byPro = cand.filter(function (m) { return /pro/i.test(m) === hasTele; });
      if (byPro.length) cand = byPro;
    }
    return cand[0] || null;
  }

  function applyModelRef() {
    if (!detectedModel) return;
    var lens = streamInfo.label ? lensType(streamInfo.label) : "ultra";
    var i = phoneForModelLens(detectedModel, lens);
    if (i < 0) return;
    state.ref = i; refSel.value = String(i);
    hasSavedRef = true; saveCam(); scheduleRender();
  }

  function updateModelHint(cams) {
    detectedModel = detectModel(cams);
    if (!modelHintEl) return;
    if (!detectedModel) { modelHintEl.hidden = true; return; }
    modelHintEl.innerHTML = "";
    modelHintEl.appendChild(document.createTextNode("감지된 기기: " + detectedModel + " (추정) — "));
    var a = document.createElement("a");
    a.href = "#"; a.textContent = "기준 렌즈로 적용";
    a.addEventListener("click", function (ev) { ev.preventDefault(); applyModelRef(); });
    modelHintEl.appendChild(a);
    modelHintEl.hidden = false;
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
      if (!hasSavedRef) {   // 사용자가 기준을 안 골랐으면 (감지 모델의) 초광각 기본
        var i = detectedModel ? phoneForModelLens(detectedModel, "ultra") : -1;
        if (i < 0) i = findPhone(function (n) { return /초광각/.test(n); });
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

  /* ---------- 렌즈 실측 보정 진입 ----------
     측정·UI는 camera-calib.js(CamCalib) 소관. 스트림·영속화 소유권은 여기 유지. */
  if (calibBtn) {
    calibBtn.disabled = true;
    calibBtn.addEventListener("click", function () {
      if (!stream || !window.CamCalib) return;
      window.CamCalib.open({
        getVideoRect: videoRect,
        getStreamInfo: function () { updateStreamInfo(); return streamInfo; },
        getCamFov: function () { var r = videoRect(); return resolveFOV(r.vw, r.vh); },
        getModel: function () { return detectedModel; },
        onSave: function (entry) {
          // 같은 렌즈(deviceId 우선, 없으면 label)의 기존 실측을 교체
          state.calib = state.calib.filter(function (e) {
            if (entry.deviceId && e.deviceId) return e.deviceId !== entry.deviceId;
            return e.label !== entry.label;
          });
          state.calib.push(entry);
          state.corr = 1;                    // 기존 트림은 추정 오차 보상이었으므로 리셋
          corrRange.value = "1"; updateCorrLabel();
          saveCam(); scheduleRender();
        }
      });
    });
  }

  /* ---------- 초기 렌더 ---------- */
  measure();
  render();
})();
