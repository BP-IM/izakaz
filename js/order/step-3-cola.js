/* =====================================================
   I’M | ЗАКАЗ
   STEP 3 — COLA

   ЛОГИКА:

   ПН заказ
   → ВТ поставка
   → хватает до ПТ включительно

   ЧТ заказ
   → ПТ поставка
   → хватает до ВТ включительно

   ВАЖНО:
   - физический остаток берется на countDate
   - countDate может быть раньше orderDate
   - заказ ТОЛЬКО CASE
===================================================== */

(function () {
  "use strict";


  /* =====================================================
     CORE
  ===================================================== */

  function getCore() {

    if (!window.OrderStep3Core) {

      throw new Error(
        "OrderStep3Core не загружен"
      );

    }

    return window.OrderStep3Core;

  }


  /* =====================================================
     SCHEDULE
  ===================================================== */

  function normalizeSchedule(
    schedule
  ) {

    if (!Array.isArray(schedule)) {

      throw new Error(
        "График поставок Cola не передан"
      );

    }


    return schedule.filter(
      function (row) {

        return (
          row.delivery_group === "cola" &&
          row.is_active !== false
        );

      }
    );

  }


  /* =====================================================
     DELIVERY WINDOW
  ===================================================== */

  function resolveWindow(
    options
  ) {

    const Core =
      getCore();


    const orderDate =
      options.orderDate;


    const orderDay =
      options.orderDay;


    Core.parseDate(
      orderDate
    );


    if (
      orderDay !== "monday" &&
      orderDay !== "thursday"
    ) {

      throw new Error(
        "Cola заказ возможен только monday/thursday"
      );

    }


    /*
      Проверяем сам день заказа.
    */

    const expectedWeekday =
      orderDay === "monday"
        ? 1
        : 4;


    const actualWeekday =
      Core.getIsoWeekday(
        orderDate
      );


    if (
      actualWeekday !==
      expectedWeekday
    ) {

      throw new Error(
        `${orderDate} не соответствует ${orderDay}`
      );

    }


    const schedule =
      normalizeSchedule(
        options.deliverySchedule
      );


    /*
      Текущая поставка.

      Например:

      source_order_day = monday
      weekday = 2

      ПН заказ → ВТ поставка
    */

    const sourceRows =
      schedule.filter(
        function (row) {

          return (
            row.source_order_day ===
            orderDay
          );

        }
      );


    if (!sourceRows.length) {

      throw new Error(
        `Не найдена Cola поставка для ${orderDay}`
      );

    }


    const currentCandidates =
      sourceRows

        .map(
          function (row) {

            return {

              row,

              date:
                Core.nextWeekdayDate(
                  orderDate,
                  Number(row.weekday),
                  true
                )

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


    const deliveryDate =
      currentCandidates[0]
        .date;


    /*
      Следующая Cola поставка.

      До нее включительно должен
      хватить текущий заказ.
    */

    const nextCandidates =
      schedule

        .map(
          function (row) {

            return {

              row,

              date:
                Core.nextWeekdayDate(
                  deliveryDate,
                  Number(row.weekday),
                  true
                )

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


    if (!nextCandidates.length) {

      throw new Error(
        "Не найдена следующая Cola поставка"
      );

    }


    const nextDeliveryDate =
      nextCandidates[0]
        .date;


    return {

      orderDate,

      orderDay,

      deliveryDate,

      nextDeliveryDate,

      coverageEndDate:
        nextDeliveryDate

    };

  }


  /* =====================================================
     STOCK BEFORE DELIVERY
  ===================================================== */

  function calculateStockBeforeDelivery(
    options
  ) {

    const Core =
      getCore();


    const startDate =
      options.countDate;


    const dayBeforeDelivery =
      Core.addDays(
        options.deliveryDate,
        -1
      );


    /*
      Егер остаток поставка күні
      немесе одан кейін саналған болса.
    */

    if (
      startDate >
      dayBeforeDelivery
    ) {

      return {

        stockBeforeDelivery:
          options.startStock,

        forecast:
          []

      };

    }


    const forecast =
      Core.simulateDailyStock({

        startDate,

        endDate:
          dayBeforeDelivery,

        startStock:
          options.startStock,

        dailyUsage:
          options.dailyUsage,

        deliveryMap:
          options.knownDeliveryMap

      });


    const lastRow =
      forecast[
        forecast.length - 1
      ];


    return {

      stockBeforeDelivery:
        lastRow
          ? lastRow.closingStock
          : options.startStock,

      forecast

    };

  }


  /* =====================================================
     REQUIRED QTY
  ===================================================== */

  function calculateRequiredBaseQty(
    options
  ) {

    const Core =
      getCore();


    const dates =
      Core.getDateRange(
        options.deliveryDate,
        options.coverageEndDate
      );


    let cumulativeUsage =
      0;


    let cumulativeKnownDeliveries =
      0;


    let minimumRequired =
      0;


    dates.forEach(
      function (date) {

        cumulativeUsage =
          Core.roundNumber(

            cumulativeUsage +
            options.dailyUsage

          );


        cumulativeKnownDeliveries =
          Core.roundNumber(

            cumulativeKnownDeliveries +

            (
              options.knownDeliveryMap
                .get(date) || 0
            )

          );


        /*
          Қандай да бір күні
          товар 0-ден төмен түспеуі керек.
        */

        const requiredForDay =
          Core.roundNumber(

            cumulativeUsage -

            options.stockBeforeDelivery -

            cumulativeKnownDeliveries

          );


        minimumRequired =
          Math.max(
            minimumRequired,
            requiredForDay
          );

      }
    );


    /*
      Coverage соңында safety stock
      қалуы керек.
    */

    const requiredForSafety =
      Core.roundNumber(

        cumulativeUsage +

        options.safetyStock -

        options.stockBeforeDelivery -

        cumulativeKnownDeliveries

      );


    return Core.roundNumber(
      Math.max(
        0,
        minimumRequired,
        requiredForSafety
      )
    );

  }


  /* =====================================================
     MAIN PRODUCT CALCULATION
  ===================================================== */

  function calculateProduct(
    options
  ) {

    const Core =
      getCore();


    /* =================================================
       DATES
    ================================================= */

    const windowInfo =
      resolveWindow({

        orderDate:
          options.orderDate,

        orderDay:
          options.orderDay,

        deliverySchedule:
          options.deliverySchedule

      });


    const countDate =
      options.countDate ||
      options.orderDate;


    Core.parseDate(
      countDate
    );


    /*
      Физикалық остатокты
      заказ күнінен кейін санай алмаймыз.
    */

    if (
      countDate >
      windowInfo.orderDate
    ) {

      throw new Error(
        `countDate ${countDate} позже orderDate ${windowInfo.orderDate}`
      );

    }


    /* =================================================
       VALUES
    ================================================= */

    const startStock =
      Core.requireNumber(
        options.startStock,
        "startStock",
        {
          min: 0
        }
      );


    const dailyUsage =
      Core.requireNumber(
        options.dailyUsage,
        "dailyUsage",
        {
          min: 0
        }
      );


    const safetyStock =
      Core.requireNumber(
        options.safetyStock || 0,
        "safetyStock",
        {
          min: 0
        }
      );


    const caseToBase =
      Core.requireNumber(
        options.caseToBase,
        "caseToBase"
      );


    if (
      caseToBase <=
      Core.EPSILON
    ) {

      throw new Error(
        "У товара отсутствует case_to_base"
      );

    }


    /* =================================================
       EXISTING / KNOWN DELIVERIES
    ================================================= */

    const knownDeliveryMap =
      Core.buildDeliveryMap(
        options.knownDeliveries || []
      );


    /* =================================================
       1. ДОЖИВАЕТ ЛИ ТОВАР ДО МАШИНЫ
    ================================================= */

    const preDelivery =
      calculateStockBeforeDelivery({

        countDate,

        deliveryDate:
          windowInfo.deliveryDate,

        startStock,

        dailyUsage,

        knownDeliveryMap

      });


    /* =================================================
       2. НЕОБХОДИМОЕ КОЛИЧЕСТВО
    ================================================= */

    const rawRecommendedBaseQty =
      calculateRequiredBaseQty({

        deliveryDate:
          windowInfo.deliveryDate,

        coverageEndDate:
          windowInfo.coverageEndDate,

        stockBeforeDelivery:
          preDelivery.stockBeforeDelivery,

        dailyUsage,

        safetyStock,

        knownDeliveryMap

      });


    /* =================================================
       3. ТОЛЬКО CASE
    ================================================= */

    const rounded =
      Core.roundToCases(
        rawRecommendedBaseQty,
        caseToBase
      );


    /* =================================================
       4. ВСЕ ПОСТАВКИ
    ================================================= */

    const fullDeliveryMap =
      new Map(
        knownDeliveryMap
      );


    const existingOnDeliveryDate =
      fullDeliveryMap.get(
        windowInfo.deliveryDate
      ) || 0;


    /*
      Қазіргі recommended заказды
      delivery күніне қосамыз.
    */

    fullDeliveryMap.set(

      windowInfo.deliveryDate,

      Core.roundNumber(

        existingOnDeliveryDate +
        rounded.baseQty

      )

    );


    /* =================================================
       5. ПОЛНЫЙ ПРОГНОЗ

       countDate бастап
       coverageEndDate дейін.
    ================================================= */

    const forecast =
      Core.simulateDailyStock({

        startDate:
          countDate,

        endDate:
          windowInfo.coverageEndDate,

        startStock,

        dailyUsage,

        deliveryMap:
          fullDeliveryMap

      });


    /* =================================================
       6. SHORTAGE
    ================================================= */

    const shortageDays =
      forecast.filter(
        function (row) {

          return row.isShortage;

        }
      );


    const shortageBeforeDelivery =
      shortageDays.filter(
        function (row) {

          return (
            row.date <
            windowInfo.deliveryDate
          );

        }
      );


    const firstShortage =
      shortageDays[0] ||
      null;


    const finalRow =
      forecast[
        forecast.length - 1
      ];


    /* =================================================
       RESULT
    ================================================= */

    return {

      type:
        "cola",


      /* DATES */

      countDate,

      orderDate:
        windowInfo.orderDate,

      orderDay:
        windowInfo.orderDay,

      deliveryDate:
        windowInfo.deliveryDate,

      nextDeliveryDate:
        windowInfo.nextDeliveryDate,

      coverageEndDate:
        windowInfo.coverageEndDate,


      /* STOCK */

      startStock,

      stockBeforeDelivery:
        preDelivery.stockBeforeDelivery,

      dailyUsage,

      safetyStock,


      /* PACKAGE */

      caseToBase,


      /* ORDER */

      rawRecommendedBaseQty,

      recommendedCases:
        rounded.cases,

      recommendedBaseQty:
        rounded.baseQty,


      /* DAILY FORECAST */

      forecast,


      /* SHORTAGE */

      hasShortage:
        shortageDays.length > 0,

      hasShortageBeforeDelivery:
        shortageBeforeDelivery.length > 0,

      firstShortageDate:
        firstShortage
          ? firstShortage.date
          : null,

      shortageDays,


      /* END */

      endingStock:
        finalRow
          ? finalRow.closingStock
          : startStock

    };

  }


  /* =====================================================
     TESTS
  ===================================================== */

  function runTests() {

    const schedule = [

      {
        delivery_group:
          "cola",

        weekday:
          2,

        source_order_day:
          "monday",

        is_active:
          true
      },

      {
        delivery_group:
          "cola",

        weekday:
          5,

        source_order_day:
          "thursday",

        is_active:
          true
      }

    ];


    const tests =
      [];


    function assert(
      condition,
      message
    ) {

      if (!condition) {

        throw new Error(
          message
        );

      }

    }


    /* =================================================
       TEST 1
       ПН count → ВТ → ПТ
    ================================================= */

    const monday =
      calculateProduct({

        countDate:
          "2026-08-10",

        orderDate:
          "2026-08-10",

        orderDay:
          "monday",

        startStock:
          100,

        dailyUsage:
          30,

        safetyStock:
          20,

        caseToBase:
          10,

        deliverySchedule:
          schedule

      });


    assert(
      monday.deliveryDate ===
        "2026-08-11",
      "TEST 1 delivery"
    );


    assert(
      monday.coverageEndDate ===
        "2026-08-14",
      "TEST 1 coverage"
    );


    assert(
      monday.recommendedCases ===
        7,
      `TEST 1 cases = ${monday.recommendedCases}`
    );


    tests.push({
      test:
        "ПН → ВТ → ПТ",
      status:
        "✅",
      cases:
        monday.recommendedCases
    });


    /* =================================================
       TEST 2
       CASE ROUNDING
    ================================================= */

    const rounding =
      calculateProduct({

        countDate:
          "2026-08-10",

        orderDate:
          "2026-08-10",

        orderDay:
          "monday",

        startStock:
          100,

        dailyUsage:
          30,

        safetyStock:
          20,

        caseToBase:
          24,

        deliverySchedule:
          schedule

      });


    assert(
      rounding.recommendedCases ===
        3,
      "TEST 2 CASE rounding"
    );


    assert(
      rounding.recommendedBaseQty ===
        72,
      "TEST 2 base qty"
    );


    tests.push({
      test:
        "Округление CASE",
      status:
        "✅",
      cases:
        rounding.recommendedCases
    });


    /* =================================================
       TEST 3
       SHORTAGE ДО МАШИНЫ
    ================================================= */

    const shortage =
      calculateProduct({

        countDate:
          "2026-08-10",

        orderDate:
          "2026-08-10",

        orderDay:
          "monday",

        startStock:
          10,

        dailyUsage:
          30,

        safetyStock:
          0,

        caseToBase:
          10,

        deliverySchedule:
          schedule

      });


    assert(
      shortage.hasShortageBeforeDelivery ===
        true,
      "TEST 3 shortage"
    );


    assert(
      shortage.firstShortageDate ===
        "2026-08-10",
      "TEST 3 shortage date"
    );


    tests.push({
      test:
        "Shortage до машины",
      status:
        "✅",
      shortageDate:
        shortage.firstShortageDate
    });


    /* =================================================
       TEST 4
       ЧТ → ПТ → ВТ
    ================================================= */

    const thursday =
      calculateProduct({

        countDate:
          "2026-08-13",

        orderDate:
          "2026-08-13",

        orderDay:
          "thursday",

        startStock:
          100,

        dailyUsage:
          20,

        safetyStock:
          10,

        caseToBase:
          24,

        deliverySchedule:
          schedule

      });


    assert(
      thursday.deliveryDate ===
        "2026-08-14",
      "TEST 4 delivery"
    );


    assert(
      thursday.coverageEndDate ===
        "2026-08-18",
      "TEST 4 coverage"
    );


    assert(
      thursday.recommendedCases ===
        2,
      "TEST 4 cases"
    );


    tests.push({
      test:
        "ЧТ → ПТ → ВТ",
      status:
        "✅",
      cases:
        thursday.recommendedCases
    });


    /* =================================================
       TEST 5

       Остаток посчитан ВС 09.08
       Заказ ПН 10.08
       Поставка ВТ 11.08

       ВС расход та есептелуі керек.
    ================================================= */

    const earlyCount =
      calculateProduct({

        countDate:
          "2026-08-09",

        orderDate:
          "2026-08-10",

        orderDay:
          "monday",

        startStock:
          100,

        dailyUsage:
          30,

        safetyStock:
          20,

        caseToBase:
          10,

        deliverySchedule:
          schedule

      });


    /*
      ВС:
      100 - 30 = 70

      ПН:
      70 - 30 = 40

      ВТ-ПТ:
      4 × 30 = 120

      safety = 20

      нужно:
      120 + 20 - 40
      = 100

      = 10 case
    */

    assert(
      earlyCount.stockBeforeDelivery ===
        40,
      `TEST 5 stock before delivery = ${earlyCount.stockBeforeDelivery}`
    );


    assert(
      earlyCount.recommendedCases ===
        10,
      `TEST 5 cases = ${earlyCount.recommendedCases}`
    );


    assert(
      earlyCount.forecast[0]
        .date ===
        "2026-08-09",
      "TEST 5 forecast start"
    );


    tests.push({
      test:
        "ВС подсчет → ПН заказ",
      status:
        "✅",
      cases:
        earlyCount.recommendedCases
    });


    /* =================================================
       CONSOLE
    ================================================= */

    console.group(
      "[Step 3 Cola] TESTS"
    );


    console.table(
      tests
    );


    console.log(
      "EARLY COUNT EXAMPLE:"
    );


    console.table(
      earlyCount.forecast.map(
        function (row) {

          return {

            date:
              row.date,

            opening:
              row.openingStock,

            delivery:
              row.deliveryQty,

            usage:
              row.usageQty,

            closing:
              row.closingStock,

            shortage:
              row.shortageQty,

            status:
              row.isShortage
                ? "🔴 НЕ ХВАТАЕТ"
                : "✅ OK"

          };

        }
      )
    );


    console.log(
      "✅ COLA: 5/5 tests passed"
    );


    console.groupEnd();


    return {

      success:
        true,

      monday,

      rounding,

      shortage,

      thursday,

      earlyCount

    };

  }


  /* =====================================================
     PUBLIC API
  ===================================================== */

  window.OrderStep3Cola = {

    resolveWindow,

    calculateProduct,

    runTests

  };


  console.log(
    "[Step 3 Cola] loaded"
  );

})();