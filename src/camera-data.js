/* Focal Lab · 카메라 페이지 전용 데이터.
   formats.js(스펙 역산·est)와 분리: 여기는 '실측' 비디오 스트림 화각과
   기기 추정 휴리스틱만 둔다. window.CameraData 로 노출. */
(function (global) {
  "use strict";

  global.CameraData = {
    /* 실측 비디오 스트림 화각 테이블.
       getUserMedia 비디오는 스틸 사진과 화각이 다르다(EIS 마진·리드아웃·왜곡보정).
       camera.html 의 "렌즈 실측 보정" 확인 화면이 등재용 항목을 그대로 출력한다.
       - fovLong : 줌 1 기준 영상 '장변' 화각(도)
       - lens    : ultra | wide | tele | front
       - aspect  : 측정 당시 스트림 종횡비 버킷("16:9" | "4:3")
       예: { model: "iPhone 17 Pro", lens: "ultra", aspect: "16:9", fovLong: 104.8, note: "실측 2026-06" } */
    VIDEO_FOV: [
    ],

    /* 모델 자동 추정: 논리 해상도(세로 기준 w<h) + devicePixelRatio → 후보 모델.
       후보가 여럿이면 후면 망원 렌즈 유무(Pro 여부)·후면 카메라 수로 압축한다. */
    SCREENS: [
      { w: 402, h: 874, dpr: 3, models: ["iPhone 17 Pro", "iPhone 17", "iPhone 16 Pro"] },
      { w: 440, h: 956, dpr: 3, models: ["iPhone 17 Pro / Max", "iPhone 16 Pro / Max"] },
      { w: 420, h: 912, dpr: 3, models: ["iPhone 17 Air"] },
      { w: 393, h: 852, dpr: 3, models: ["iPhone 16", "iPhone 15 Pro", "iPhone 15", "iPhone 14 Pro"] },
      { w: 430, h: 932, dpr: 3, models: ["iPhone 16 / Plus", "iPhone 15 Pro / Max", "iPhone 15 / Plus", "iPhone 14 Pro / Max"] },
      { w: 390, h: 844, dpr: 3, models: ["iPhone 16e", "iPhone 14", "iPhone 13", "iPhone 12"] },
      { w: 428, h: 926, dpr: 3, models: ["iPhone 14 / Plus", "iPhone 13 Pro / Max", "iPhone 12 Pro Max"] },
      { w: 375, h: 812, dpr: 3, models: ["iPhone 13 / mini", "iPhone 12 / mini", "iPhone 11 Pro", "iPhone X"] },
      { w: 414, h: 896, dpr: 3, models: ["iPhone 11 Pro / Max", "iPhone XS / XS Max"] },
      { w: 414, h: 896, dpr: 2, models: ["iPhone 11", "iPhone XR"] },
      { w: 414, h: 736, dpr: 3, models: ["iPhone 8 Plus", "iPhone 7 Plus"] },
      { w: 375, h: 667, dpr: 2, models: ["iPhone SE (2·3세대)", "iPhone 8", "iPhone 7", "iPhone 6s / 6s Plus"] },
      { w: 320, h: 568, dpr: 2, models: ["iPhone SE (1세대)", "iPhone 5s", "iPhone 5 / 5c"] }
    ]
  };
})(typeof window !== "undefined" ? window : globalThis);
