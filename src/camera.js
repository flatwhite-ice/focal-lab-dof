/* Focal Lab · 카메라 화각 오버레이 와이어링.
   convert.js(Convert), formats.js(FORMATS) 의존. 라이브뷰 위에 환산 포맷 / 풀프레임
   프레이밍 가이드를 canvas로 그린다. 각도는 전부 Convert.aov 등 순수 엔진으로 계산. */
(function () {
  "use strict";

  var C = window.Convert;
  var $ = function (id) { return document.getElementById(id); };
  var RAD = Math.PI / 180;

  var fmtSel = $("cam-format"), noteEl = $("cam-format-note");
  var focalNum = $("cam-focal"), focalRange = $("cam-focal-range");
  var calRange = $("cam-cal"), calVal = $("cam-cal-val");
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

  /* ---------- 상태 & 영속화 (메인 앱과 공유) ---------- */
  var INPUTS_KEY = "focal-lab-inputs";   // 포맷·초점 (app.js와 동일)
  var CAM_KEY = "focal-lab-cam";         // 기준 카메라 보정값(환산 초점거리)

  var clampFocal = function (v) { return Math.min(600, Math.max(1, v)); };
  var clampCal = function (v) { return Math.min(80, Math.max(10, v)); };

  var state = { fmtId: "6x6", focal: 80, camEquiv: 26 };
  var hasSavedCam = false;   // 사용자가 보정값을 저장한 적 있으면 자동선택이 덮어쓰지 않음

  (function loadState() {
    try {
      var s = JSON.parse(localStorage.getItem(INPUTS_KEY));
      if (s && INDEX[s.format]) state.fmtId = s.format;
      if (s && isFinite(parseFloat(s.focal))) state.focal = clampFocal(parseFloat(s.focal));
    } catch (e) {}
    try {
      var cam = parseFloat(localStorage.getItem(CAM_KEY));
      if (isFinite(cam)) { state.camEquiv = clampCal(cam); hasSavedCam = true; }
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
  focalNum.value = state.focal;
  focalRange.value = state.focal;
  calRange.value = state.camEquiv;

  /* ---------- 메타 표기 (포맷 주석 · 핸들 요약) ---------- */
  function curFmt() { return INDEX[state.fmtId] || INDEX["6x6"]; }
  function updateNote() {
    var f = curFmt();
    noteEl.textContent = f.note ? (f.est ? "추정 · " : "") + f.note : "";
  }
  function updateSummary() {
    summaryEl.textContent = curFmt().name + " · " + state.focal + "mm";
  }
  updateNote(); updateSummary();

  /* ---------- 카메라 화각(기준) ----------
     camEquiv(환산 초점거리)로 카메라 전체 프레임의 화각을 구한 뒤,
     object-fit: cover 크롭을 반영해 "화면에 실제 보이는" 수평/수직 화각을 산출.
     모든 위치는 tan(각도)에 선형이므로 크롭은 tan 값에 비례 적용. */
  function cameraFOV(W, H) {
    var aScreen = W / H;
    var vW = video.videoWidth, vH = video.videoHeight;
    var aVideo = (vW && vH) ? vW / vH : aScreen;     // 영상 없으면 화면비로 폴백
    // 모바일: 가로 영상이 세로 화면에 회전 표시되는 경우가 많음 → 방향 정규화
    if ((aVideo > 1) !== (aScreen > 1)) aVideo = 1 / aVideo;

    var diagFOV = C.aov(C.FF_DIAG, state.camEquiv);  // 대각 화각(도)
    var halfDiagTan = Math.tan(diagFOV / 2 * RAD);
    // 전체 영상 프레임의 h/v (영상 종횡비 기준)
    var tanFullH = halfDiagTan * aVideo / Math.hypot(aVideo, 1);
    var tanFullV = halfDiagTan / Math.hypot(aVideo, 1);
    // cover 크롭 → 보이는 FOV (넓은 쪽이 잘림)
    var tanVisH, tanVisV;
    if (aVideo >= aScreen) { tanVisH = tanFullH * (aScreen / aVideo); tanVisV = tanFullV; }
    else { tanVisH = tanFullH; tanVisV = tanFullV * (aVideo / aScreen); }
    return { h: 2 * Math.atan(tanVisH) / RAD, v: 2 * Math.atan(tanVisV) / RAD };
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
    // 보정 슬라이더 라벨에 실제 보이는 가로 화각 표기 (캘리브레이션 참고)
    calVal.textContent = state.camEquiv + "mm · 가로 " + cam.h.toFixed(0) + "°";

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

  /* ---------- 입력 와이어링 (환산기 콤보 패턴) ---------- */
  function onInputChange() { updateSummary(); saveInputs(); scheduleRender(); }

  fmtSel.addEventListener("change", function () {
    state.fmtId = fmtSel.value;
    updateNote(); onInputChange();
  });
  // 숫자입력 ↔ 슬라이더 양방향 (app.js link() 패턴)
  focalNum.addEventListener("input", function () {
    var v = parseFloat(focalNum.value);
    if (isFinite(v)) { state.focal = clampFocal(v); focalRange.value = state.focal; }
    onInputChange();
  });
  focalRange.addEventListener("input", function () {
    state.focal = clampFocal(parseFloat(focalRange.value));
    focalNum.value = state.focal;
    onInputChange();
  });
  calRange.addEventListener("input", function () {
    state.camEquiv = clampCal(parseFloat(calRange.value));
    hasSavedCam = true;
    saveCam(); scheduleRender();   // calVal은 render에서 갱신
  });

  // 패널 접기/펼치기
  handle.addEventListener("click", function () {
    var collapsed = panel.classList.toggle("is-collapsed");
    handle.setAttribute("aria-expanded", String(!collapsed));
  });

  window.addEventListener("resize", function () { measure(); scheduleRender(); });
  window.addEventListener("orientationchange", function () {
    setTimeout(function () { measure(); scheduleRender(); }, 250);
  });

  /* ---------- 카메라 시작 / 렌즈 전환 ---------- */
  var stream = null, currentDeviceId = null, currentLabel = "", autoPicked = false;

  // 보정값을 환산 초점거리로 자동 설정 — 저장하지 않음(저장은 사용자 수동 조절 때만).
  // 이렇게 해야 다음 방문에도 '렌즈에 맞춘 자동값'이 우선되고, 수동 미세조정만 영속화됨.
  function applyCal(equiv) {
    state.camEquiv = clampCal(equiv);
    calRange.value = state.camEquiv;
    scheduleRender();
  }

  function showMsg(text, btnLabel) {
    msgText.textContent = text;
    startBtn.hidden = !btnLabel;
    if (btnLabel) startBtn.textContent = btnLabel;
    msg.hidden = false;
  }

  function stopStream() {
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
  }

  // 렌즈 라벨에서 환산 초점거리 추정 (전환 시 보정값 기본값으로 사용)
  function guessEquiv(label) {
    var l = (label || "").toLowerCase();
    if (l.indexOf("ultra") >= 0 || l.indexOf("초광각") >= 0) return 13;   // 0.5× 초광각
    if (l.indexOf("tele") >= 0 || l.indexOf("망원") >= 0) return 77;       // 망원
    return 26;                                                             // 광각/메인 기본
  }

  // deviceId 지정 시 해당 렌즈로, 없으면 후면 카메라. autoCal=true면 렌즈에 맞춰 보정값 갱신.
  function startCamera(deviceId, autoCal) {
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
      showMsg("이 브라우저는 카메라를 지원하지 않거나 보안 컨텍스트(HTTPS/localhost)가 아닙니다. 가이드 수치는 계속 확인할 수 있어요.", null);
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
      currentLabel = (track && track.label) || "";
      if (autoCal) applyCal(guessEquiv(currentLabel));
      populateDevices();
      // 최초(후면 기본) 시작이면 가장 넓은 렌즈로 자동 전환
      if (deviceId === undefined) autoSelectWidest();
      measure(); render();
    }).catch(function (err) {
      var name = err && err.name;
      var t = "카메라를 시작할 수 없습니다.";
      if (name === "NotAllowedError" || name === "SecurityError") t = "카메라 권한이 거부되었습니다. 브라우저 설정에서 허용 후 다시 시도하세요.";
      else if (name === "NotFoundError" || name === "OverconstrainedError") t = "선택한 렌즈/카메라를 사용할 수 없습니다.";
      showMsg(t + " (가이드 수치는 계속 확인 가능)", "다시 시도");
    });
  }

  // 권한 허용 후 사용 가능한 카메라(렌즈) 목록 → 2개 이상이면 선택 노출
  function populateDevices() {
    if (!(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices)) return;
    navigator.mediaDevices.enumerateDevices().then(function (list) {
      var cams = list.filter(function (d) { return d.kind === "videoinput"; });
      if (cams.length <= 1) { devField.hidden = true; return; }
      devSel.innerHTML = "";
      cams.forEach(function (d, i) {
        var o = document.createElement("option");
        o.value = d.deviceId;
        o.textContent = d.label || ("카메라 " + (i + 1));
        devSel.appendChild(o);
      });
      if (currentDeviceId) devSel.value = currentDeviceId;
      devField.hidden = false;
    }).catch(function () {});
  }

  // 시작 후 한 번: 사용 가능한 가장 넓은(초광각) 후면 렌즈로 자동 전환
  function autoSelectWidest() {
    if (autoPicked) return;
    autoPicked = true;
    if (!(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices)) return;
    navigator.mediaDevices.enumerateDevices().then(function (list) {
      var ultra = list.filter(function (d) {
        return d.kind === "videoinput" && /ultra|초광각/i.test(d.label);
      });
      if (ultra.length && ultra[0].deviceId && ultra[0].deviceId !== currentDeviceId) {
        startCamera(ultra[0].deviceId, !hasSavedCam);   // 초광각으로 전환 (보정 자동, 저장값은 보호)
      } else if (!hasSavedCam) {
        applyCal(guessEquiv(currentLabel));             // 이미 최광각 → 현재 렌즈로 보정 추정
      }
    }).catch(function () {});
  }

  devSel.addEventListener("change", function () { startCamera(devSel.value, true); });
  startBtn.addEventListener("click", function () { startCamera(); });
  // 영상 메타데이터/크기 확정 시 정확한 종횡비로 다시 그림
  video.addEventListener("loadedmetadata", function () { measure(); render(); });

  // 페이지를 떠날 때 트랙 정리
  window.addEventListener("pagehide", stopStream);

  /* ---------- 초기 렌더 (영상 없이도 가이드/수치 표시) ---------- */
  measure();
  render();
})();
