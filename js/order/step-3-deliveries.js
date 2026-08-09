/* =====================================================
   I’M | ЗАКАЗ
   STEP 3 — DELIVERIES

   Жауапкершілігі:
   - график поставокты оқу
   - бұрыннан келе жатқан поставкаларды оқу
   - delivery items оқу
   - товар + күн бойынша incoming qty дайындау

   Мұнда:
   - расчет жоқ
   - Cola формуласы жоқ
   - UI жоқ
===================================================== */

(function () {
  "use strict";


  /* =====================================================
     CLIENT
  ===================================================== */

  function getClient() {

    /*
      supabaseClient кей проекттерде
      window.supabaseClient болады,
      кейде global const ретінде тұрады.

      Екі вариантты да қолдаймыз.
    */

    const client =
      window.supabaseClient ||
      (
        typeof supabaseClient !== "undefined"
          ? supabaseClient
          : null
      );


    if (!client) {

      throw new Error(
        "supabaseClient не найден"
      );

    }


    return client;

  }


  function getCore() {

    if (!window.OrderStep3Core) {

      throw new Error(
        "OrderStep3Core не загружен"
      );

    }


    return window.OrderStep3Core;

  }


  /* =====================================================
     STATUS
  ===================================================== */

  function normalizeStatuses(
    statuses
  ) {

    if (
      Array.isArray(statuses) &&
      statuses.length
    ) {

      return statuses;

    }


    /*
      cancelled автоматты түрде
      расчетқа кірмейді.
    */

    return [
      "expected",
      "arrived"
    ];

  }


  /* =====================================================
     LOAD DELIVERY SCHEDULE
  ===================================================== */

  async function loadSchedule(
    options = {}
  ) {

    const client =
      getClient();


    const restaurantId =
      options.restaurantId;


    const deliveryGroup =
      options.deliveryGroup ||
      null;


    if (!restaurantId) {

      throw new Error(
        "loadSchedule: restaurantId не указан"
      );

    }


    let query =
      client

        .from(
          "restaurant_delivery_schedule"
        )

        .select(`
          id,
          restaurant_id,
          delivery_group,
          weekday,
          source_order_day,
          is_active
        `)

        .eq(
          "restaurant_id",
          restaurantId
        )

        .eq(
          "is_active",
          true
        );


    if (deliveryGroup) {

      query =
        query.eq(
          "delivery_group",
          deliveryGroup
        );

    }


    const {
      data,
      error
    } =
      await query;


    if (error) {

      console.error(
        "[Step 3 Deliveries] schedule error:",
        error
      );

      throw error;

    }


    const rows =
      (data || [])

        .map(
          function (row) {

            return {

              ...row,

              weekday:
                Number(
                  row.weekday
                )

            };

          }
        )

        .sort(
          function (a, b) {

            return (
              a.weekday -
              b.weekday
            );

          }
        );


    return rows;

  }


  /* =====================================================
     LOAD DELIVERY HEADERS
  ===================================================== */

  async function loadDeliveryHeaders(
    options = {}
  ) {

    const client =
      getClient();


    const Core =
      getCore();


    const restaurantId =
      options.restaurantId;


    const deliveryGroup =
      options.deliveryGroup ||
      null;


    const fromDate =
      options.fromDate ||
      null;


    const toDate =
      options.toDate ||
      null;


    const statuses =
      normalizeStatuses(
        options.statuses
      );


    const excludeWeeklyOrderId =
      options.excludeWeeklyOrderId ||
      null;


    if (!restaurantId) {

      throw new Error(
        "loadDeliveryHeaders: restaurantId не указан"
      );

    }


    if (fromDate) {

      Core.parseDate(
        fromDate
      );

    }


    if (toDate) {

      Core.parseDate(
        toDate
      );

    }


    let query =
      client

        .from(
          "order_deliveries"
        )

        .select(`
          id,
          restaurant_id,
          delivery_date,
          delivery_group,
          source,
          source_weekly_order_id,
          source_order_day,
          status,
          note
        `)

        .eq(
          "restaurant_id",
          restaurantId
        )

        .in(
          "status",
          statuses
        );


    if (deliveryGroup) {

      query =
        query.eq(
          "delivery_group",
          deliveryGroup
        );

    }


    if (fromDate) {

      query =
        query.gte(
          "delivery_date",
          fromDate
        );

    }


    if (toDate) {

      query =
        query.lte(
          "delivery_date",
          toDate
        );

    }


    const {
      data,
      error
    } =
      await query.order(
        "delivery_date",
        {
          ascending: true
        }
      );


    if (error) {

      console.error(
        "[Step 3 Deliveries] headers error:",
        error
      );

      throw error;

    }


    let rows =
      data || [];


    /*
      Қазіргі заказдың өзінен
      бұрын system delivery құрылған болса,
      қажет кезде исключить ете аламыз.

      Әйтпесе recommendation өзін
      incoming ретінде қайта санап кетуі мүмкін.
    */

    if (
      excludeWeeklyOrderId
    ) {

      rows =
        rows.filter(
          function (row) {

            return (
              row.source_weekly_order_id !==
              excludeWeeklyOrderId
            );

          }
        );

    }


    return rows;

  }


  /* =====================================================
     LOAD DELIVERY ITEMS
  ===================================================== */

  async function loadDeliveryItems(
    options = {}
  ) {

    const client =
      getClient();


    const deliveryIds =
      Array.isArray(
        options.deliveryIds
      )
        ? options.deliveryIds
        : [];


    const productIds =
      Array.isArray(
        options.productIds
      )
        ? options.productIds
        : [];


    if (!deliveryIds.length) {

      return [];

    }


    let query =
      client

        .from(
          "order_delivery_items"
        )

        .select(`
          id,
          delivery_id,
          product_id,
          case_qty,
          slv_qty,
          pcs_qty,
          base_qty
        `)

        .in(
          "delivery_id",
          deliveryIds
        );


    if (
      productIds.length
    ) {

      query =
        query.in(
          "product_id",
          productIds
        );

    }


    const {
      data,
      error
    } =
      await query;


    if (error) {

      console.error(
        "[Step 3 Deliveries] items error:",
        error
      );

      throw error;

    }


    return data || [];

  }


  /* =====================================================
     BUILD INCOMING INDEX

     Нәтиже:

     byProduct.get(productId)
       -> Map(
            "2026-08-11" => 120,
            "2026-08-14" => 60
          )
  ===================================================== */

  function buildIncomingIndex(
    headers = [],
    items = []
  ) {

    const Core =
      getCore();


    const headerMap =
      new Map();


    const byProduct =
      new Map();


    /*
      Header index
    */

    headers.forEach(
      function (delivery) {

        headerMap.set(
          delivery.id,
          delivery
        );

      }
    );


    /*
      Product/date index
    */

    items.forEach(
      function (item) {

        const delivery =
          headerMap.get(
            item.delivery_id
          );


        if (!delivery) {

          return;

        }


        const productId =
          item.product_id;


        const date =
          delivery.delivery_date;


        const qty =
          Core.roundNumber(
            Number(
              item.base_qty || 0
            )
          );


        if (
          qty <= 0
        ) {

          return;

        }


        if (
          !byProduct.has(
            productId
          )
        ) {

          byProduct.set(
            productId,
            new Map()
          );

        }


        const dateMap =
          byProduct.get(
            productId
          );


        const oldQty =
          dateMap.get(
            date
          ) || 0;


        dateMap.set(

          date,

          Core.roundNumber(
            oldQty +
            qty
          )

        );

      }
    );


    return {

      headerMap,

      byProduct

    };

  }


  /* =====================================================
     LOAD FULL INCOMING DATA
  ===================================================== */

  async function loadIncomingForProducts(
    options = {}
  ) {

    const headers =
      await loadDeliveryHeaders({

        restaurantId:
          options.restaurantId,

        deliveryGroup:
          options.deliveryGroup,

        fromDate:
          options.fromDate,

        toDate:
          options.toDate,

        statuses:
          options.statuses,

        excludeWeeklyOrderId:
          options.excludeWeeklyOrderId

      });


    const deliveryIds =
      headers.map(
        function (delivery) {

          return delivery.id;

        }
      );


    const items =
      await loadDeliveryItems({

        deliveryIds,

        productIds:
          options.productIds || []

      });


    const index =
      buildIncomingIndex(
        headers,
        items
      );


    return {

      headers,

      items,

      headerMap:
        index.headerMap,

      byProduct:
        index.byProduct

    };

  }


  /* =====================================================
     GET PRODUCT DELIVERIES

     Формат дәл Cola engine үшін:

     [
       {
         date: "2026-08-11",
         qty: 60
       }
     ]
  ===================================================== */

  function getProductDeliveries(
    incomingData,
    productId
  ) {

    const dateMap =
      incomingData
        ?.byProduct
        ?.get(
          productId
        );


    if (!dateMap) {

      return [];

    }


    return Array
      .from(
        dateMap.entries()
      )

      .map(
        function (
          [date, qty]
        ) {

          return {

            date,

            qty:
              Number(qty)

          };

        }
      )

      .sort(
        function (a, b) {

          return (
            a.date.localeCompare(
              b.date
            )
          );

        }
      );

  }


  /* =====================================================
     GET ONE PRODUCT DELIVERY QTY
  ===================================================== */

  function getProductDeliveryQty(
    incomingData,
    productId,
    date
  ) {

    const dateMap =
      incomingData
        ?.byProduct
        ?.get(
          productId
        );


    if (!dateMap) {

      return 0;

    }


    return Number(
      dateMap.get(
        date
      ) || 0
    );

  }


  /* =====================================================
     DEBUG SCHEDULE
  ===================================================== */

  async function debugSchedule(
    options = {}
  ) {

    const rows =
      await loadSchedule(
        options
      );


    console.table(
      rows.map(
        function (row) {

          return {

            group:
              row.delivery_group,

            weekday:
              row.weekday,

            source_order_day:
              row.source_order_day,

            active:
              row.is_active

          };

        }
      )
    );


    return rows;

  }


  /* =====================================================
     DEBUG INCOMING
  ===================================================== */

  function debugIncoming(
    incomingData
  ) {

    const rows = [];


    incomingData
      ?.byProduct
      ?.forEach(
        function (
          dateMap,
          productId
        ) {

          dateMap.forEach(
            function (
              qty,
              date
            ) {

              rows.push({

                productId,

                date,

                qty

              });

            }
          );

        }
      );


    rows.sort(
      function (a, b) {

        return (
          a.date.localeCompare(
            b.date
          )
        );

      }
    );


    console.table(
      rows
    );


    return rows;

  }


  /* =====================================================
     TEST
  ===================================================== */

  function test() {

    console.log(
      "✅ OrderStep3Deliveries работает"
    );


    return true;

  }


  /* =====================================================
     PUBLIC API
  ===================================================== */

  window.OrderStep3Deliveries = {

    loadSchedule,

    loadDeliveryHeaders,

    loadDeliveryItems,

    loadIncomingForProducts,

    buildIncomingIndex,

    getProductDeliveries,

    getProductDeliveryQty,

    debugSchedule,

    debugIncoming,

    test

  };


  console.log(
    "[Step 3 Deliveries] loaded"
  );

})();