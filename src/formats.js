/* Focal Lab · 포맷 데이터시트
   각 엔트리: { id, name, w, h(mm), note?, est?, focal?, fnumber?, equiv?, ref? }
   - w,h : 노광 이미지 영역(mm). 화각/심도/크롭 계산의 단일 출처.
   - focal/fnumber/equiv : (주로 폰) 네이티브 렌즈값 → 선택 시 입력 프리필.
   - est  : 추정치(특히 아이폰; 애플 미공개). note 에 근거 표기.
   window.FORMATS (그룹 배열), window.FORMAT_NOTES (출처/주석) 로 노출. */
(function (global) {
  "use strict";

  var FF_DIAG = Math.hypot(36, 24); // 43.2666

  // 폰 카메라: 공개된 35mm 환산 초점거리(equiv)와 실초점거리(focal)에서
  // 크롭 → 대각 → (4:3 가정) w,h 역산. 화각/심도가 알려진 환산값과 일관되게 유지됨.
  function phone(name, equiv, focal, fnumber, note) {
    var crop = equiv / focal;
    var d = FF_DIAG / crop;
    return {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
      name: name,
      w: +(d * 0.8).toFixed(2),  // 4:3 → 대각의 0.8
      h: +(d * 0.6).toFixed(2),  // 4:3 → 대각의 0.6
      focal: focal, fnumber: fnumber, equiv: equiv,
      est: true, note: note || "환산 초점거리 기반 추정(센서 4:3)"
    };
  }

  var FORMATS = [
    {
      group: "소형 (135)",
      items: [
        { id: "ff135", name: "35mm 풀프레임 (기준)", w: 36, h: 24, ref: true }
      ]
    },
    {
      group: "APS / 1인치",
      items: [
        { id: "apsc", name: "APS-C (소니·니콘·후지)", w: 23.5, h: 15.6 },
        { id: "apsc-canon", name: "APS-C (캐논)", w: 22.3, h: 14.9 },
        { id: "apsh", name: "APS-H (캐논 1D)", w: 28.7, h: 19.0 },
        { id: "leica-m8", name: "Leica M8 (APS-H 1.33×)", w: 27, h: 18 },
        { id: "one-inch", name: '1인치 (RX100 등)', w: 13.2, h: 8.8 }
      ]
    },
    {
      group: "중형 (120 · 단변 56mm)",
      items: [
        { id: "645", name: "645 (6×4.5)", w: 56, h: 41.5 },
        { id: "6x6", name: "6×6", w: 56, h: 56 },
        { id: "6x7", name: "6×7", w: 56, h: 69 },
        { id: "6x8", name: "6×8", w: 56, h: 76 },
        { id: "6x9", name: "6×9", w: 56, h: 84 },
        { id: "6x12", name: "6×12 (파노라마)", w: 56, h: 112 },
        { id: "6x17", name: "6×17 (파노라마)", w: 56, h: 168 },
        { id: "6x24", name: "6×24 (파노라마)", w: 56, h: 224 }
      ]
    },
    {
      group: "중형 디지털백",
      items: [
        { id: "mfd-44x33", name: "44×33 (GFX·X·CFV-50c)", w: 43.8, h: 32.9 },
        { id: "mfd-49x37", name: "49×36.7 (CFV-39·CFV-50 CCD)", w: 49, h: 36.7 },
        { id: "mfd-ff", name: "645 디지털 풀프레임 (53.4×40)", w: 53.4, h: 40.0 }
      ]
    },
    {
      group: "대형 (시트필름 · 이미지 영역)",
      items: [
        { id: "4x5", name: '4×5"', w: 96, h: 120, note: "노광 이미지 영역(시트 외곽 102×127보다 작음)" },
        { id: "5x7", name: '5×7"', w: 120, h: 170 },
        { id: "8x10", name: '8×10"', w: 194, h: 245 },
        { id: "11x14", name: '11×14"', w: 270, h: 356 },
        { id: "4x10", name: '4×10" (파노라마)', w: 96, h: 245 },
        { id: "5x12", name: '5×12" (파노라마)', w: 120, h: 300 },
        { id: "7x17", name: '7×17" (파노라마)', w: 170, h: 430 },
        { id: "8x20", name: '8×20" (파노라마)', w: 194, h: 500 }
      ]
    },
    {
      group: "아이폰 (추정치 · 단일 카메라기)",
      items: [
        phone("iPhone 3G", 37, 3.85, 2.8, "구형, 환산 추정"),
        phone("iPhone 3GS", 37, 3.85, 2.8, "구형, 환산 추정"),
        phone("iPhone 4", 35, 3.85, 2.8, "구형, 환산 추정"),
        phone("iPhone 4S", 35, 4.28, 2.4, "구형, 환산 추정"),
        phone("iPhone 5 / 5c", 33, 4.12, 2.4),
        phone("iPhone 5s", 30, 4.12, 2.2),
        phone("iPhone 6 / 6 Plus", 29, 4.15, 2.2),
        phone("iPhone 6s / 6s Plus", 29, 4.15, 2.2),
        phone("iPhone SE (1세대)", 29, 4.15, 2.2),
        phone("iPhone 7 · 광각", 28, 3.99, 1.8),
        phone("iPhone 8 · 광각", 28, 3.99, 1.8),
        phone("iPhone SE (2·3세대) · 광각", 28, 3.99, 1.8),
        phone("iPhone XR · 광각", 26, 4.25, 1.8)
      ]
    },
    {
      group: "아이폰 (멀티카메라 · 광각/메인)",
      items: [
        phone("iPhone 7 Plus · 광각", 28, 3.99, 1.8),
        phone("iPhone 8 Plus · 광각", 28, 3.99, 1.8),
        phone("iPhone X · 광각", 28, 4.0, 1.8),
        phone("iPhone XS / XS Max · 광각", 26, 4.25, 1.8),
        phone("iPhone 11 · 광각", 26, 4.25, 1.8),
        phone("iPhone 11 Pro / Max · 광각", 26, 4.25, 1.8),
        phone("iPhone 12 / mini · 광각", 26, 4.2, 1.6),
        phone("iPhone 12 Pro · 광각", 26, 4.2, 1.6),
        phone("iPhone 12 Pro Max · 광각", 26, 5.1, 1.6, "대형 센서, 추정"),
        phone("iPhone 13 / mini · 광각", 26, 5.1, 1.6),
        phone("iPhone 13 Pro / Max · 광각", 26, 5.7, 1.5),
        phone("iPhone 14 / Plus · 광각", 26, 5.7, 1.5),
        phone("iPhone 14 Pro / Max · 메인(48MP)", 24, 6.86, 1.78),
        phone("iPhone 15 / Plus · 메인(48MP)", 26, 5.96, 1.6),
        phone("iPhone 15 Pro · 메인(48MP)", 24, 6.765, 1.78, "1/1.28″ 9.8×7.3 일치"),
        phone("iPhone 15 Pro Max · 메인(48MP)", 24, 6.765, 1.78),
        phone("iPhone 16 / Plus · 메인(48MP)", 26, 5.96, 1.6),
        phone("iPhone 16e · 메인(48MP)", 26, 5.96, 1.6),
        phone("iPhone 16 Pro / Max · 메인(48MP)", 24, 6.765, 1.78),
        phone("iPhone 17 · 메인(48MP)", 26, 5.96, 1.6),
        phone("iPhone 17 Air · 메인(48MP)", 26, 5.96, 1.6),
        phone("iPhone 17 Pro / Max · 메인(48MP)", 24, 6.765, 1.78)
      ]
    },
    {
      group: "아이폰 (멀티카메라 · 초광각 0.5×)",
      items: [
        phone("iPhone 11 · 초광각", 13, 1.54, 2.4),
        phone("iPhone 11 Pro / Max · 초광각", 13, 1.54, 2.4),
        phone("iPhone 12 / mini · 초광각", 13, 1.55, 2.4),
        phone("iPhone 12 Pro / Max · 초광각", 13, 1.55, 2.4),
        phone("iPhone 13 / mini · 초광각", 13, 1.55, 2.4),
        phone("iPhone 13 Pro / Max · 초광각", 13, 1.55, 1.8),
        phone("iPhone 14 / Plus · 초광각", 13, 1.55, 2.4),
        phone("iPhone 14 Pro / Max · 초광각", 13, 1.57, 2.2),
        phone("iPhone 15 / Plus · 초광각", 13, 1.55, 2.4),
        phone("iPhone 15 Pro / Max · 초광각", 13, 2.22, 2.2),
        phone("iPhone 16 / Plus · 초광각", 13, 1.55, 2.2),
        phone("iPhone 16 Pro / Max · 초광각(48MP)", 13, 2.22, 2.2),
        phone("iPhone 17 · 초광각(48MP)", 13, 1.55, 2.2),
        phone("iPhone 17 Pro / Max · 초광각(48MP)", 13, 2.22, 2.2)
      ]
    },
    {
      group: "아이폰 (멀티카메라 · 망원)",
      items: [
        phone("iPhone 7 Plus · 망원 2×", 56, 6.6, 2.8),
        phone("iPhone 8 Plus · 망원 2×", 56, 6.6, 2.8),
        phone("iPhone X · 망원 2×", 52, 6.0, 2.4),
        phone("iPhone XS / XS Max · 망원 2×", 52, 6.0, 2.4),
        phone("iPhone 11 Pro / Max · 망원 2×", 52, 6.0, 2.0),
        phone("iPhone 12 Pro · 망원 2×", 52, 6.0, 2.0),
        phone("iPhone 12 Pro Max · 망원 2.5×", 65, 7.5, 2.2),
        phone("iPhone 13 Pro / Max · 망원 3×", 77, 9.0, 2.8),
        phone("iPhone 14 Pro / Max · 망원 3×", 77, 9.0, 2.8),
        phone("iPhone 15 Pro · 망원 3×", 77, 9.0, 2.8),
        phone("iPhone 15 Pro Max · 망원 5×(테트라프리즘)", 120, 15.6, 2.8, "5x 폴디드, 추정"),
        phone("iPhone 16 Pro / Max · 망원 5×", 120, 15.6, 2.8, "5x 폴디드, 추정"),
        phone("iPhone 17 Pro / Max · 망원 4×(48MP)", 100, 14.6, 2.8, "4x 테트라프리즘, 추정")
      ]
    }
  ];

  var FORMAT_NOTES = [
    "기준 포맷은 135 풀프레임(36×24mm, 대각 43.27mm). 모든 환산은 이 기준입니다.",
    "크롭 팩터 = 43.27 ÷ 포맷 대각. 환산 초점거리 = 초점거리 × 크롭, 환산 조리개 = f값 × 크롭(심도·배경흐림 등가).",
    "중형은 모두 단변 56mm(120 필름 노광폭). 6×7·6×9 등 장변은 실제 노광 기준값입니다.",
    "대형은 시트 외곽이 아닌 노광 이미지 영역(mm)입니다. 카메라/홀더에 따라 다소 차이가 있습니다.",
    "중형 디지털백: 44×33(43.8×32.9)은 Fujifilm GFX·핫셀블라드 X/CFV-50c·II 50C·Pentax 645Z 등, 49×36.7은 CCD 백(핫셀블라드 CFV-39·CFV-50 CCD, Kodak KAF-39000/50100), 53.4×40은 Phase One IQ4·핫셀블라드 H6D-100c·X2D 등 ‘디지털 풀프레임 645’.",
    "아이폰 센서 실치수는 애플이 공식 공개하지 않습니다. 여기서는 공개된 35mm 환산 초점거리와 실초점거리로부터 크롭을 역산하고 4:3 비율로 센서 크기를 추정했습니다(‘추정’ 표기). 화각·심도 결과는 알려진 환산값과 일관됩니다.",
    "실제 심도의 착란원(CoC)은 포맷 대각 ÷ 1500을 사용합니다. (관행에 따라 0.029~0.030mm 등으로 잡으면 값이 달라집니다.)",
    "출처: Apple 기술 사양 및 EXIF 환산 초점거리, DPReview·Wikipedia 분해 추정치, 필름 포맷 규격(120/시트필름)."
  ];

  global.FORMATS = FORMATS;
  global.FORMAT_NOTES = FORMAT_NOTES;
})(typeof window !== "undefined" ? window : globalThis);
