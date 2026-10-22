/* =====================================================
   IZAKAZ v0.2.0
   INVENTORY COUNT CONTROLLER
===================================================== */

(function () {
  "use strict";


  const MODULE_PATH =
    "./views/inventory/count/js/";


  const MODULES = [
    "state.js",
    "session.js",
    "products.js",
    "counting.js",
    "ui.js",
    "count-modal.js",
    "date-override.js",
    "report.js",
    "completion.js",
    "realtime.js"
  ];


  const loadedScripts =
    new Set();


  function loadScript(file) {

    const src =
      MODULE_PATH + file;


    if (
      loadedScripts.has(src)
    ) {

      return Promise.resolve();

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


        script.src =
          src;


        script.onload =
          function () {

            loadedScripts.add(
              src
            );

            resolve();

          };


        script.onerror =
          function () {

            reject(
              new Error(
                `Не удалось загрузить ${src}`
              )
            );

          };


        document.body.appendChild(
          script
        );

      }
    );

  }


  async function init(container) {

    const root =
      container.querySelector(
        "#inventory-count-page"
      );


    if (!root) {

      throw new Error(
        "Inventory Count root не найден."
      );

    }


    for (
      const file
      of MODULES
    ) {

      await loadScript(
        file
      );

    }


    const state =
      window.InventoryCountState
        .create();


    const app = {

      root,

      container,

      state

    };


    await window
      .InventoryCountSession
      .init(app);


    await window
        .InventoryCountProducts
        .init(app);


    await window
      .InventoryCountCounting
      .init(app);


    await window
      .InventoryCountUI
      .init(app);


    await window
        .InventoryCountModal
        .init(app);

    await window
        .InventoryDateOverride
        .init(app);


    await window
        .InventoryCountReport.
        init(app);


    await window
        .InventoryCountCompletion
        .init(app);


    await window
      .InventoryCountRealtime
      .init(app);


    console.log(
      "[Inventory Count] initialized",
      state
    );

  }


  window.InventoryCount = {
    init
  };

})();