/* =====================================================
   IZAKAZ v0.2.0
   INVENTORY COUNT — REALTIME
===================================================== */

(function () {
  "use strict";


  async function init(app) {

    if (!app) {

      throw new Error(
        "Inventory Realtime: app не передан."
      );

    }


    console.log(
      "[Inventory Realtime] ready"
    );

  }


  window.InventoryCountRealtime = {
    init
  };

})();