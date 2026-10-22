/* =====================================================
   IZAKAZ v0.2.0
   SPA PAGE LOADER
===================================================== */

(function () {
  "use strict";


  /* =====================================================
     PAGE CONTAINER
  ===================================================== */

  const pageContainer =
    document.getElementById(
      "page-container"
    );


  if (!pageContainer) {
    console.error(
      "Не найден элемент #page-container"
    );

    return;
  }


  /* =====================================================
     NAVIGATION CONFIG
  ===================================================== */

  const navigation =
    window.IZAKAZ_NAVIGATION;


  if (
    !navigation ||
    !navigation.routes
  ) {
    console.error(
      "Не найден IZAKAZ_NAVIGATION.routes"
    );

    return;
  }


  const routes =
    navigation.routes;


  /* =====================================================
     LEGACY ROUTES
     
     Старые ссылки временно продолжают работать.
     Позже, когда весь проект перейдет на новые route,
     этот блок можно удалить.
  ===================================================== */

  const legacyRoutes = {
    inventory:
      "inventory-daily",

    "inventory-lists":
      "inventory-weekly",

    order:
      "order-cola",

    deliveries:
      "deliveries-cola",

    settings:
      "settings-delivery"
  };


  /* =====================================================
     RESOLVE ROUTE
  ===================================================== */

  function resolveRoute(route) {
    if (routes[route]) {
      return route;
    }


    if (
      legacyRoutes[route] &&
      routes[legacyRoutes[route]]
    ) {
      return legacyRoutes[route];
    }


    return "home";
  }


  /* =====================================================
     CURRENT ROUTE + PARAMS
  ===================================================== */

  function getRouteState() {
    const rawHash =
      window.location.hash
        .replace(/^#/, "")
        .trim();


    if (!rawHash) {
      return {
        route: "home",
        originalRoute: "home",
        params: []
      };
    }


    const parts =
      rawHash
        .split("/")
        .filter(Boolean);


    const originalRoute =
      parts[0] ||
      "home";


    const route =
      resolveRoute(
        originalRoute
      );


    const params =
      parts.slice(1);


    return {
      route,
      originalRoute,
      params
    };
  }


  /* =====================================================
     DOCUMENT TITLE
  ===================================================== */

  function updateDocumentTitle(
    page
  ) {
    const pageTitle =
      page?.title ||
      "Главная";


    document.title =
      `I’M | Заказ — ${pageTitle}`;
  }


  /* =====================================================
     LOADING
  ===================================================== */

  function showLoading() {
    pageContainer.innerHTML = `
      <div class="page-loading" role="status" aria-live="polite">
        <span class="app-module-loader" aria-hidden="true"></span>
        <strong class="app-module-loading-title">Загрузка страницы…</strong>
        <span class="app-module-loading-note">Подготавливаем раздел</span>
      </div>
    `;
  }


  /* =====================================================
     PAGE DATA OVERLAY

     Routed fragments render their header first, then keep this overlay over
     the content area until their asynchronous data has arrived.
  ===================================================== */

  function hideDataLoading(host) {
    if (!host) return;
    host.querySelector(":scope > .app-page-data-loading")?.remove();
    host.removeAttribute("aria-busy");
  }

  function showDataLoading(host, message) {
    if (!host) return;

    hideDataLoading(host);

    host.classList.add("app-page-loading-host");
    host.setAttribute("aria-busy", "true");

    const overlay = document.createElement("div");
    overlay.className = "app-page-data-loading";
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "polite");
    overlay.innerHTML = `
      <span class="app-module-loader" aria-hidden="true"></span>
      <strong class="app-module-loading-title">${message || "Загрузка…"}</strong>
      <span class="app-module-loading-note">Подготавливаем данные</span>
    `;

    host.appendChild(overlay);
  }


  /* =====================================================
     COMING SOON
  ===================================================== */

  function showComingSoon(
    page
  ) {
    pageContainer.innerHTML = `
      <div class="temporary-content">

        <section class="temporary-card">

          <div>

            <div class="temporary-icon">
              +
            </div>

            <h2>
              ${page.title}
            </h2>

            <p>
              Раздел подготовлен в структуре
              izakaz v0.2.0.
              Функционал будет добавлен позже.
            </p>

            <span class="temporary-status">
              В разработке
            </span>

          </div>

        </section>

      </div>
    `;
  }


  /* =====================================================
     ERROR
  ===================================================== */

  function showError(
    page,
    error
  ) {
    console.error(
      "Ошибка загрузки страницы:",
      error
    );


    pageContainer.innerHTML = `
      <div class="temporary-content">

        <section class="temporary-card">

          <div>

            <div class="temporary-icon">
              !
            </div>

            <h2>
              Не удалось открыть страницу
            </h2>

            <p>
              Проверьте наличие файла:
              <strong>
                ${page?.file || "не указан"}
              </strong>
            </p>

            <span class="temporary-status">
              Ошибка загрузки
            </span>

          </div>

        </section>

      </div>
    `;
  }


  /* =====================================================
     PAGE STATE
     
     Другие модули смогут узнать:
     - текущий route
     - params
     - config страницы
     
     Например settings.js позже использует settingsTab.
  ===================================================== */

  function setCurrentPageState(
    route,
    params,
    page
  ) {
    window.IZAKAZ_CURRENT_PAGE = {
      route,
      params,
      config: page
    };
  }


  /* =====================================================
     PAGE LOADED EVENT
  ===================================================== */

  function dispatchPageLoaded(
    route,
    params,
    page
  ) {
    document.dispatchEvent(
      new CustomEvent(
        "app:page-loaded",
        {
          detail: {
            route,
            params,
            page
          }
        }
      )
    );
  }


  /* =====================================================
     LOAD HTML PAGE
  ===================================================== */

  async function loadHtmlPage(
    route,
    params,
    page
  ) {
    showLoading();


    try {
      const response =
        await fetch(
          page.file,
          {
            cache: "no-store"
          }
        );


      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        );
      }


      const html =
        await response.text();


      pageContainer.innerHTML =
        html;


      window.scrollTo({
        top: 0,
        behavior: "instant"
      });


      dispatchPageLoaded(
        route,
        params,
        page
      );


    } catch (error) {
      showError(
        page,
        error
      );
    }
  }


  /* =====================================================
     LOAD PAGE
  ===================================================== */

  async function loadPage() {
    const state =
      getRouteState();


    const route =
      state.route;


    const params =
      state.params;


    const page =
      routes[route] ||
      routes.home;


    setCurrentPageState(
      route,
      params,
      page
    );


    updateDocumentTitle(
      page
    );


    /*
      Пока функция не реализована,
      не пытаемся fetch(null).
    */

    if (
      page.implemented === false ||
      !page.file
    ) {
      showComingSoon(
        page
      );


      dispatchPageLoaded(
        route,
        params,
        page
      );


      return;
    }


    await loadHtmlPage(
      route,
      params,
      page
    );
  }


  /* =====================================================
     ROUTING
  ===================================================== */

  window.addEventListener(
    "hashchange",
    loadPage
  );


  /* =====================================================
     PUBLIC API
  ===================================================== */

  window.IzakazRouter = {
    loadPage,

    getCurrentPage() {
      return (
        window.IZAKAZ_CURRENT_PAGE ||
        null
      );
    }
  };

  window.IzakazPageLoading = {
    show: showDataLoading,
    hide: hideDataLoading
  };


  /* =====================================================
     START
  ===================================================== */

  if (!window.location.hash) {
    window.location.hash =
      "home";
  } else {
    loadPage();
  }

})();
