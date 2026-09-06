/* =====================================================
   I’M | ЗАКАЗ
   ОБОЛОЧКА ЕЖЕНЕДЕЛЬНОГО ЗАКАЗА
===================================================== */

(function () {
  "use strict";


  const STEP_CONFIG = {

    1: {
      html:
        "./views/order/step-1-stock.html",

      js:
        "../js/order/step-1-stock.js",

      css:
        "../css/order/step-1-stock.css",

      extraJs: [
        "../js/order/step-1-fresh-lots.js"
      ],

      extraCss: [
        "../css/order/step-1-fresh-lots.css"
      ],

      module:
        "OrderStep1Stock"
    },


    2: {
      html:
        "./views/order/step-2-sales.html",

      js:
        "../js/order/step-2-sales.js",

      css:
        "../css/order/step-2-sales.css",

      module:
        "OrderStep2Sales"
    },


    3: {
      html:
        "./views/order/step-3-calculation.html",

      js:
        "../js/order/step-3-calculation.js",

      css:
        "../css/order/step-3-calculation.css",

      module:
        "OrderStep3Calculation"
    },


    4: {
      html:
        "./views/order/step-4-result.html",

      js:
        "../js/order/step-4-result.js",

      css:
        "../css/order/step-4-result.css",

      module:
        "OrderStep4Result"
    }

  };


  let initializedRoot =
    null;

  let currentStep =
    1;

  let loadVersion =
    0;


  /* =====================================================
     ASSET KEY
  ===================================================== */

  function createAssetKey(
    prefix,
    value
  ) {

    return (
      `${prefix}-${value}`
        .replace(
          /[^a-zA-Z0-9_-]/g,
          "-"
        )
    );

  }


  /* =====================================================
     CSS
  ===================================================== */

  function ensureStylesheet(
    key,
    href
  ) {

    const id =
      createAssetKey(
        "order-style",
        key
      );


    if (
      document.getElementById(
        id
      )
    ) {

      return;

    }


    const link =
      document.createElement(
        "link"
      );


    link.id =
      id;

    link.rel =
      "stylesheet";

    link.href =
      href;


    document.head.appendChild(
      link
    );

  }


  function loadStyles(
    step,
    config
  ) {

    ensureStylesheet(
      `step-${step}-main`,
      config.css
    );


    (
      config.extraCss || []
    ).forEach(
      function (
        href,
        index
      ) {

        ensureStylesheet(
          `step-${step}-extra-${index}`,
          href
        );

      }
    );

  }


  /* =====================================================
     JS
  ===================================================== */

  function ensureScript(
    key,
    src
  ) {

    const id =
      createAssetKey(
        "order-script",
        key
      );


    const existing =
      document.getElementById(
        id
      );


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


  async function loadScripts(
    step,
    config
  ) {

    const promises = [];


    promises.push(
      ensureScript(
        `step-${step}-main`,
        config.js
      )
    );


    (
      config.extraJs || []
    ).forEach(
      function (
        src,
        index
      ) {

        promises.push(
          ensureScript(
            `step-${step}-extra-${index}`,
            src
          )
        );

      }
    );


    await Promise.all(
      promises
    );

  }


  /* =====================================================
     STEPPER
  ===================================================== */

  function updateStepper(
    root,
    step
  ) {

    root
      .querySelectorAll(
        "[data-order-step]"
      )
      .forEach(
        function (button) {

          const buttonStep =
            Number(
              button.dataset
                .orderStep
            );


          button.classList.toggle(
            "is-active",
            buttonStep === step
          );


          button.classList.toggle(
            "is-complete",
            buttonStep < step
          );

        }
      );

  }


  /* =====================================================
     LOAD STEP
  ===================================================== */

  async function loadStep(
    step
  ) {

    const root =
      document.getElementById(
        "weekly-order-page"
      );


    if (
      !root ||
      !STEP_CONFIG[step]
    ) {

      return;

    }


    const container =
      root.querySelector(
        "#order-step-container"
      );


    if (!container) {

      return;

    }


    currentStep =
      step;

    window.OrderNotes?.setContext(null);


    updateStepper(
      root,
      step
    );


    const version =
      ++loadVersion;


    const config =
      STEP_CONFIG[
        step
      ];


    container.innerHTML = `
      <div class="order-step-loading">
        Загрузка шага ${step}...
      </div>
    `;


    try {

      /*
        CSS:
        основной + дополнительные.
      */

      loadStyles(
        step,
        config
      );


      /*
        HTML + JS грузим параллельно.
      */

      const [
        html
      ] =
        await Promise.all([

          fetch(
            config.html,
            {
              cache:
                "no-store"
            }
          )
            .then(
              function (
                response
              ) {

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


          loadScripts(
            step,
            config
          )

        ]);


      /*
        Пользователь мог уже
        перейти на другой шаг.
      */

      if (
        version !==
        loadVersion
      ) {

        return;

      }


      container.innerHTML =
        html;


      /*
        Главный module Step.
      */

      const moduleObject =
        window[
          config.module
        ];


      if (
        !moduleObject ||
        typeof moduleObject.init !==
          "function"
      ) {

        throw new Error(
          `Модуль ${config.module} не найден.`
        );

      }


      await moduleObject.init(
        container,
        {
          step,

          goToStep:
            loadStep,

          getCurrentStep:
            function () {

              return currentStep;

            }
        }
      );

      if (version === loadVersion) window.OrderNotes?.setContext(moduleObject.getNotesContext?.());

    } catch (error) {

      console.error(
        "Ошибка загрузки шага заказа:",
        error
      );


      container.innerHTML = `
        <div class="order-step-error">

          <strong>
            Не удалось загрузить шаг.
          </strong>

          <span>
            ${String(
              error.message ||
              error
            )}
          </span>

          <button
            type="button"
            data-order-retry-step="${step}"
          >
            Повторить
          </button>

        </div>
      `;

    }

  }


  /* =====================================================
     EVENTS
  ===================================================== */

  function bindShellEvents(
    root
  ) {

    root.addEventListener(
      "click",
      function (
        event
      ) {

        const stepButton =
          event.target.closest(
            "[data-order-step]"
          );


        if (stepButton) {

          loadStep(
            Number(
              stepButton.dataset
                .orderStep
            )
          );


          return;

        }


        const retryButton =
          event.target.closest(
            "[data-order-retry-step]"
          );


        if (retryButton) {

          loadStep(
            Number(
              retryButton.dataset
                .orderRetryStep
            )
          );

        }

      }
    );

  }


  /* =====================================================
     INIT
  ===================================================== */

  function initOrderPage() {

    const root =
      document.getElementById(
        "weekly-order-page"
      );


    if (
      !root ||
      root === initializedRoot
    ) {

      return;

    }


    initializedRoot =
      root;


    currentStep =
      1;


    bindShellEvents(
      root
    );


    loadStep(
      1
    );

  }


  /* =====================================================
     PUBLIC API
  ===================================================== */

  window.OrderApp = {

    goToStep:
      loadStep,


    getCurrentStep:
      function () {

        return currentStep;

      }

  };


  /* =====================================================
     SPA
  ===================================================== */

  document.addEventListener(
    "DOMContentLoaded",
    initOrderPage
  );


  window.addEventListener(
    "hashchange",
    function () {

      window.setTimeout(
        initOrderPage,
        0
      );

    }
  );


  const observer =
    new MutationObserver(
      function () {

        initOrderPage();

      }
    );


  observer.observe(
    document.documentElement,
    {
      childList:
        true,

      subtree:
        true
    }
  );

})();
