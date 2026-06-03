/* photologs — 테마(라이트/다크) 토글
   FOUC 방지를 위해 <head>에서 가능한 한 일찍 로드할 것. */
(function () {
  var KEY = "photologs-theme";
  var root = document.documentElement;

  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function resolve() {
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) {}
    if (saved === "light" || saved === "dark") return saved;
    return systemPrefersDark() ? "dark" : "light";
  }

  function apply(theme) {
    root.setAttribute("data-theme", theme);
  }

  // 즉시 적용 (깜빡임 방지)
  apply(resolve());

  // 저장값이 없을 때 시스템 설정 변화를 따라감
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function (e) {
      var saved = null;
      try { saved = localStorage.getItem(KEY); } catch (err) {}
      if (saved !== "light" && saved !== "dark") apply(e.matches ? "dark" : "light");
    });
  }

  // 전역 토글 API (nav.js의 버튼이 호출)
  window.PhotologsTheme = {
    toggle: function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      apply(next);
      try { localStorage.setItem(KEY, next); } catch (e) {}
    },
    current: function () { return root.getAttribute("data-theme"); }
  };
})();
