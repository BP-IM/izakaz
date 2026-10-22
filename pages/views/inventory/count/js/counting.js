/* =====================================================
   IZAKAZ v0.2.0
   INVENTORY COUNT — COUNTING
===================================================== */

(function () {
  "use strict";


  let app = null;


  /* =====================================================
     LOAD ENTRIES
  ===================================================== */

  async function loadEntries() {

    const state =
      app.state;


    if (!state.session?.id) {

      throw new Error(
        "Inventory Counting: session id не найден."
      );

    }


    const {
      data,
      error
    } =
      await supabaseClient
        .from(
          "inventory_count_entries"
        )
        .select(`
          id,
          session_id,
          product_id,
          user_id,
          unit,
          quantity,
          created_at
        `)
        .eq(
          "session_id",
          state.session.id
        )
        .order(
          "created_at",
          {
            ascending: true
          }
        );


    if (error) {
      throw error;
    }


    state.entries =
      data || [];


    calculateTotals();

  }


  /* =====================================================
     TOTALS
  ===================================================== */

  function calculateTotals() {

    const totals =
      new Map();


    for (
      const entry
      of app.state.entries
    ) {

      const productId =
        entry.product_id;


      const unit =
        String(
          entry.unit || ""
        );


      const quantity =
        Number(
          entry.quantity || 0
        );


      if (
        !totals.has(
          productId
        )
      ) {

        totals.set(
          productId,
          new Map()
        );

      }


      const productTotals =
        totals.get(
          productId
        );


      const current =
        Number(
          productTotals.get(
            unit
          ) || 0
        );


      productTotals.set(
        unit,
        current + quantity
      );

    }


    app.state.totals =
      totals;

  }


  /* =====================================================
     GET PRODUCT ENTRIES
  ===================================================== */

  function getProductEntries(
    productId
  ) {

    return app.state.entries
      .filter(
        function (entry) {

          return (
            entry.product_id ===
            productId
          );

        }
      )
      .sort(
        function (a, b) {

          return (
            new Date(
              b.created_at
            )
            -
            new Date(
              a.created_at
            )
          );

        }
      );

  }


  /* =====================================================
     GET TOTALS
  ===================================================== */

  function getProductTotals(
    productId
  ) {

    return (
      app.state.totals.get(
        productId
      )
      ||
      new Map()
    );

  }


  /* =====================================================
     IS COUNTED
  ===================================================== */

  function isProductCounted(
    productId
  ) {

    return app.state.entries.some(
      function (entry) {

        return (
          entry.product_id ===
          productId
        );

      }
    );

  }


  function getCountedProductIds() {

    return new Set(
      app.state.entries.map(
        function (entry) {

          return entry.product_id;

        }
      )
    );

  }


  /* =====================================================
     ADD ENTRY
  ===================================================== */

  async function addEntry(
    productId,
    unit,
    quantity
  ) {

    const state =
      app.state;


    const numericQuantity =
      Number(
        quantity
      );


    if (
      !Number.isFinite(
        numericQuantity
      ) ||
      numericQuantity < 0
    ) {

      throw new Error(
        "Введите корректное количество."
      );

    }


    if (!unit) {

      throw new Error(
        "Не указана единица измерения."
      );

    }


    if (!productId) {

      throw new Error(
        "Не указан товар."
      );

    }


    if (!state.session?.id) {

      throw new Error(
        "Сессия инвентаризации не найдена."
      );

    }


    const {
      data,
      error
    } =
      await supabaseClient
        .from(
          "inventory_count_entries"
        )
        .insert({

          session_id:
            state.session.id,

          product_id:
            productId,

          user_id:
            state.userId,

          unit:
            unit,

          quantity:
            numericQuantity

        })
        .select()
        .single();


    if (error) {
      throw error;
    }


    /*
      Бірден local state-қа қосамыз.
    */

    state.entries.push(
      data
    );


    calculateTotals();


    return data;

  }


  /* =====================================================
     DELETE OWN ENTRY
  ===================================================== */

  async function deleteEntry(
    entryId
  ) {

    const entry =
      app.state.entries.find(
        function (item) {

          return (
            item.id ===
            entryId
          );

        }
      );


    if (!entry) {

      throw new Error(
        "Запись подсчёта не найдена."
      );

    }


    /*
      Қазір тек өзінің entry-сін
      өшіруге рұқсат береміз.
    */

    if (
      entry.user_id !==
      app.state.userId
    ) {

      throw new Error(
        "Можно удалить только свою запись."
      );

    }


    const {
      error
    } =
      await supabaseClient
        .from(
          "inventory_count_entries"
        )
        .delete()
        .eq(
          "id",
          entryId
        )
        .eq(
          "user_id",
          app.state.userId
        );


    if (error) {
      throw error;
    }


    app.state.entries =
      app.state.entries.filter(
        function (item) {

          return (
            item.id !==
            entryId
          );

        }
      );


    calculateTotals();

  }


  /* =====================================================
     INIT
  ===================================================== */

  async function init(application) {

    app =
      application;


    await loadEntries();


    console.log(
      "[Inventory Counting] ready",
      {
        entries:
          app.state.entries.length,

        countedProducts:
          getCountedProductIds().size
      }
    );

  }


  /* =====================================================
     PUBLIC API
  ===================================================== */

  window.InventoryCountCounting = {

    init,

    reload:
      async function () {

        await loadEntries();

      },

    addEntry,

    deleteEntry,

    getProductEntries,

    getProductTotals,

    getCountedProductIds,

    isProductCounted

  };

})();