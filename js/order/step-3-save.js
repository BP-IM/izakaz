/* =====================================================
   I’M | ЗАКАЗ
   STEP 3 — SAVE RESULTS

   Cola + General + Fresh нәтижелерін
   weekly_order_result_items таблицасына сақтайды.

   Бір товар / бір поставка = бір row.
===================================================== */

(function () {
  "use strict";


  /* =====================================================
     SUPABASE
  ===================================================== */

  function getClient() {

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


  /* =====================================================
     HELPERS
  ===================================================== */

  function number(
    value,
    fallback = 0
  ) {

    const result =
      Number(value);


    return Number.isFinite(result)
      ? result
      : fallback;

  }


  function integer(
    value
  ) {

    const result =
      number(value, 0);


    return Math.max(
      0,
      Math.round(result)
    );

  }


  function ensureSuccessfulResults(
    name,
    results
  ) {

    if (
      !Array.isArray(results)
    ) {

      throw new Error(
        `${name}: результаты не переданы`
      );

    }


    const failed =
      results.filter(
        function (item) {

          return !item?.ok;

        }
      );


    if (
      failed.length
    ) {

      const names =
        failed
          .slice(0, 5)
          .map(
            function (item) {

              return (
                item.product?.name ||
                "Без названия"
              );

            }
          )
          .join(", ");


      throw new Error(
        `${name}: есть ошибки расчета (${failed.length}). ${names}`
      );

    }

  }


  function getProductMeta(
    item
  ) {

    return {

      product_name:
        item.product?.name ||
        null,

      category:
        item.product?.category ||
        null,

      iiko_code:
        item.product?.iiko_code ||
        null,

      iiko_name:
        item.product?.iiko_name ||
        null,

      iiko_unit:
        item.product?.iiko_unit ||
        null,

      weekly_usage:
        number(
          item.weeklyUsage
        ),

      known_deliveries:
        Array.isArray(
          item.knownDeliveries
        )
          ? item.knownDeliveries
          : []

    };

  }


  /* =====================================================
     SHORTAGE FOR DELIVERY SEGMENT
  ===================================================== */

  function getShortageBeforeDelivery(
    item,
    delivery,
    deliveryIndex,
    deliveries
  ) {

    const forecast =
      Array.isArray(
        item.forecast
      )
        ? item.forecast
        : [];


    /*
      Бірінші машина:
      countDate -> deliveryDate

      Екінші машина:
      предыдущая delivery -> current delivery
    */

    const segmentStart =
      deliveryIndex === 0

        ? item.countDate

        : deliveries[
            deliveryIndex - 1
          ]?.date;


    const shortageRows =
      forecast.filter(
        function (row) {

          if (
            !row?.isShortage
          ) {

            return false;

          }


          if (
            segmentStart &&
            row.date <
              segmentStart
          ) {

            return false;

          }


          return (
            row.date <
            delivery.date
          );

        }
      );


    return {

      hasShortage:
        shortageRows.length > 0,

      firstShortageDate:
        shortageRows[0]
          ?.date ||
        null

    };

  }


  /* =====================================================
     NORMALIZE DELIVERIES
  ===================================================== */

  function getColaDeliveries(
    item
  ) {

    if (
      !item.deliveryDate
    ) {

      return [];

    }


    return [

      {
        date:
          item.deliveryDate,

        coverageStartDate:
          item.deliveryDate,

        coverageEndDate:
          item.coverageEndDate,

        recommendedCases:
          item.recommendedCases,

        recommendedBaseQty:
          item.recommendedBaseQty
      }

    ];

  }


  function getMultiDeliveries(
    item
  ) {

    return Array.isArray(
      item.deliveries
    )
      ? item.deliveries
      : [];

  }


  /* =====================================================
     BUILD RESULT ROW
  ===================================================== */

  function buildDeliveryRow(
    options
  ) {

    const {
      weeklyOrder,
      item,
      section,
      deliveryGroup,
      delivery,
      deliveryIndex,
      deliveries
    } =
      options;


    const risk =
      getShortageBeforeDelivery(
        item,
        delivery,
        deliveryIndex,
        deliveries
      );


    return {

      weekly_order_id:
        weeklyOrder.id,

      product_id:
        item.product.id,

      section,

      delivery_group:
        deliveryGroup,

      delivery_date:
        delivery.date,

      coverage_start_date:
        delivery.coverageStartDate ||
        null,

      coverage_end_date:
        delivery.coverageEndDate ||
        null,


      /* ORDER */

      recommended_case_qty:
        integer(
          delivery.recommendedCases
        ),

      recommended_base_qty:
        Math.max(
          0,
          number(
            delivery.recommendedBaseQty
          )
        ),


      /* SNAPSHOT */

      start_stock:
        Math.max(
          0,
          number(
            item.startStock
          )
        ),

      daily_usage:
        Math.max(
          0,
          number(
            item.dailyUsage
          )
        ),

      safety_stock:
        Math.max(
          0,
          number(
            item.safetyStock
          )
        ),

      case_to_base:
        Math.max(
          0,
          number(
            item.caseToBase
          )
        ),


      /* RISK */

      has_shortage_before_delivery:
        risk.hasShortage,

      first_shortage_date:
        risk.firstShortageDate,


      /* FRESH */

      has_expiry:
        section === "fresh"
          ? Boolean(
              item.hasExpiry
            )
          : false,

      first_expiry_date:
        section === "fresh"
          ? (
              item.firstExpiryDate ||
              null
            )
          : null,

      expired_qty:
        section === "fresh"
          ? Math.max(
              0,
              number(
                item.totalExpiredQty
              )
            )
          : 0,


      /* META */

      calculation_meta: {

        ...getProductMeta(
          item
        ),

        order_day:
          weeklyOrder.order_day,

        order_date:
          weeklyOrder.order_date,

        count_date:
          weeklyOrder.count_date,

        section,

        delivery_index:
          deliveryIndex,

        total_recommended_cases:
          section === "cola"

            ? integer(
                item.recommendedCases
              )

            : integer(
                item.totalRecommendedCases
              ),

        total_recommended_base_qty:
          section === "cola"

            ? number(
                item.recommendedBaseQty
              )

            : number(
                item.totalRecommendedBaseQty
              )

      },

      updated_at:
        new Date()
          .toISOString()

    };

  }


  /* =====================================================
     BUILD SECTION
  ===================================================== */

  function buildSectionRows(
    options
  ) {

    const {
      weeklyOrder,
      results,
      section,
      deliveryGroup,
      getDeliveries
    } =
      options;


    const rows =
      [];


    results.forEach(
      function (item) {

        const deliveries =
          getDeliveries(
            item
          );


        deliveries.forEach(
          function (
            delivery,
            deliveryIndex
          ) {

            if (
              !delivery?.date
            ) {

              return;

            }


            rows.push(

              buildDeliveryRow({

                weeklyOrder,

                item,

                section,

                deliveryGroup,

                delivery,

                deliveryIndex,

                deliveries

              })

            );

          }
        );

      }
    );


    return rows;

  }


  /* =====================================================
     BUILD ALL ROWS
  ===================================================== */

  function buildRows(
    options
  ) {

    const weeklyOrder =
      options.weeklyOrder;


    if (
      !weeklyOrder?.id
    ) {

      throw new Error(
        "weeklyOrder.id не указан"
      );

    }


    ensureSuccessfulResults(
      "Cola",
      options.colaResults
    );


    ensureSuccessfulResults(
      "General",
      options.generalResults
    );


    ensureSuccessfulResults(
      "Fresh",
      options.freshResults
    );


    const rows = [

      ...buildSectionRows({

        weeklyOrder,

        results:
          options.colaResults,

        section:
          "cola",

        deliveryGroup:
          "cola",

        getDeliveries:
          getColaDeliveries

      }),


      ...buildSectionRows({

        weeklyOrder,

        results:
          options.generalResults,

        section:
          "general",

        deliveryGroup:
          "general",

        getDeliveries:
          getMultiDeliveries

      }),


      ...buildSectionRows({

        weeklyOrder,

        results:
          options.freshResults,

        section:
          "fresh",

        deliveryGroup:
          "general",

        getDeliveries:
          getMultiDeliveries

      })

    ];


    return rows;

  }


  /* =====================================================
     REMOVE STALE ROWS
  ===================================================== */

  function makeRowKey(
    row
  ) {

    return [
      row.product_id,
      row.delivery_date
    ].join("|");

  }


  async function removeStaleRows(
    weeklyOrderId,
    currentRows
  ) {

    const client =
      getClient();


    const {
      data,
      error
    } =
      await client

        .from(
          "weekly_order_result_items"
        )

        .select(`
          id,
          product_id,
          delivery_date
        `)

        .eq(
          "weekly_order_id",
          weeklyOrderId
        );


    if (error) {

      throw error;

    }


    const currentKeys =
      new Set(
        currentRows.map(
          makeRowKey
        )
      );


    const staleIds =
      (data || [])

        .filter(
          function (row) {

            return !currentKeys.has(
              makeRowKey(row)
            );

          }
        )

        .map(
          function (row) {

            return row.id;

          }
        );


    if (
      !staleIds.length
    ) {

      return 0;

    }


    const {
      error: deleteError
    } =
      await client

        .from(
          "weekly_order_result_items"
        )

        .delete()

        .in(
          "id",
          staleIds
        );


    if (deleteError) {

      throw deleteError;

    }


    return staleIds.length;

  }


  /* =====================================================
     SAVE
  ===================================================== */

  async function save(
    options
  ) {

    const client =
      getClient();


    const rows =
      buildRows(
        options
      );


    const weeklyOrderId =
      options.weeklyOrder.id;


    /*
      Егер еш row жоқ болса,
      бұрынғы snapshot-ты тазалаймыз.
    */

    if (
      !rows.length
    ) {

      const {
        error
      } =
        await client

          .from(
            "weekly_order_result_items"
          )

          .delete()

          .eq(
            "weekly_order_id",
            weeklyOrderId
          );


      if (error) {

        throw error;

      }


      return {

        saved:
          0,

        removed:
          0,

        rows:
          []

      };

    }


    /*
      Бірдей weekly_order/product/date
      болса UPDATE болады.
    */

    const {
      data,
      error
    } =
      await client

        .from(
          "weekly_order_result_items"
        )

        .upsert(
          rows,
          {
            onConflict:
              "weekly_order_id,product_id,delivery_date"
          }
        )

        .select(`
          id,
          weekly_order_id,
          product_id,
          section,
          delivery_group,
          delivery_date,
          recommended_case_qty,
          recommended_base_qty
        `);


    if (error) {

      throw error;

    }


    /*
      Мысалы товар кейін inactive болса,
      ескі result row қалып қоймауы керек.
    */

    const removed =
      await removeStaleRows(
        weeklyOrderId,
        rows
      );


    console.log(
      "[Step 3 Save] saved:",
      {
        weekly_order_id:
          weeklyOrderId,

        rows:
          rows.length,

        removed
      }
    );


    return {

      saved:
        rows.length,

      removed,

      rows:
        data || []

    };

  }


  /* =====================================================
     LOAD
  ===================================================== */

  async function load(
    weeklyOrderId
  ) {

    if (
      !weeklyOrderId
    ) {

      throw new Error(
        "weeklyOrderId не указан"
      );

    }


    const client =
      getClient();


    const {
      data,
      error
    } =
      await client

        .from(
          "weekly_order_result_items"
        )

        .select("*")

        .eq(
          "weekly_order_id",
          weeklyOrderId
        )

        .order(
          "delivery_date",
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
     DEBUG
  ===================================================== */

  function debug(
    rows
  ) {

    console.group(
      "[Step 3 Save] RESULTS"
    );


    console.table(
      (rows || []).map(
        function (row) {

          return {

            section:
              row.section,

            product:
              row.calculation_meta
                ?.product_name ||
              row.product_id,

            delivery:
              row.delivery_date,

            case:
              row.recommended_case_qty,

            base:
              row.recommended_base_qty,

            shortage:
              row.has_shortage_before_delivery
                ? "🔴"
                : "✅",

            expiry:
              row.has_expiry
                ? "🟠"
                : ""

          };

        }
      )
    );


    console.groupEnd();

  }


  /* =====================================================
     PUBLIC API
  ===================================================== */

  window.OrderStep3Save = {

    buildRows,

    save,

    load,

    debug

  };


  console.log(
    "[Step 3 Save] loaded"
  );

})();