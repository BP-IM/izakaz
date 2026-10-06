(function () {
  const STORAGE_KEY = "izakaz-theme";

  /* =====================================================
     ПОЛУЧЕНИЕ СОХРАНЕННОЙ ТЕМЫ
  ===================================================== */

  function getSavedTheme() {
    const savedTheme =
      localStorage.getItem(STORAGE_KEY);

    if (
      savedTheme === "dark" ||
      savedTheme === "light"
    ) {
      return savedTheme;
    }

    return "light";
  }


  /* =====================================================
     ПРИМЕНЕНИЕ ТЕМЫ
  ===================================================== */

  function applyTheme(theme) {
    document.documentElement.setAttribute(
      "data-theme",
      theme
    );

    updateThemeButton(theme);
  }


  /* =====================================================
     ОБНОВЛЕНИЕ КНОПКИ
  ===================================================== */

  function updateThemeButton(theme) {
    const button =
      document.getElementById("theme-toggle");

    if (!button) {
      return;
    }

    const isDark =
      theme === "dark";

    button.innerHTML = `
      <span class="theme-toggle-icon">
        ${isDark ? "☀" : "☾"}
      </span>

      <span class="theme-toggle-text">
        ${isDark
          ? "Светлая тема"
          : "Тёмная тема"}
      </span>
    `;

    button.setAttribute(
      "aria-label",
      isDark
        ? "Включить светлую тему"
        : "Включить тёмную тему"
    );
  }


  /* =====================================================
     ПЕРЕКЛЮЧЕНИЕ ТЕМЫ
  ===================================================== */

  function toggleTheme() {
    const currentTheme =
      document.documentElement.getAttribute(
        "data-theme"
      );

    const nextTheme =
      currentTheme === "dark"
        ? "light"
        : "dark";

    localStorage.setItem(
      STORAGE_KEY,
      nextTheme
    );

    applyTheme(nextTheme);
  }


  /* =====================================================
     СОЗДАНИЕ КНОПКИ
  ===================================================== */

  function createThemeButton() {
    /*
      Если кнопка уже существует,
      повторно ее не создаем.
    */

    if (
      document.getElementById(
        "theme-toggle"
      )
    ) {
      return true;
    }


    /*
      Sidebar создается через sidebar.js,
      поэтому ищем его footer.
    */

    const sidebarFooter =
      document.querySelector(
        ".sidebar-footer"
      );

    const logoutButton =
      document.getElementById(
        "sidebar-logout-button"
      );


    /*
      Sidebar еще не успел загрузиться.
    */

    if (
      !sidebarFooter ||
      !logoutButton
    ) {
      return false;
    }


    /* Создаем кнопку */

    const button =
      document.createElement("button");

    button.id =
      "theme-toggle";

    button.className =
      "theme-toggle";

    button.type =
      "button";


    /* Переключение */

    button.addEventListener(
      "click",
      toggleTheme
    );


    /*
      Ставим кнопку
      перед кнопкой "Выйти".
    */

    sidebarFooter.insertBefore(
      button,
      logoutButton
    );


    /* Показываем правильный текст */

    updateThemeButton(
      document.documentElement
        .getAttribute("data-theme") ||
      "light"
    );

    return true;
  }


  /* =====================================================
     ПЕРВИЧНОЕ ПРИМЕНЕНИЕ ТЕМЫ
  ===================================================== */

  applyTheme(
    getSavedTheme()
  );


  /* =====================================================
     SIDEBAR МОЖЕТ ПОЯВИТЬСЯ ПОЗЖЕ
  ===================================================== */

  if (!createThemeButton()) {

    const observer =
      new MutationObserver(function () {

        const created =
          createThemeButton();

        if (created) {
          observer.disconnect();
        }

      });


    observer.observe(
      document.body,
      {
        childList: true,
        subtree: true
      }
    );

  }

})();