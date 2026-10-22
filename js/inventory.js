/* =====================================================
   IZAKAZ v0.2.0
   INVENTORY MODULE LOADER
===================================================== */

(function () {
  "use strict";


  /* =====================================================
     MODULES
  ===================================================== */

  const INVENTORY_MODULES = {

    count: {

      title:
        "Проведение инвентаризации",

      html:
        "./views/inventory/count/count.html",

      css:
        "./views/inventory/count/count.css",

      js:
        "./views/inventory/count/count.js",

      module:
        "InventoryCount"

    },


    lists: {

      title:
        "Списки инвентаризации",

      html:
        "./views/inventory/lists/lists.html",

      css:
        "./views/inventory/lists/lists.css",

      js:
        "./views/inventory/lists/lists.js",

      module:
        "InventoryLists"

    }

  };


  /* =====================================================
     LOADED RESOURCES
  ===================================================== */

  const loadedScripts =
    new Set();


  const loadedStyles =
    new Set();


  /* =====================================================
     CURRENT MODULE
  ===================================================== */

  function getCurrentModule() {

    return (
      window
        .IZAKAZ_CURRENT_PAGE
        ?.config
        ?.inventoryTab
      ||
      "count"
    );

  }


  /* =====================================================
     LOAD CSS
  ===================================================== */

  function loadStyle(path) {

    if (
      loadedStyles.has(path)
    ) {
      return;
    }


    const link =
      document.createElement(
        "link"
      );


    link.rel =
      "stylesheet";


    link.href =
      path;


    document.head.appendChild(
      link
    );


    loadedStyles.add(
      path
    );

  }


  function refreshThemeOverrides() {

    document
      .getElementById(
        "dynamic-theme-overrides"
      )
      ?.remove();


    const link =
      document.createElement(
        "link"
      );


    link.id =
      "dynamic-theme-overrides";

    link.rel =
      "stylesheet";

    link.href =
      "../css/dynamic-theme.css";

    document.head.appendChild(
      link
    );

  }


  /* =====================================================
     LOAD JS
  ===================================================== */

  function loadScript(path) {

    return new Promise(
      function (
        resolve,
        reject
      ) {

        /*
          JS уже загружен
        */

        if (
          loadedScripts.has(path)
        ) {

          resolve();

          return;

        }


        const script =
          document.createElement(
            "script"
          );


        script.src =
          path;


        script.onload =
          function () {

            loadedScripts.add(
              path
            );


            resolve();

          };


        script.onerror =
          function () {

            reject(
              new Error(
                `Не удалось загрузить ${path}`
              )
            );

          };


        document.body.appendChild(
          script
        );

      }
    );

  }


  /* =====================================================
     LOAD INVENTORY MODULE
  ===================================================== */

  async function loadInventoryModule() {

    const container =
      document.getElementById(
        "inventory-module-container"
      );


    /*
      Сейчас мы не на странице
      inventory.html
    */

    if (!container) {
      return;
    }


    const key =
      getCurrentModule();


    const config =
      INVENTORY_MODULES[key];


    /*
      Неизвестный inventoryTab
    */

    if (!config) {

      console.error(
        "Inventory module not found:",
        key
      );


      container.innerHTML = `
        <div class="inventory-loader-error">
          Модуль инвентаризации
          «${key}» не найден.
        </div>
      `;


      return;

    }


    const loadingHost =
      container.closest("#inventory-page") ||
      container;


    window.IzakazPageLoading?.show(
      loadingHost,
      "Загрузка инвентаризации…"
    );


    container.innerHTML = `
      <div class="inventory-loading" role="status" aria-live="polite">
        <span class="app-module-loader" aria-hidden="true"></span>
        <strong class="app-module-loading-title">Загрузка инвентаризации…</strong>
        <span class="app-module-loading-note">Подготавливаем раздел</span>
      </div>
    `;


    /*
      Заголовок shell
    */

    const title =
      document.getElementById(
        "inventory-page-title"
      );


    if (title) {

      title.textContent =
        config.title;

    }


    try {

      /*
        CSS
      */

      loadStyle(
        config.css
      );


      refreshThemeOverrides();


      /*
        HTML
      */

      const response =
        await fetch(
          config.html
        );


      if (!response.ok) {

        throw new Error(
          `HTTP ${response.status}: ${config.html}`
        );

      }


      const html =
        await response.text();


      /*
        Проверяем, что пользователь
        всё ещё находится на том же
        inventory module.

        Это защищает от ситуации,
        когда пользователь быстро
        переключил страницу.
      */

      if (
        getCurrentModule() !==
        key
      ) {

        return;

      }


      container.innerHTML =
        html;


      /*
        JS
      */

      await loadScript(
        config.js
      );


      /*
        Получаем модуль:
        InventoryCount
        или InventoryLists
      */

      const module =
        window[
          config.module
        ];


      if (
        !module ||
        typeof module.init !==
          "function"
      ) {

        throw new Error(
          `Модуль ${config.module} не найден.`
        );

      }


      /*
        Проверяем route ещё раз
        перед init.
      */

      if (
        getCurrentModule() !==
        key
      ) {

        return;

      }


      /*
        INIT
      */

      await module.init(
        container
      );


      window.IzakazPageLoading?.hide(
        loadingHost
      );


      console.log(
        `[Inventory] ${key} loaded`
      );


    } catch (error) {

      window.IzakazPageLoading?.hide(
        loadingHost
      );

      console.error(
        "Inventory loader:",
        error
      );


      /*
        Ошибку выводим только если
        пользователь всё ещё находится
        в этом модуле.
      */

      if (
        getCurrentModule() !==
        key
      ) {

        return;

      }


      container.innerHTML = `
        <div class="inventory-loader-error">

          <strong>
            Ошибка загрузки
          </strong>

          <br><br>

          ${String(
            error.message ||
            error
          )}

        </div>
      `;

    }

  }


  /* =====================================================
     PAGE LOADED EVENT
  ===================================================== */

  document.addEventListener(
    "app:page-loaded",
    function (event) {

      const route =
        event.detail
          ?.route
        ||
        "";


      if (
        !route.startsWith(
          "inventory-"
        )
      ) {

        return;

      }


      window.setTimeout(
        loadInventoryModule,
        0
      );

    }
  );


  /* =====================================================
     INITIAL LOAD
  ===================================================== */

  window.setTimeout(
    function () {

      const route =
        window
          .IZAKAZ_CURRENT_PAGE
          ?.route
        ||
        "";


      if (
        route.startsWith(
          "inventory-"
        )
      ) {

        loadInventoryModule();

      }

    },
    0
  );

})();
