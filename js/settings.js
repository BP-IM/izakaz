/* =====================================================
   IZAKAZ v0.2.0
   SETTINGS MODULE LOADER

   Route:
   #settings-delivery  -> delivery
   #settings-products  -> products

   Кейін:
   #settings-sales     -> sales
   #settings-profile   -> profile
===================================================== */

(function () {
  "use strict";


  /* =====================================================
     SETTINGS MODULES
  ===================================================== */

  const SETTINGS_MODULES = {

    delivery: {
      title: "График поставок",

      html:
        "./views/settings/delivery-schedule/delivery-schedule.html",

      css:
        "./views/settings/delivery-schedule/delivery-schedule.css",

      js:
        "./views/settings/delivery-schedule/delivery-schedule.js",

      module:
        "DeliveryScheduleSettings"
    },


    products: {
      title: "Товары",

      html:
        "./views/settings/products/products.html",

      css:
        "./views/settings/products/products.css",

      js:
        "./views/settings/products/products.js",

      module:
        "OrderProductsSettings"
    },

    profile: {
      title: "Профиль",

      html:
        "./views/settings/profile/profile.html",

      css:
        "./views/settings/profile/profile.css",

      js:
        "./views/settings/profile/profile.js",

      module:
        "ProfileSettings"
    }, 

    sales: {
      title: "Реализация",

      html:
        "./views/settings/sales/sales.html",

      css:
        "./views/settings/sales/sales.css",

      js:
        "./views/settings/sales/sales.js",

      module:
        "SalesSettings"
    }

  };

  


  /* =====================================================
     STATE
  ===================================================== */

  let loadVersion = 0;


  /* =====================================================
     CURRENT SETTINGS TAB
  ===================================================== */

  function getCurrentSettingsTab() {

    const currentPage =
      window.IZAKAZ_CURRENT_PAGE;


    const settingsTab =
      currentPage
        ?.config
        ?.settingsTab;


    if (
      settingsTab &&
      SETTINGS_MODULES[settingsTab]
    ) {
      return settingsTab;
    }


    /*
      Fallback:
      егер қандай да бір ескі кодпен
      #settings ашылса.
    */

    return "delivery";
  }


  /* =====================================================
     PAGE TITLE
  ===================================================== */

  function updateSettingsHeader(
    tab
  ) {

    const config =
      SETTINGS_MODULES[tab];


    const label =
      document.getElementById(
        "settings-page-label"
      );


    const title =
      document.getElementById(
        "settings-page-title"
      );


    if (label) {
      label.textContent =
        "Настройки";
    }


    if (title) {
      title.textContent =
        config?.title ||
        "Настройки";
    }

  }


  /* =====================================================
     CSS LOADER
  ===================================================== */

  function ensureStylesheet(
    name,
    href
  ) {

    const id =
      `settings-style-${name}`;


    if (
      document.getElementById(id)
    ) {
      return;
    }


    const link =
      document.createElement(
        "link"
      );


    link.id = id;

    link.rel =
      "stylesheet";

    link.href =
      href;


    document.head.appendChild(
      link
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
     JS LOADER
  ===================================================== */

  function ensureScript(
    name,
    src
  ) {

    const id =
      `settings-script-${name}`;


    const existing =
      document.getElementById(id);


    /*
      Скрипт уже полностью загружен.
    */

    if (
      existing &&
      existing.dataset.loaded ===
        "true"
    ) {
      return Promise.resolve();
    }


    /*
      Скрипт уже добавлен,
      но еще загружается.
    */

    if (existing) {

      return new Promise(
        function (
          resolve,
          reject
        ) {

          existing.addEventListener(
            "load",
            resolve,
            {
              once: true
            }
          );


          existing.addEventListener(
            "error",
            reject,
            {
              once: true
            }
          );

        }
      );

    }


    /*
      Создаем новый script.
    */

    return new Promise(
      function (
        resolve,
        reject
      ) {

        const script =
          document.createElement(
            "script"
          );


        script.id =
          id;

        script.src =
          src;

        script.async =
          true;


        script.addEventListener(
          "load",
          function () {

            script.dataset.loaded =
              "true";

            resolve();

          }
        );


        script.addEventListener(
          "error",
          function () {

            reject(
              new Error(
                `Не удалось загрузить ${src}`
              )
            );

          }
        );


        document.body.appendChild(
          script
        );

      }
    );

  }


  /* =====================================================
     LOADING STATE
  ===================================================== */

  function showLoading(
    container
  ) {

    container.innerHTML = `
      <div class="settings-loading" role="status" aria-live="polite">
        <span class="app-module-loader" aria-hidden="true"></span>
        <strong class="app-module-loading-title">Загрузка настроек…</strong>
        <span class="app-module-loading-note">Подготавливаем раздел</span>
      </div>
    `;

  }


  /* =====================================================
     ERROR STATE
  ===================================================== */

  function showError(
    container,
    error
  ) {

    console.error(
      "Settings module error:",
      error
    );


    container.innerHTML = `
      <div class="settings-error">

        <strong>
          Не удалось загрузить настройки
        </strong>

        <span>
          ${String(
            error?.message ||
            error
          )}
        </span>

      </div>
    `;

  }


  /* =====================================================
     LOAD SETTINGS MODULE
  ===================================================== */

  async function loadModule(
    tab
  ) {

    const root =
      document.getElementById(
        "settings-page"
      );


    if (!root) {
      return;
    }


    const container =
      root.querySelector(
        "#settings-tab-container"
      );


    if (!container) {
      return;
    }


    const config =
      SETTINGS_MODULES[tab];


    if (!config) {

      showError(
        container,
        new Error(
          `Неизвестный раздел настроек: ${tab}`
        )
      );

      return;
    }


    window.IzakazPageLoading?.show(
      root,
      `Загрузка: ${config.title}…`
    );


    updateSettingsHeader(
      tab
    );


    const currentLoad =
      ++loadVersion;


    showLoading(
      container
    );


    try {

      ensureStylesheet(
        tab,
        config.css
      );


      refreshThemeOverrides();


      /*
        HTML + JS загружаем параллельно.
      */

      const [
        html
      ] =
        await Promise.all([

          fetch(
            config.html,
            {
              cache: "no-store"
            }
          )
            .then(
              function (response) {

                if (!response.ok) {
                  throw new Error(
                    `HTTP ${response.status}: ${config.html}`
                  );
                }


                return response.text();

              }
            ),


          ensureScript(
            tab,
            config.js
          )

        ]);


      /*
        Если пользователь успел перейти
        на другой route — старый ответ
        больше не вставляем.
      */

      if (
        currentLoad !==
        loadVersion
      ) {
        return;
      }


      container.innerHTML =
        html;


      /*
        Инициализация конкретного
        settings-модуля.
      */

      const moduleObject =
        window[
          config.module
        ];


      if (
        moduleObject &&
        typeof moduleObject.init ===
          "function"
      ) {

        await moduleObject.init(
          container
        );

      }


      window.IzakazPageLoading?.hide(
        root
      );


    } catch (error) {

      window.IzakazPageLoading?.hide(
        root
      );

      if (
        currentLoad !==
        loadVersion
      ) {
        return;
      }


      showError(
        container,
        error
      );

    }

  }


  /* =====================================================
     INIT SETTINGS PAGE
  ===================================================== */

  function initSettingsPage() {

    const root =
      document.getElementById(
        "settings-page"
      );


    if (!root) {
      return;
    }


    const tab =
      getCurrentSettingsTab();


    loadModule(
      tab
    );

  }


  /* =====================================================
     SPA PAGE LOADED
  ===================================================== */

  document.addEventListener(
    "app:page-loaded",
    function (event) {

      const route =
        event.detail?.route;


      if (
        !route ||
        !route.startsWith(
          "settings-"
        )
      ) {
        return;
      }


      initSettingsPage();

    }
  );


  /* =====================================================
     FALLBACK INITIALIZATION

     Егер DOM дайын кезде settings-page
     әлдеқашан бар болса.
  ===================================================== */

  document.addEventListener(
    "DOMContentLoaded",
    function () {

      if (
        document.getElementById(
          "settings-page"
        )
      ) {
        initSettingsPage();
      }

    }
  );


  /* =====================================================
     PUBLIC API
  ===================================================== */

  window.SettingsApp = {

    load(tab) {

      if (
        !SETTINGS_MODULES[tab]
      ) {
        console.warn(
          `Settings module not found: ${tab}`
        );

        return;
      }


      loadModule(
        tab
      );

    },


    getAvailableModules() {
      return Object.keys(
        SETTINGS_MODULES
      );
    }

  };

})();
