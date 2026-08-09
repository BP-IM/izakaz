/* =====================================================
   ДИНАМИЧЕСКАЯ ЗАГРУЗКА СТРАНИЦ
===================================================== */

(function () {
  "use strict";


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
     СПИСОК СТРАНИЦ
  ===================================================== */

  const routes = {

    home: {
      file: "views/home.html",
      title: "Главная"
    },

    inventory: {
      file: "views/inventory.html",
      title: "Инвентаризация"
    },

    "inventory-lists": {
      file: "views/inventory-lists.html",
      title: "Списки инвентаризации"
    },

    order: {
      file: "views/order.html",
      title: "Еженедельный заказ"
    },

    deliveries: {
      file: "views/deliveries.html",
      title: "Поставки"
    },

    "delivery-sheet": {
      file: "views/delivery-sheet.html",
      title: "Лист поставки"
    },

    settings: {
      file: "views/settings.html",
      title: "Настройки"
    }

  };


  /* =====================================================
     ТЕКУЩИЙ ROUTE + PARAMS
  ===================================================== */

  function getRouteState() {

    const rawHash =
      window.location.hash
        .replace("#", "")
        .trim();


    if (!rawHash) {

      return {
        route: "home",
        params: []
      };

    }


    const parts =
      rawHash
        .split("/")
        .filter(Boolean);


    const route =
      parts[0];


    const params =
      parts.slice(1);


    if (!routes[route]) {

      return {
        route: "home",
        params: []
      };

    }


    return {
      route,
      params
    };

  }


  /* =====================================================
     SIDEBAR ACTIVE
  ===================================================== */

  function updateActiveMenu(route) {

    /*
      Лист поставки является
      дочерней страницей Поставок.
    */

    const sidebarRoute =
      route === "delivery-sheet"
        ? "deliveries"
        : route;


    document
      .querySelectorAll(
        ".nav-link"
      )
      .forEach(
        function (link) {

          link.classList.toggle(
            "active",
            link.dataset.route ===
              sidebarRoute
          );

        }
      );

  }


  /* =====================================================
     DOCUMENT TITLE
  ===================================================== */

  function updateDocumentTitle(route) {

    const pageTitle =
      routes[route]?.title ||
      "I’M | Заказ";


    document.title =
      `I’M | Заказ — ${pageTitle}`;

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
      routes[route];


    updateActiveMenu(
      route
    );


    updateDocumentTitle(
      route
    );


    pageContainer.innerHTML = `
      <div class="page-loading">
        Загрузка страницы...
      </div>
    `;


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
          `Ошибка загрузки: ${response.status}`
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


      document.dispatchEvent(
        new CustomEvent(
          "app:page-loaded",
          {
            detail: {
              route,
              params
            }
          }
        )
      );


    } catch (error) {

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
                  ${page.file}
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

  }


  /* =====================================================
     ROUTING
  ===================================================== */

  window.addEventListener(
    "hashchange",
    loadPage
  );


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