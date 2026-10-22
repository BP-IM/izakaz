/* =====================================================
   IZAKAZ v0.2.0
   INVENTORY COUNT — PRODUCTS
===================================================== */

(function () {
  "use strict";


  /* =====================================================
     HELPERS
  ===================================================== */

  function parseDate(dateString) {

    const [
      year,
      month,
      day
    ] =
      String(dateString)
        .split("-")
        .map(Number);


    return new Date(
      year,
      month - 1,
      day
    );

  }


  function getWeekday(
    dateString
  ) {

    const date =
      parseDate(
        dateString
      );


    /*
      JS:
      Sunday = 0
      Monday = 1
      ...
      Saturday = 6
    */

    return date.getDay();

  }


  /* =====================================================
     LOAD ALL ACTIVE PRODUCTS
  ===================================================== */

  async function loadAllProducts(
    restaurantId
  ) {

    const {
      data,
      error
    } =
      await supabaseClient
        .from(
          "order_products"
        )
        .select(`
          id,
          restaurant_id,
          category,
          name,
          iiko_code,
          iiko_name,
          iiko_unit,
          case_to_base,
          slv_to_base,
          pcs_to_base,
          sort_order,
          is_active
        `)
        .eq(
          "restaurant_id",
          restaurantId
        )
        .eq(
          "is_active",
          true
        )
        .order(
          "category",
          {
            ascending: true
          }
        )
        .order(
          "sort_order",
          {
            ascending: true
          }
        )
        .order(
          "name",
          {
            ascending: true
          }
        );


    if (error) {
      throw error;
    }


    return data || [];

  }


  /* =====================================================
     LOAD INVENTORY LIST
  ===================================================== */

  async function loadListItems(
    restaurantId
  ) {

    const {
      data,
      error
    } =
      await supabaseClient
        .from(
          "inventory_list_items"
        )
        .select(`
          id,
          product_id,
          list_type,
          weekday,
          sort_order
        `)
        .eq(
          "restaurant_id",
          restaurantId
        );


    if (error) {
      throw error;
    }


    return data || [];

  }


  /* =====================================================
     MONTHLY
  ===================================================== */

  function getMonthlyProducts(
    allProducts
  ) {

    /*
      Ежемесячная:
      барлық active товар.
    */

    return [
      ...allProducts
    ];

  }


  /* =====================================================
     WEEKLY
  ===================================================== */

  function getWeeklyProducts(
    allProducts,
    listItems
  ) {

    const productIds =
      new Set(
        listItems
          .filter(
            function (item) {

              return (
                item.list_type ===
                "weekly"
              );

            }
          )
          .map(
            function (item) {

              return item.product_id;

            }
          )
      );


    return allProducts.filter(
      function (product) {

        return productIds.has(
          product.id
        );

      }
    );

  }


  /* =====================================================
     DAILY
  ===================================================== */

  function getDailyProducts(
    allProducts,
    listItems,
    inventoryDate
  ) {

    const weekday =
      getWeekday(
        inventoryDate
      );


    const productIds =
      new Set();


    listItems.forEach(
      function (item) {

        if (
          item.list_type !==
          "daily"
        ) {
          return;
        }


        /*
          weekday NULL
          = каждый день Пн–Сб
        */

        if (
          item.weekday === null ||
          item.weekday === undefined
        ) {

          productIds.add(
            item.product_id
          );

          return;

        }


        /*
          Specific day.
        */

        if (
          Number(
            item.weekday
          ) ===
          weekday
        ) {

          productIds.add(
            item.product_id
          );

        }

      }
    );


    return allProducts.filter(
      function (product) {

        return productIds.has(
          product.id
        );

      }
    );

  }


  /* =====================================================
     INIT
  ===================================================== */

  async function init(app) {

    const state =
      app.state;


    if (
      !state.restaurantId
    ) {

      throw new Error(
        "Inventory Products: restaurantId не найден."
      );

    }


    if (
      !state.inventoryDate
    ) {

      throw new Error(
        "Inventory Products: inventoryDate не найден."
      );

    }


    if (
      !state.inventoryType
    ) {

      throw new Error(
        "Inventory Products: inventoryType не найден."
      );

    }


    const allProducts =
      await loadAllProducts(
        state.restaurantId
      );


    /*
      MONTHLY
      = барлық active products.
    */

    if (
      state.inventoryType ===
      "monthly"
    ) {

      state.products =
        getMonthlyProducts(
          allProducts
        );


      console.log(
        "[Inventory Products] ready",
        {
          type:
            state.inventoryType,

          date:
            state.inventoryDate,

          products:
            state.products.length
        }
      );


      return;

    }


    /*
      Daily / Weekly үшін
      inventory_list_items керек.
    */

    const listItems =
      await loadListItems(
        state.restaurantId
      );


    if (
      state.inventoryType ===
      "weekly"
    ) {

      state.products =
        getWeeklyProducts(
          allProducts,
          listItems
        );

    }


    else {

      state.products =
        getDailyProducts(
          allProducts,
          listItems,
          state.inventoryDate
        );

    }


    console.log(
      "[Inventory Products] ready",
      {
        type:
          state.inventoryType,

        date:
          state.inventoryDate,

        products:
          state.products.length
      }
    );

  }


  /* =====================================================
     PUBLIC API
  ===================================================== */

  window.InventoryCountProducts = {
    init
  };

})();