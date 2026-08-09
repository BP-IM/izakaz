/* =====================================================
   I’M | ЗАКАЗ
   SETTINGS TAB LOADER
===================================================== */

(function () {

  const TAB_CONFIG = {

    delivery: {
      html:
        "./views/settings/delivery-schedule.html",

      css:
        "./views/settings/css/delivery-schedule.css",

      js:
        "./views/settings/js/delivery-schedule.js",

      module:
        "DeliveryScheduleSettings"
    },


    products: {
      html:
        "./views/settings/order-products.html",

      css:
        "./views/settings/css/order-products.css",

      js:
        "./views/settings/js/order-products.js",

      module:
        "OrderProductsSettings"
    }

  };


  let initializedRoot = null;

  let activeTab =
    "delivery";

  let loadVersion = 0;


  /* =====================================================
     CSS
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


  /* =====================================================
     JS
  ===================================================== */

  function ensureScript(
    name,
    src
  ) {

    const id =
      `settings-script-${name}`;


    const existing =
      document.getElementById(id);


    if (existing) {

      if (
        existing.dataset.loaded ===
        "true"
      ) {

        return Promise.resolve();

      }


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


    return new Promise(
      function (
        resolve,
        reject
      ) {

        const script =
          document.createElement(
            "script"
          );


        script.id = id;

        script.src = src;

        script.async = true;


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
     ACTIVE TAB
  ===================================================== */

  function updateTabs(
    root,
    tab
  ) {

    root
      .querySelectorAll(
        "[data-settings-tab]"
      )
      .forEach(
        function (button) {

          button.classList.toggle(
            "is-active",

            button.dataset
              .settingsTab === tab
          );

        }
      );

  }


  /* =====================================================
     LOAD TAB
  ===================================================== */

  async function loadTab(
    tab
  ) {

    const root =
      document.getElementById(
        "settings-page"
      );


    if (
      !root ||
      !TAB_CONFIG[tab]
    ) {
      return;
    }


    const container =
      root.querySelector(
        "#settings-tab-container"
      );


    if (!container) {
      return;
    }


    activeTab = tab;


    updateTabs(
      root,
      tab
    );


    const config =
      TAB_CONFIG[tab];


    const version =
      ++loadVersion;


    container.innerHTML = `
      <div class="settings-loading">
        Загрузка...
      </div>
    `;


    try {

      ensureStylesheet(
        tab,
        config.css
      );


      const [html] =
        await Promise.all([

          fetch(
            config.html,
            {
              cache: "no-store"
            }
          )
            .then(
              function (response) {

                if (
                  !response.ok
                ) {

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


      if (
        version !==
        loadVersion
      ) {
        return;
      }


      container.innerHTML =
        html;


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

    } catch (error) {

      console.error(
        "Settings tab error:",
        error
      );


      container.innerHTML = `
        <div class="settings-error">

          <strong>
            Не удалось загрузить настройки
          </strong>

          <span>
            ${String(
              error.message ||
              error
            )}
          </span>

        </div>
      `;

    }

  }


  /* =====================================================
     INIT
  ===================================================== */

  function initSettingsPage() {

    const root =
      document.getElementById(
        "settings-page"
      );


    if (
      !root ||
      root === initializedRoot
    ) {
      return;
    }


    initializedRoot =
      root;


    activeTab =
      "delivery";


    root.addEventListener(
      "click",
      function (event) {

        const button =
          event.target.closest(
            "[data-settings-tab]"
          );


        if (!button) {
          return;
        }


        loadTab(
          button.dataset
            .settingsTab
        );

      }
    );


    loadTab(
      "delivery"
    );

  }


  /* =====================================================
     SPA WATCH
  ===================================================== */

  document.addEventListener(
    "DOMContentLoaded",
    initSettingsPage
  );


  window.addEventListener(
    "hashchange",
    function () {

      window.setTimeout(
        initSettingsPage,
        0
      );

    }
  );


  const observer =
    new MutationObserver(
      initSettingsPage
    );


  observer.observe(
    document.documentElement,
    {
      childList: true,
      subtree: true
    }
  );


  window.SettingsApp = {
    loadTab
  };

})();