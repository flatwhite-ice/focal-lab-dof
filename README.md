# Focal Lab

사진가용 **카메라 포맷 환산기** — 임의의 필름/센서 포맷 + 초점거리 + 조리개를
**135 풀프레임 기준**의 환산 화각·환산 조리개(심도 등가)와 실제 심도로 실시간 변환.

> 예) 6×12에서 58mm f/5.6 → **환산 20mm f/1.9 (FF)**

빌드 없는 **순수 정적 웹앱**(HTML/CSS/JS). GitHub Pages 루트 배포.

## 구성
```
index.html       앱 셸
src/convert.js   환산 엔진 (순수 함수, DOM 무관)
src/formats.js   포맷 데이터시트 (소형~대형 필름, 중형 디지털백, APS, 1인치, 아이폰 전 기종)
src/app.js       UI 와이어링 (실시간 계산 · 포맷/화각 시각화)
src/app.css      앱 스타일
shared/          공유 자산 (style.css 디자인토큰·다크모드, theme.js, nav.js)
.nojekyll        GitHub Pages Jekyll 비활성
```
상세 사양·환산 수학·데이터 출처·로드맵: [SPEC.md](SPEC.md)

## 로컬 실행
`fetch`/모듈 로드 때문에 로컬 서버가 필요합니다. **저장소 루트**에서:
```bash
python3 -m http.server 8000
# http://127.0.0.1:8000/
```

## 배포 (GitHub Pages)
1. GitHub에서 빈 **공개** 저장소 `focal-lab-dof` 생성 (README/license 없이).
2. 푸시:
   ```bash
   git remote add origin https://github.com/flatwhite-ice/focal-lab-dof.git
   git branch -M main
   git push -u origin main
   ```
3. 저장소 **Settings → Pages → Source**: `Deploy from a branch`, Branch **`main` / `/ (root)`** → Save.
4. 약 1분 후 **https://flatwhite-ice.github.io/focal-lab-dof/** 에서 확인.

> `shared/`는 photologs 사이트에서 벤더링한 사본입니다. 원본 변경 시 수동으로 동기화하세요.
