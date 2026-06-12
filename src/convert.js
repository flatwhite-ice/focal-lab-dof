/* Focal Lab · 환산 엔진 — 순수 함수 (DOM 의존 없음, Node 테스트 가능)
   기준 포맷: 135 풀프레임 36×24mm. 모든 값은 mm 기준, 거리만 m. */
(function (global) {
  "use strict";

  var FF = { w: 36, h: 24 };
  var FF_DIAG = Math.hypot(FF.w, FF.h); // 43.2666...

  function diag(fmt) { return Math.hypot(fmt.w, fmt.h); }

  // 크롭 팩터: 135 대각 / 포맷 대각. (대형·중형 <1, 크롭·폰 >1)
  function cropFactor(fmt) { return FF_DIAG / diag(fmt); }

  // 환산 초점거리(대각 기준) / 환산 조리개(심도·배경흐림 등가)
  function equivFocal(focal, fmt) { return focal * cropFactor(fmt); }
  function equivAperture(N, fmt) { return N * cropFactor(fmt); }

  // 화각(도): 어떤 변의 길이 d(mm)와 초점 f(mm)
  function aov(d, focal) { return 2 * Math.atan(d / (2 * focal)) * 180 / Math.PI; }

  // 캘리브레이션: 폭 t(mm) 목표물이 거리 d(mm)에서 프레임 폭의 frac(0..1]을 차지할 때
  // 카메라 수평 화각(도). tan(cam/2) = tan(θ/2)/frac, θ = 2·atan(t/2d) → aov(t/frac, d)와 동치.
  function fovFromTarget(targetMm, distMm, frac) { return aov(targetMm / frac, distMm); }

  // 디지털 줌을 화각에 적용(tan-공간): zoom>1 → 좁아짐. 해제는 1/zoom을 넘겨 재사용.
  function zoomFov(fovDeg, zoom) {
    return 2 * Math.atan(Math.tan(fovDeg * Math.PI / 360) / zoom) * 180 / Math.PI;
  }

  // 장변 화각(도) + 프레임 종횡비(장:단) → 단변 화각(도)
  function shortFov(fovLongDeg, aspect) {
    return 2 * Math.atan(Math.tan(fovLongDeg * Math.PI / 360) / aspect) * 180 / Math.PI;
  }

  // 네이티브 포맷의 수평/수직/대각 화각
  function angles(focal, fmt) {
    return { h: aov(fmt.w, focal), v: aov(fmt.h, focal), d: aov(diag(fmt), focal) };
  }

  // 착란원(CoC): 포맷 대각 / 1500
  function coc(fmt) { return diag(fmt) / 1500; }

  // 실제 심도. focal·N(조리개)·distM(초점거리 m)·fmt → 과초점/근점/원점/심도폭(m)
  // 교과서 정확식: H = f²/(N·c) + f, Dn = s(H−f)/(H+s−2f), Df = s(H−f)/(H−s) (s ≥ H → ∞)
  function dof(focal, N, distM, fmt) {
    var c = coc(fmt);
    var f = focal;
    var H = (f * f) / (N * c) + f;                  // 과초점거리 (mm)
    var s = distM * 1000;                           // 초점거리 (mm)
    var near = (s * (H - f)) / (H + s - 2 * f);
    var far = (H - s) <= 0 ? Infinity : (s * (H - f)) / (H - s);
    return {
      coc: c,
      hyperfocal: H / 1000,
      near: near / 1000,
      far: far === Infinity ? Infinity : far / 1000,
      total: far === Infinity ? Infinity : (far - near) / 1000
    };
  }

  var api = {
    FF: FF, FF_DIAG: FF_DIAG,
    diag: diag, cropFactor: cropFactor,
    equivFocal: equivFocal, equivAperture: equivAperture,
    aov: aov, angles: angles, coc: coc, dof: dof,
    fovFromTarget: fovFromTarget, zoomFov: zoomFov, shortFov: shortFov
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.Convert = api;
})(typeof window !== "undefined" ? window : globalThis);
