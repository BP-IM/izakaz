/* =====================================================
   INVENTORY COUNT — STATE
===================================================== */

(function () {
  "use strict";


  function create() {

    return {

      userId: null,

      restaurantId: null,


      /*
        Текущая session.
      */

      session: null,


      /*
        Қай күнді санап жатырмыз.
        YYYY-MM-DD
      */

      inventoryDate: null,


      /*
        daily / weekly / monthly
      */

      inventoryType: null,


      /*
        open / completed
      */

      sessionStatus: null,


      /*
        Бүгінге дейін барлық
        инвентаризация біткен бе.
      */

      isUpToDate: false,


      /*
        Егер бүгін бәрі біткен болса,
        келесі inventory күні.
      */

      nextInventoryDate: null,


      /*
        Товары текущего дня
      */

      products: [],


      /*
        Жеке-жеке санаулар.
      */

      entries: [],


      /*
        product/unit бойынша итог.
      */

      totals: new Map(),


      /*
        Қазір санап жатқан адамдар.
      */

      activeUsers: []

    };

  }


  window.InventoryCountState = {
    create
  };

})();