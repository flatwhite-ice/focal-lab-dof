/* photologs — 공통 헤더/푸터 주입
   사용: <script src="<경로>/shared/nav.js" data-home="../" data-brand="photologs"></script>
   data-home : 브랜드 클릭 시 이동할 메인(릴리즈) 경로
   data-brand: 사이트 제목 (기본 "photologs") */
(function () {
  var script = document.currentScript;
  var home = (script && script.dataset.home) || "./";
  var brand = (script && script.dataset.brand) || "photologs";

  var sun =
    '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></svg>';
  var moon =
    '<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  var header = document.createElement("header");
  header.className = "site-header";
  header.innerHTML =
    '<a class="site-header__brand" href="' + home + '">' + brand + "</a>" +
    '<span class="site-header__spacer"></span>' +
    '<button class="theme-toggle" type="button" aria-label="테마 전환" title="라이트/다크 전환">' +
    sun + moon +
    "</button>";

  document.body.insertBefore(header, document.body.firstChild);

  header.querySelector(".theme-toggle").addEventListener("click", function () {
    if (window.PhotologsTheme) window.PhotologsTheme.toggle();
  });

  // 푸터 — 본문(<main> 등)이 모두 파싱된 뒤 맨 끝에 추가
  function addFooter() {
    var footer = document.createElement("footer");
    footer.className = "site-footer";
    footer.innerHTML = "© " + new Date().getFullYear() + " " + brand;
    document.body.appendChild(footer);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addFooter);
  } else {
    addFooter();
  }
})();
