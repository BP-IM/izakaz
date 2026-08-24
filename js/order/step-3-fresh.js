/* =====================================================
   I’M | ЗАКАЗ
   STEP 3 — FRESH / FEFO ENGINE

   RULES:
   - расход FEFO
   - товар пригоден ВКЛЮЧИТЕЛЬНО
     до expiry_date
   - остаток просрочивается
     В КОНЦЕ expiry_date
   - recommendation только CASE
   - Fresh использует General delivery schedule
===================================================== */

(function () {
  "use strict";


  /* =====================================================
     DEPENDENCIES
  ===================================================== */

  function getCore() {

    if (!window.OrderStep3Core) {

      throw new Error(
        "OrderStep3Core не загружен"
      );

    }


    return window.OrderStep3Core;

  }


  function getGeneral() {

    if (!window.OrderStep3General) {

      throw new Error(
        "OrderStep3General не загружен"
      );

    }


    return window.OrderStep3General;

  }


  /* =====================================================
     LOT HELPERS
  ===================================================== */

  function cloneLots(lots) {

    return (
      Array.isArray(lots)
        ? lots
        : []
    )
      .map(
        function (
          lot,
          index
        ) {

          const qty =
            Number(
              lot.qty ?? 0
            );


          if (
            !Number.isFinite(qty) ||
            qty < 0
          ) {

            throw new Error(
              `Некорректное количество партии #${index + 1}`
            );

          }


          const expiryDate =
            lot.expiryDate ||
            null;


          if (expiryDate) {

            getCore().parseDate(
              expiryDate
            );

          }


          return {

            id:
              lot.id ||
              `lot-${index + 1}`,

            expiryDate,

            qty:
              getCore()
                .roundNumber(qty),

            source:
              lot.source ||
              "stock"

          };

        }
      )
      .filter(
        function (lot) {

          return (
            lot.qty >
            getCore().EPSILON
          );

        }
      );

  }


  function sortLotsFEFO(lots) {

    lots.sort(
      function (a, b) {

        /*
          Null expiry = поставка,
          которая считается годной
          весь текущий горизонт расчета.
        */

        if (
          !a.expiryDate &&
          !b.expiryDate
        ) {

          return 0;

        }


        if (!a.expiryDate) {

          return 1;

        }


        if (!b.expiryDate) {

          return -1;

        }


        return (
          a.expiryDate.localeCompare(
            b.expiryDate
          )
        );

      }
    );


    return lots;

  }


  function getTotalQty(lots) {

    const Core =
      getCore();


    return Core.roundNumber(

      lots.reduce(
        function (
          total,
          lot
        ) {

          return (
            total +
            Number(lot.qty || 0)
          );

        },
        0
      )

    );

  }


  /* =====================================================
     DELIVERY MAP
  ===================================================== */

  function buildQtyMap(
    deliveries
  ) {

    const Core =
      getCore();


    const map =
      new Map();


    (
      Array.isArray(deliveries)
        ? deliveries
        : []
    )
      .forEach(
        function (delivery) {

          if (
            !delivery ||
            !delivery.date
          ) {

            return;

          }


          Core.parseDate(
            delivery.date
          );


          const qty =
            Number(
              delivery.qty || 0
            );


          if (
            !Number.isFinite(qty) ||
            qty < 0
          ) {

            throw new Error(
              `Некорректная поставка ${delivery.date}`
            );

          }


          const previous =
            Number(
              map.get(
                delivery.date
              ) || 0
            );


          map.set(

            delivery.date,

            Core.roundNumber(
              previous + qty
            )

          );

        }
      );


    return map;

  }


  /* =====================================================
     ADD DELIVERY LOT
  ===================================================== */

  function addDeliveryLot(
    lots,
    options
  ) {

    const Core =
      getCore();


    const qty =
      Number(
        options.qty || 0
      );


    if (
      qty <=
      Core.EPSILON
    ) {

      return;

    }


    lots.push({

      id:
        options.id ||
        `${options.source}-${options.date}`,

      /*
        Для incoming/new order пока
        считаем товар годным весь
        горизонт расчета.

        Срок текущего физического
        остатка приходит из Step 1 lots.
      */

      expiryDate:
        null,

      qty:
        Core.roundNumber(qty),

      source:
        options.source

    });


    sortLotsFEFO(
      lots
    );

  }


  /* =====================================================
     CONSUME FEFO
  ===================================================== */

  function consumeFEFO(
    lots,
    usageQty
  ) {

    const Core =
      getCore();


    let remainingUsage =
      Number(
        usageQty || 0
      );


    const consumed =
      [];


    sortLotsFEFO(
      lots
    );


    for (
      const lot
      of lots
    ) {

      if (
        remainingUsage <=
        Core.EPSILON
      ) {

        break;

      }


      if (
        lot.qty <=
        Core.EPSILON
      ) {

        continue;

      }


      const take =
        Math.min(
          lot.qty,
          remainingUsage
        );


      lot.qty =
        Core.roundNumber(
          lot.qty - take
        );


      remainingUsage =
        Core.roundNumber(
          remainingUsage - take
        );


      consumed.push({

        lotId:
          lot.id,

        expiryDate:
          lot.expiryDate,

        source:
          lot.source,

        qty:
          Core.roundNumber(
            take
          )

      });

    }


    return {

      consumed,

      shortageQty:
        Core.roundNumber(
          Math.max(
            0,
            remainingUsage
          )
        )

    };

  }


  /* =====================================================
     REMOVE EXPIRED AFTER DAY
  ===================================================== */

  function expireEndOfDay(
    lots,
    date
  ) {

    const Core =
      getCore();


    const expired =
      [];


    lots.forEach(
      function (lot) {

        if (
          lot.expiryDate ===
            date &&

          lot.qty >
            Core.EPSILON
        ) {

          expired.push({

            lotId:
              lot.id,

            expiryDate:
              lot.expiryDate,

            source:
              lot.source,

            qty:
              Core.roundNumber(
                lot.qty
              )

          });


          lot.qty =
            0;

        }

      }
    );


    const expiredQty =
      Core.roundNumber(

        expired.reduce(
          function (
            total,
            item
          ) {

            return (
              total +
              item.qty
            );

          },
          0
        )

      );


    /*
      Убираем пустые партии.
    */

    for (
      let index =
        lots.length - 1;

      index >= 0;

      index--
    ) {

      if (
        lots[index].qty <=
        Core.EPSILON
      ) {

        lots.splice(
          index,
          1
        );

      }

    }


    return {

      expired,

      expiredQty

    };

  }


  /* =====================================================
     REMOVE ALREADY EXPIRED BEFORE DAY

     Защита, если вдруг в данных
     есть срок меньше countDate.
  ===================================================== */

  function removeOldExpired(
    lots,
    date
  ) {

    const Core =
      getCore();


    let expiredQty =
      0;


    for (
      let index =
        lots.length - 1;

      index >= 0;

      index--
    ) {

      const lot =
        lots[index];


      if (
        lot.expiryDate &&
        lot.expiryDate <
          date
      ) {

        expiredQty =
          Core.roundNumber(

            expiredQty +
            lot.qty

          );


        lots.splice(
          index,
          1
        );

      }

    }


    return expiredQty;

  }


  /* =====================================================
     SIMULATE PERIOD
  ===================================================== */

  function simulatePeriod(
    options
  ) {

    const Core =
      getCore();


    const startDate =
      options.startDate;


    const endDate =
      options.endDate;


    Core.parseDate(
      startDate
    );


    Core.parseDate(
      endDate
    );


    if (
      startDate >
      endDate
    ) {

      return {

        forecast:
          [],

        endingLots:
          cloneLots(
            options.startLots
          ),

        shortageTotal:
          0,

        expiredTotal:
          0,

        endingStock:
          getTotalQty(
            cloneLots(
              options.startLots
            )
          )

      };

    }


    const dailyUsage =
      Core.requireNumber(
        options.dailyUsage,
        "dailyUsage",
        {
          min: 0
        }
      );


    const knownMap =
      options.knownMap ||
      new Map();


    const recommendedMap =
      options.recommendedMap ||
      new Map();


    const lots =
      cloneLots(
        options.startLots
      );


    let shortageTotal =
      0;


    let expiredTotal =
      0;


    const forecast =
      [];


    const dates =
      Core.getDateRange(
        startDate,
        endDate
      );


    dates.forEach(
      function (date) {

        /*
          Старые просроченные партии
          на начало дня использовать нельзя.
        */

        const expiredBeforeDay =
          removeOldExpired(
            lots,
            date
          );


        expiredTotal =
          Core.roundNumber(

            expiredTotal +
            expiredBeforeDay

          );


        const openingStock =
          getTotalQty(
            lots
          );


        /*
          Поставка приходит ДО расхода.
        */

        const knownDeliveryQty =
          Core.roundNumber(
            Number(
              knownMap.get(date) || 0
            )
          );


        const recommendedDeliveryQty =
          Core.roundNumber(
            Number(
              recommendedMap.get(date) || 0
            )
          );


        addDeliveryLot(
          lots,
          {
            id:
              `known-${date}`,

            date,

            qty:
              knownDeliveryQty,

            source:
              "known"
          }
        );


        addDeliveryLot(
          lots,
          {
            id:
              `recommended-${date}`,

            date,

            qty:
              recommendedDeliveryQty,

            source:
              "recommended"
          }
        );


        const availableStock =
          getTotalQty(
            lots
          );


        /*
          FEFO расход.
        */

        const usage =
          consumeFEFO(
            lots,
            dailyUsage
          );


        shortageTotal =
          Core.roundNumber(

            shortageTotal +
            usage.shortageQty

          );


        /*
          Срок включительно.

          То есть сначала расход,
          ПОТОМ списываем остаток,
          срок которого = сегодня.
        */

        const expiry =
          expireEndOfDay(
            lots,
            date
          );


        expiredTotal =
          Core.roundNumber(

            expiredTotal +
            expiry.expiredQty

          );


        const closingStock =
          getTotalQty(
            lots
          );


        forecast.push({

          date,

          openingStock,

          knownDeliveryQty,

          recommendedDeliveryQty,

          deliveryQty:
            Core.roundNumber(
              knownDeliveryQty +
              recommendedDeliveryQty
            ),

          availableStock,

          usageQty:
            dailyUsage,

          consumedLots:
            usage.consumed,

          shortageQty:
            usage.shortageQty,

          isShortage:
            usage.shortageQty >
            Core.EPSILON,

          expiredQty:
            expiry.expiredQty,

          expiredLots:
            expiry.expired,

          closingStock,

          lotsAfter:
            cloneLots(
              lots
            )

        });

      }
    );


    return {

      forecast,

      endingLots:
        cloneLots(
          lots
        ),

      shortageTotal,

      expiredTotal,

      endingStock:
        getTotalQty(
          lots
        )

    };

  }


  /* =====================================================
     MAIN CALCULATION
  ===================================================== */

  function getDeliveryCaseOverride(
    overrides,
    deliveryDate
  ) {

    let exists =
      false;


    let value;


    if (
      overrides instanceof Map
    ) {

      exists =
        overrides.has(
          deliveryDate
        );


      value =
        overrides.get(
          deliveryDate
        );

    } else if (
      overrides &&
      typeof overrides === "object"
    ) {

      exists =
        Object.prototype
          .hasOwnProperty.call(
            overrides,
            deliveryDate
          );


      value =
        overrides[
          deliveryDate
        ];

    }


    if (!exists) {

      return null;

    }


    return Math.max(
      0,
      Math.round(
        Number(value) || 0
      )
    );

  }

  function calculateProduct(
    options
  ) {

    const Core =
      getCore();


    const General =
      getGeneral();


    /* =================================================
       DATES / PLAN
    ================================================= */

    const countDate =
      options.countDate ||
      options.orderDate;


    Core.parseDate(
      countDate
    );


    Core.parseDate(
      options.orderDate
    );


    if (
      countDate >
      options.orderDate
    ) {

      throw new Error(
        "countDate не может быть позже orderDate"
      );

    }


    /*
      Fresh использует тот же
      delivery schedule, что General.
    */

    const plan =
      General.resolvePlan({

        orderDate:
          options.orderDate,

        orderDay:
          options.orderDay,

        deliverySchedule:
          options.deliverySchedule,

        coverageIncludesNextDeliveryDay:
          false

      });


    /* =================================================
       INPUT
    ================================================= */

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
        "Не указан case_to_base"
      );

    }


    const startLots =
      cloneLots(
        options.lots
      );


    const startStock =
      getTotalQty(
        startLots
      );


    const knownMap =
      buildQtyMap(
        options.knownDeliveries
      );


    const recommendedMap =
      new Map();


    /* =================================================
       STOCK BEFORE FIRST DELIVERY
    ================================================= */

    let currentLots =
      cloneLots(
        startLots
      );


    let cursorDate =
      countDate;


    const calculatedDeliveries =
      [];


    plan.deliveries.forEach(
      function (
        plannedDelivery,
        deliveryIndex
      ) {

        /*
          1. Симулируем дни ДО этой машины.
        */

        const dayBeforeDelivery =
          Core.addDays(
            plannedDelivery.date,
            -1
          );


        if (
          cursorDate <=
          dayBeforeDelivery
        ) {

          const before =
            simulatePeriod({

              startDate:
                cursorDate,

              endDate:
                dayBeforeDelivery,

              startLots:
                currentLots,

              dailyUsage,

              knownMap,

              recommendedMap

            });


          currentLots =
            before.endingLots;

        }


        const stockBeforeDelivery =
          getTotalQty(
            currentLots
          );


        /*
          2. Рассчитываем этот сегмент
          БЕЗ текущей новой рекомендации.

          Known incoming учитывается.
        */

        const withoutNewOrder =
          simulatePeriod({

            startDate:
              plannedDelivery
                .coverageStartDate,

            endDate:
              plannedDelivery
                .coverageEndDate,

            startLots:
              currentLots,

            dailyUsage,

            knownMap,

            recommendedMap

          });


        const isLast =
          deliveryIndex ===
          plan.deliveries.length - 1;


        /*
          Сколько товара не хватило
          для фактического расхода.
        */

        const shortageNeed =
          withoutNewOrder
            .shortageTotal;


        /*
          Safety stock нужен только
          после последнего периода.
        */

        const safetyNeed =
          isLast

            ? Math.max(
                0,

                safetyStock -
                withoutNewOrder
                  .endingStock
              )

            : 0;


        const rawRequiredBaseQty =
          Core.roundNumber(

            shortageNeed +
            safetyNeed

          );


        /*
          Только полный CASE.
        */

        const automaticRounded =
          Core.roundToCases(
            rawRequiredBaseQty,
            caseToBase
          );


        const overriddenCases =
          getDeliveryCaseOverride(
            options.deliveryCaseOverrides,
            plannedDelivery.date
          );


        const isManualOverride =
          overriddenCases !==
          null;


        const rounded =
          isManualOverride

            ? {

                cases:
                  overriddenCases,

                baseQty:
                  Core.roundNumber(

                    overriddenCases *
                    caseToBase

                  )

              }

            : automaticRounded;


        recommendedMap.set(

          plannedDelivery.date,

          Core.roundNumber(

            Number(
              recommendedMap.get(
                plannedDelivery.date
              ) || 0
            ) +

            rounded.baseQty

          )

        );


        /*
          3. Теперь прогоняем сегмент
          уже С нашей рекомендацией,
          чтобы получить реальные
          партии для следующей машины.
        */

        const actualSegment =
          simulatePeriod({

            startDate:
              plannedDelivery
                .coverageStartDate,

            endDate:
              plannedDelivery
                .coverageEndDate,

            startLots:
              currentLots,

            dailyUsage,

            knownMap,

            recommendedMap

          });


        calculatedDeliveries.push({

          date:
            plannedDelivery.date,

          weekday:
            plannedDelivery.weekday,

          coverageStartDate:
            plannedDelivery
              .coverageStartDate,

          coverageEndDate:
            plannedDelivery
              .coverageEndDate,

          stockBeforeDelivery,

          rawRecommendedBaseQty:
            rawRequiredBaseQty,

          automaticRecommendedCases:
            automaticRounded.cases,

          automaticRecommendedBaseQty:
            automaticRounded.baseQty,

          isManualOverride,

          recommendedCases:
            rounded.cases,

          recommendedBaseQty:
            rounded.baseQty

        });


        currentLots =
          actualSegment
            .endingLots;


        cursorDate =
          Core.addDays(
            plannedDelivery
              .coverageEndDate,
            1
          );

      }
    );


    /* =================================================
       FULL FORECAST
    ================================================= */

    const full =
      simulatePeriod({

        startDate:
          countDate,

        endDate:
          plan.coverageEndDate,

        startLots,

        dailyUsage,

        knownMap,

        recommendedMap

      });


    const recommendationByDate =
      new Map();


    calculatedDeliveries
      .forEach(
        function (delivery) {

          recommendationByDate.set(
            delivery.date,
            delivery
          );

        }
      );


    const forecast =
      full.forecast.map(
        function (row) {

          const recommendation =
            recommendationByDate.get(
              row.date
            );


          return {

            ...row,

            recommendedCases:
              recommendation
                ?.recommendedCases ||
              0

          };

        }
      );


    /* =================================================
       RISKS
    ================================================= */

    const shortageDays =
      forecast.filter(
        function (row) {

          return row.isShortage;

        }
      );


    const expiryDays =
      forecast.filter(
        function (row) {

          return (
            row.expiredQty >
            Core.EPSILON
          );

        }
      );


    const firstDeliveryDate =
      calculatedDeliveries[0]
        ?.date ||
      null;


    const shortageBeforeFirstDelivery =
      firstDeliveryDate

        ? shortageDays.filter(
            function (row) {

              return (
                row.date <
                firstDeliveryDate
              );

            }
          )

        : [];


    /* =================================================
       TOTAL ORDER
    ================================================= */

    const totalRecommendedCases =
      calculatedDeliveries.reduce(
        function (
          total,
          delivery
        ) {

          return (
            total +
            Number(
              delivery
                .recommendedCases ||
              0
            )
          );

        },
        0
      );


    const totalRecommendedBaseQty =
      calculatedDeliveries.reduce(
        function (
          total,
          delivery
        ) {

          return Core.roundNumber(

            total +
            Number(
              delivery
                .recommendedBaseQty ||
              0
            )

          );

        },
        0
      );


    /* =================================================
       RESULT
    ================================================= */

    return {

      type:
        "fresh",

      countDate,

      orderDate:
        options.orderDate,

      orderDay:
        options.orderDay,

      coverageEndDate:
        plan.coverageEndDate,

      nextDeliveryDate:
        plan.nextDeliveryDate,


      /* INPUT */

      startLots,

      startStock,

      dailyUsage,

      safetyStock,

      caseToBase,


      /* ORDER */

      deliveries:
        calculatedDeliveries,

      totalRecommendedCases,

      totalRecommendedBaseQty,


      /* FORECAST */

      forecast,

      endingLots:
        full.endingLots,

      endingStock:
        full.endingStock,


      /* EXPIRY */

      totalExpiredQty:
        full.expiredTotal,

      hasExpiry:
        expiryDays.length > 0,

      firstExpiryDate:
        expiryDays[0]
          ?.date ||
        null,

      expiryDays,


      /* SHORTAGE */

      hasShortage:
        shortageDays.length > 0,

      hasShortageBeforeFirstDelivery:
        shortageBeforeFirstDelivery
          .length > 0,

      firstShortageDate:
        shortageDays[0]
          ?.date ||
        null,

      shortageDays

    };

  }


  /* =====================================================
     TESTS
  ===================================================== */

  function runTests() {

    const Core =
      getCore();


    const schedule = [

      {
        delivery_group:
          "general",

        weekday:
          2,

        source_order_day:
          "thursday",

        is_active:
          true
      },

      {
        delivery_group:
          "general",

        weekday:
          4,

        source_order_day:
          "monday",

        is_active:
          true
      },

      {
        delivery_group:
          "general",

        weekday:
          6,

        source_order_day:
          "monday",

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
       FEFO

       5 ед срок 10.08
       10 ед срок 12.08
       расход 6

       Сначала должны уйти
       5 ед из ранней партии.
    ================================================= */

    const fefo =
      simulatePeriod({

        startDate:
          "2026-08-10",

        endDate:
          "2026-08-10",

        startLots: [

          {
            id:
              "late",

            expiryDate:
              "2026-08-12",

            qty:
              10
          },

          {
            id:
              "early",

            expiryDate:
              "2026-08-10",

            qty:
              5
          }

        ],

        dailyUsage:
          6

      });


    const firstConsumed =
      fefo
        .forecast[0]
        .consumedLots[0];


    assert(
      firstConsumed
        .lotId ===
        "early",

      "TEST 1: FEFO не использовал ранний срок первым"
    );


    tests.push({

      test:
        "FEFO",

      status:
        "✅"

    });


    /* =================================================
       TEST 2
       СРОК ВКЛЮЧИТЕЛЬНО

       10 ед срок 10.08
       расход 6

       В этот день 6 можно использовать,
       остаток 4 просрочится вечером.
    ================================================= */

    const expiryInclusive =
      simulatePeriod({

        startDate:
          "2026-08-10",

        endDate:
          "2026-08-10",

        startLots: [

          {
            id:
              "milk",

            expiryDate:
              "2026-08-10",

            qty:
              10
          }

        ],

        dailyUsage:
          6

      });


    assert(
      expiryInclusive
        .forecast[0]
        .shortageQty ===
        0,

      "TEST 2: товар должен использоваться в день срока"
    );


    assert(
      expiryInclusive
        .forecast[0]
        .expiredQty ===
        4,

      `TEST 2: должно просрочиться 4, факт ${expiryInclusive.forecast[0].expiredQty}`
    );


    assert(
      expiryInclusive
        .forecast[0]
        .closingStock ===
        0,

      "TEST 2: после срока остаток должен быть 0"
    );


    tests.push({

      test:
        "Срок включительно",

      status:
        "✅"

    });


    /* =================================================
       TEST 3
       ПН → ЧТ + СБ

       40 ед.
       срок = СР 12.08
       расход = 10

       ПН-СР расход = 30
       10 остатка просрочится СР вечером

       ЧТ-ПТ нужно 20 → 2 case
       СБ-ПН нужно 30 + safety 10
       → 4 case
    ================================================= */

    const monday =
      calculateProduct({

        countDate:
          "2026-08-10",

        orderDate:
          "2026-08-10",

        orderDay:
          "monday",

        lots: [

          {
            id:
              "fresh-start",

            expiryDate:
              "2026-08-12",

            qty:
              40
          }

        ],

        dailyUsage:
          10,

        safetyStock:
          10,

        caseToBase:
          10,

        deliverySchedule:
          schedule

      });


    assert(
      monday
        .deliveries
        .length ===
        2,

      "TEST 3: ПН должен создать ЧТ + СБ"
    );


    assert(
      monday
        .deliveries[0]
        .date ===
        "2026-08-13",

      "TEST 3: первая машина должна быть ЧТ"
    );


    assert(
      monday
        .deliveries[1]
        .date ===
        "2026-08-15",

      "TEST 3: вторая машина должна быть СБ"
    );


    assert(
      monday
        .deliveries[0]
        .recommendedCases ===
        2,

      `TEST 3: ЧТ ожидалось 2 case, факт ${monday.deliveries[0].recommendedCases}`
    );


    assert(
      monday
        .deliveries[1]
        .recommendedCases ===
        4,

      `TEST 3: СБ ожидалось 4 case, факт ${monday.deliveries[1].recommendedCases}`
    );


    tests.push({

      test:
        "ПН → ЧТ + СБ",

      status:
        "✅",

      thursday:
        monday
          .deliveries[0]
          .recommendedCases,

      saturday:
        monday
          .deliveries[1]
          .recommendedCases

    });


    /* =================================================
       TEST 4
       SHORTAGE ДО ПЕРВОЙ МАШИНЫ

       СБ countDate.
       30 ед срок = СБ.
       usage 10.

       СБ используем 10,
       вечером 20 expires.

       ВС / ПН / ВТ / СР
       уже shortage до ЧТ.
    ================================================= */

    const shortage =
      calculateProduct({

        countDate:
          "2026-08-08",

        orderDate:
          "2026-08-10",

        orderDay:
          "monday",

        lots: [

          {
            id:
              "short-life",

            expiryDate:
              "2026-08-08",

            qty:
              30
          }

        ],

        dailyUsage:
          10,

        safetyStock:
          0,

        caseToBase:
          10,

        deliverySchedule:
          schedule

      });


    assert(
      shortage
        .hasShortageBeforeFirstDelivery ===
        true,

      "TEST 4: должен быть shortage до первой машины"
    );


    assert(
      shortage
        .firstShortageDate ===
        "2026-08-09",

      `TEST 4: shortage должен начаться 09.08, факт ${shortage.firstShortageDate}`
    );


    tests.push({

      test:
        "Shortage из-за срока",

      status:
        "✅",

      date:
        shortage
          .firstShortageDate

    });


    /* =================================================
       TEST 5
       ЧТ → ВТ
    ================================================= */

    const thursday =
      calculateProduct({

        countDate:
          "2026-08-13",

        orderDate:
          "2026-08-13",

        orderDay:
          "thursday",

        lots: [

          {
            id:
              "start",

            expiryDate:
              "2026-08-17",

            qty:
              50
          }

        ],

        dailyUsage:
          10,

        safetyStock:
          10,

        caseToBase:
          10,

        deliverySchedule:
          schedule

      });


    assert(
      thursday
        .deliveries
        .length ===
        1,

      "TEST 5: ЧТ должен иметь одну машину"
    );


    assert(
      thursday
        .deliveries[0]
        .date ===
        "2026-08-18",

      "TEST 5: ЧТ заказ должен приехать ВТ 18.08"
    );


    assert(
      thursday
        .coverageEndDate ===
        "2026-08-19",

      "TEST 5: покрытие должно закончиться СР 19.08"
    );


    tests.push({

      test:
        "ЧТ → ВТ",

      status:
        "✅",

      delivery:
        thursday
          .deliveries[0]
          .date

    });


    /* =================================================
       OUTPUT
    ================================================= */

    console.group(
      "[Step 3 Fresh] TESTS"
    );


    console.table(
      tests
    );


    console.log(
      "MONDAY DELIVERIES:"
    );


    console.table(
      monday.deliveries
    );


    console.log(
      "MONDAY FEFO FORECAST:"
    );


    console.table(
      monday.forecast.map(
        function (row) {

          return {

            date:
              row.date,

            opening:
              row.openingStock,

            known:
              row.knownDeliveryQty,

            new_order:
              row.recommendedDeliveryQty,

            cases:
              row.recommendedCases,

            usage:
              row.usageQty,

            expired:
              row.expiredQty,

            shortage:
              row.shortageQty,

            closing:
              row.closingStock,

            status:
              row.isShortage
                ? "🔴 НЕ ХВАТАЕТ"
                : (
                    row.expiredQty >
                    Core.EPSILON
                      ? "🟠 СРОК"
                      : "✅ OK"
                  )

          };

        }
      )
    );


    console.log(
      "✅ FRESH: 5/5 tests passed"
    );


    console.groupEnd();


    return {

      success:
        true,

      fefo,

      expiryInclusive,

      monday,

      shortage,

      thursday

    };

  }


  /* =====================================================
     PUBLIC API
  ===================================================== */

  window.OrderStep3Fresh = {

    cloneLots,

    simulatePeriod,

    calculateProduct,

    runTests

  };


  console.log(
    "[Step 3 Fresh] loaded"
  );

})();
