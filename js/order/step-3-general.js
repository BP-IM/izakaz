/* =====================================================
   I’M | ЗАКАЗ
   STEP 3 — GENERAL

   GENERAL BUSINESS LOGIC

   График Парк Сейфуллина:

   ПН заказ
   → ЧТ поставка
   → СБ поставка

   ЧТ заказ
   → ВТ поставка

   ВАЖНО:
   - заказ только CASE
   - сначала расход дня,
     затем поставка этого дня
   - минусовой расчетный остаток
     переносится на следующий день
   - поставка покрывает расход
     до дня следующей поставки включительно
   - safety_stock остается после
     последнего дня покрытия
   - учитываются уже ожидаемые поставки
   - CASE округляется вверх только если
     дробная часть больше 0.7
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
        "График поставок General не передан"
      );

    }


    return schedule
      .filter(
        function (row) {

          return (
            row.delivery_group ===
              "general" &&

            row.is_active !== false
          );

        }
      )

      .sort(
        function (a, b) {

          return (
            Number(a.weekday) -
            Number(b.weekday)
          );

        }
      );

  }


  /* =====================================================
     RESOLVE DELIVERY PLAN
  ===================================================== */

  function resolvePlan(
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
        "General заказ возможен только monday/thursday"
      );

    }


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


    if (!schedule.length) {

      throw new Error(
        "Для General отсутствует график поставок"
      );

    }


    /*
      Поставки, которые относятся
      именно к ТЕКУЩЕМУ заказу.
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
        `Не найдены General поставки для ${orderDay}`
      );

    }


    /*
      Определяем реальные даты.

      ПН:
      weekday 4 → ЧТ
      weekday 6 → СБ

      ЧТ:
      weekday 2 → следующий ВТ
    */

    const currentDeliveries =
      sourceRows

        .map(
          function (row) {

            return {

              scheduleRow:
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


    const lastCurrentDelivery =
      currentDeliveries[
        currentDeliveries.length - 1
      ];


    /*
      Находим СЛЕДУЮЩУЮ General машину
      после последней поставки текущего заказа.

      Для ПН:
      последняя = СБ
      следующая = ВТ

      Для ЧТ:
      текущая = ВТ
      следующая = ЧТ
    */

    const nextCandidates =
      schedule

        .map(
          function (row) {

            return {

              row,

              date:
                Core.nextWeekdayDate(
                  lastCurrentDelivery.date,
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
        "Не удалось определить следующую General поставку"
      );

    }


    const nextDeliveryDate =
      nextCandidates[0]
        .date;


    /*
      Поставка приходит ПОСЛЕ расхода дня.

      Поэтому текущая поставка должна
      покрыть также расход в день
      следующей поставки.

      Например:

      СБ машина покрывает
      СБ + ВС + ПН + ВТ.

      Во ВТ сначала учитываем расход,
      затем приходит следующая машина.
    */

    const coverageIncludesNextDeliveryDay =
      options.coverageIncludesNextDeliveryDay !==
      false;


    const coverageEndDate =
      coverageIncludesNextDeliveryDay

        ? nextDeliveryDate

        : Core.addDays(
            nextDeliveryDate,
            -1
          );


    /*
      Теперь каждой поставке
      даем свой отдельный период.

      ПН:

      ЧТ → ЧТ-ПТ-СБ
      СБ → СБ-ВС-ПН-ВТ
    */

    const deliveries =
      currentDeliveries.map(
        function (
          delivery,
          index
        ) {

          const nextCurrent =
            currentDeliveries[
              index + 1
            ];


          const segmentEndDate =
            nextCurrent

              ? (
                  coverageIncludesNextDeliveryDay

                    ? nextCurrent.date

                    : Core.addDays(
                        nextCurrent.date,
                        -1
                      )
                )

              : coverageEndDate;


          return {

            date:
              delivery.date,

            weekday:
              Number(
                delivery
                  .scheduleRow
                  .weekday
              ),

            sourceOrderDay:
              delivery
                .scheduleRow
                .source_order_day,

            coverageStartDate:
              delivery.date,

            coverageEndDate:
              segmentEndDate

          };

        }
      );


    return {

      orderDate,

      orderDay,

      deliveries,

      nextDeliveryDate,

      coverageEndDate

    };

  }


  /* =====================================================
     GENERAL DAILY STOCK

     Бизнес-порядок дня:

     openingStock
     - usage
     + delivery
     = closingStock

     Минусовой расчетный остаток
     НЕ обнуляется и переносится дальше.
  ===================================================== */

  function simulateGeneralDailyStock(
    options
  ) {

    const Core =
      getCore();


    let stock =
      Core.requireNumber(
        options.startStock,
        "startStock"
      );


    const dailyUsage =
      Core.requireNumber(
        options.dailyUsage,
        "dailyUsage",
        {
          min: 0
        }
      );


    const deliveryMap =
      options.deliveryMap instanceof Map

        ? options.deliveryMap

        : new Map();


    const dates =
      Core.getDateRange(
        options.startDate,
        options.endDate
      );


    return dates.map(
      function (date) {

        const openingStock =
          Core.roundNumber(
            stock
          );


        const stockAfterUsage =
          Core.roundNumber(

            openingStock -
            dailyUsage

          );


        const deliveryQty =
          Core.roundNumber(
            deliveryMap.get(date) || 0
          );


        const closingStock =
          Core.roundNumber(

            stockAfterUsage +
            deliveryQty

          );


        const isShortage =
          stockAfterUsage <
          -Core.EPSILON;


        const shortageQty =
          isShortage

            ? Core.roundNumber(
                Math.abs(
                  stockAfterUsage
                )
              )

            : 0;


        stock =
          closingStock;


        return {

          date,

          openingStock,

          availableQty:
            openingStock,

          usageQty:
            dailyUsage,

          stockAfterUsage,

          deliveryQty,

          closingStock,

          shortageQty,

          isShortage,

          status:
            isShortage
              ? "shortage"
              : "ok"

        };

      }
    );

  }


  /* =====================================================
     GET STOCK BEFORE DATE
  ===================================================== */

  function calculateStockBeforeDate(
    options
  ) {

    const Core =
      getCore();


    const dayBefore =
      Core.addDays(
        options.targetDate,
        -1
      );


    if (
      options.startDate >
      dayBefore
    ) {

      return {

        stock:
          options.startStock,

        forecast:
          []

      };

    }


    const forecast =
      simulateGeneralDailyStock({

        startDate:
          options.startDate,

        endDate:
          dayBefore,

        startStock:
          options.startStock,

        dailyUsage:
          options.dailyUsage,

        deliveryMap:
          options.deliveryMap

      });


    const last =
      forecast[
        forecast.length - 1
      ];


    return {

      stock:
        last
          ? last.closingStock
          : options.startStock,

      forecast

    };

  }


  /* =====================================================
     REQUIRED QTY FOR ONE SEGMENT
  ===================================================== */

  function calculateSegmentRequirement(
    options
  ) {

    const Core =
      getCore();


    const dates =
      Core.getDateRange(
        options.startDate,
        options.endDate
      );


    let stock =
      Core.roundNumber(
        options.stockBeforeDelivery
      );


    let minimumStock =
      stock;


    dates.forEach(
      function (date) {

        stock =
          Core.roundNumber(

            stock -
            options.dailyUsage +
            (
              options.deliveryMap
                .get(date) || 0
            )

          );


        minimumStock =
          Math.min(
            minimumStock,
            stock
          );

      }
    );


    /*
      Safety stock только на ПОСЛЕДНЕМ
      сегменте текущего заказа.
    */

    let requiredForSafety =
      0;


    if (
      options.includeSafetyStock
    ) {

      requiredForSafety =
        Core.roundNumber(

          options.safetyStock -
          stock

        );

    }


    return Core.roundNumber(
      Math.max(
        0,
        Math.abs(
          Math.min(
            0,
            minimumStock
          )
        ),
        requiredForSafety
      )
    );

  }


  /* =====================================================
     GENERAL CASE ROUNDING

     Дробная часть > 0.7  → вверх.
     Дробная часть <= 0.7 → вниз.

     Примеры:
     7.50 → 7 CASE
     7.70 → 7 CASE
     7.71 → 8 CASE
  ===================================================== */

  function roundGeneralToCases(
    requiredBaseQty,
    caseToBase
  ) {

    const Core =
      getCore();


    const required =
      Core.requireNumber(
        requiredBaseQty,
        "requiredBaseQty",
        {
          min: 0
        }
      );


    const caseSize =
      Core.requireNumber(
        caseToBase,
        "caseToBase"
      );


    if (
      caseSize <=
      Core.EPSILON
    ) {

      throw new Error(
        "У товара отсутствует корректный case_to_base"
      );

    }


    if (
      required <=
      Core.EPSILON
    ) {

      return {
        cases: 0,
        baseQty: 0
      };

    }


    const exactCases =
      required /
      caseSize;


    const wholeCases =
      Math.floor(
        exactCases +
        Core.EPSILON
      );


    const fraction =
      Core.roundNumber(
        exactCases -
        wholeCases
      );


    const cases =
      fraction >
      0.7 + Core.EPSILON

        ? wholeCases + 1

        : wholeCases;


    return {

      cases,

      baseQty:
        Core.roundNumber(
          cases *
          caseSize
        )

    };

  }


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


    const cases =
      Math.max(
        0,
        Math.round(
          Number(value) || 0
        )
      );


    return cases;

  }


  /* =====================================================
     MAIN CALCULATION
  ===================================================== */

  function calculateProduct(
    options
  ) {

    const Core =
      getCore();


    /* =================================================
       PLAN
    ================================================= */

    const plan =
      resolvePlan({

        orderDate:
          options.orderDate,

        orderDay:
          options.orderDay,

        deliverySchedule:
          options.deliverySchedule

      });


    /* =================================================
       INPUT
    ================================================= */

    const countDate =
      options.countDate ||
      options.orderDate;


    Core.parseDate(
      countDate
    );


    if (
      countDate >
      options.orderDate
    ) {

      throw new Error(
        `countDate ${countDate} позже orderDate ${options.orderDate}`
      );

    }


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
        "У товара отсутствует корректный case_to_base"
      );

    }


    /* =================================================
       ALREADY EXPECTED DELIVERIES
    ================================================= */

    const knownDeliveryMap =
      Core.buildDeliveryMap(
        options.knownDeliveries ||
        []
      );


    /*
      Этот map постепенно будет
      содержать:

      known incoming
      +
      наши новые рекомендации.
    */

    const calculationDeliveryMap =
      new Map(
        knownDeliveryMap
      );


    /* =================================================
       CALCULATE EACH PLANNED DELIVERY
    ================================================= */

    const calculatedDeliveries =
      [];


    plan.deliveries.forEach(
      function (
        plannedDelivery,
        index
      ) {

        /*
          Сколько реально останется
          перед этой машиной,
          с учетом предыдущих машин.
        */

        const before =
          calculateStockBeforeDate({

            startDate:
              countDate,

            targetDate:
              plannedDelivery.date,

            startStock,

            dailyUsage,

            deliveryMap:
              calculationDeliveryMap

          });


        const isLast =
          index ===
          plan.deliveries.length - 1;


        /*
          Сколько нужно именно
          для этого периода.
        */

        const rawRequiredBaseQty =
          calculateSegmentRequirement({

            startDate:
              plannedDelivery
                .coverageStartDate,

            endDate:
              plannedDelivery
                .coverageEndDate,

            stockBeforeDelivery:
              before.stock,

            dailyUsage,

            safetyStock,

            includeSafetyStock:
              isLast,

            deliveryMap:
              calculationDeliveryMap

          });


        /*
          Только полный CASE.
        */

        const automaticRounded =
          roundGeneralToCases(
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


        /*
          Добавляем рекомендацию
          в общий delivery map,
          чтобы следующая поставка
          видела остаток после этой.
        */

        const existingQty =
          calculationDeliveryMap.get(
            plannedDelivery.date
          ) || 0;


        calculationDeliveryMap.set(

          plannedDelivery.date,

          Core.roundNumber(

            existingQty +
            rounded.baseQty

          )

        );


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

          stockBeforeDelivery:
            before.stock,

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

      }
    );


    /* =================================================
       FULL FORECAST
    ================================================= */

    const rawForecast =
      simulateGeneralDailyStock({

        startDate:
          countDate,

        endDate:
          plan.coverageEndDate,

        startStock,

        dailyUsage,

        deliveryMap:
          calculationDeliveryMap

      });


    /*
      Maps для UI.
    */

    const recommendationMap =
      new Map();


    calculatedDeliveries
      .forEach(
        function (delivery) {

          recommendationMap.set(
            delivery.date,
            delivery
          );

        }
      );


    const forecast =
      rawForecast.map(
        function (row) {

          const recommended =
            recommendationMap.get(
              row.date
            );


          const knownQty =
            Number(
              knownDeliveryMap.get(
                row.date
              ) || 0
            );


          return {

            ...row,

            knownDeliveryQty:
              Core.roundNumber(
                knownQty
              ),

            recommendedDeliveryQty:
              recommended
                ? recommended
                    .recommendedBaseQty
                : 0,

            recommendedCases:
              recommended
                ? recommended
                    .recommendedCases
                : 0

          };

        }
      );


    /* =================================================
       SHORTAGE
    ================================================= */

    const shortageDays =
      forecast.filter(
        function (row) {

          return row.isShortage;

        }
      );


    const firstPlannedDelivery =
      calculatedDeliveries[0]
        ?.date ||
      null;


    const shortageBeforeFirstDelivery =
      firstPlannedDelivery

        ? shortageDays.filter(
            function (row) {

              return (
                row.date <
                firstPlannedDelivery
              );

            }
          )

        : [];


    /* =================================================
       TOTAL
    ================================================= */

    const totalRecommendedCases =
      calculatedDeliveries.reduce(
        function (
          total,
          delivery
        ) {

          return (
            total +
            delivery
              .recommendedCases
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

            delivery
              .recommendedBaseQty

          );

        },
        0
      );


    const finalRow =
      forecast[
        forecast.length - 1
      ];


    /* =================================================
       RESULT
    ================================================= */

    return {

      type:
        "general",


      /* DATE */

      countDate,

      orderDate:
        plan.orderDate,

      orderDay:
        plan.orderDay,

      nextDeliveryDate:
        plan.nextDeliveryDate,

      coverageEndDate:
        plan.coverageEndDate,


      /* STOCK */

      startStock,

      dailyUsage,

      safetyStock,

      caseToBase,


      /* DELIVERY SPLIT */

      deliveries:
        calculatedDeliveries,


      /* TOTAL ORDER */

      totalRecommendedCases,

      totalRecommendedBaseQty,


      /* FORECAST */

      forecast,


      /* RISK */

      hasShortage:
        shortageDays.length > 0,

      hasShortageBeforeFirstDelivery:
        shortageBeforeFirstDelivery
          .length > 0,

      firstShortageDate:
        shortageDays[0]
          ?.date ||
        null,

      shortageDays,


      /* FINAL */

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
       ПН → ЧТ + СБ
    ================================================= */

    const mondayPlan =
      resolvePlan({

        orderDate:
          "2026-08-10",

        orderDay:
          "monday",

        deliverySchedule:
          schedule

      });


    assert(
      mondayPlan
        .deliveries
        .length === 2,

      "TEST 1: должно быть 2 поставки"
    );


    assert(
      mondayPlan
        .deliveries[0]
        .date ===
        "2026-08-13",

      "TEST 1: первая поставка должна быть ЧТ 13.08"
    );


    assert(
      mondayPlan
        .deliveries[1]
        .date ===
        "2026-08-15",

      "TEST 1: вторая поставка должна быть СБ 15.08"
    );


    assert(
      mondayPlan
        .deliveries[0]
        .coverageEndDate ===
        "2026-08-15",

      "TEST 1: ЧТ покрывает до СБ включительно"
    );


    assert(
      mondayPlan
        .coverageEndDate ===
        "2026-08-18",

      "TEST 1: СБ покрывает до ВТ включительно"
    );


    tests.push({

      test:
        "ПН → ЧТ + СБ",

      status:
        "✅"

    });


    /* =================================================
       TEST 2
       РАЗДЕЛЕНИЕ ПОСТАВОК

       stock = 70
       usage = 20
       safety = 20
       case = 10

       ПН-СР:
       70 - 60 = 10

       ЧТ-СБ:
       нужно 60
       есть 10
       → 50 = 5 case

       после ПТ = 20

       СБ-ВТ:
       80 расход
       +20 safety
       -20 остаток перед СБ
       → 80 = 8 case

       итого = 13 case
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
          70,

        dailyUsage:
          20,

        safetyStock:
          20,

        caseToBase:
          10,

        deliverySchedule:
          schedule

      });


    assert(
      monday.deliveries[0]
        .recommendedCases ===
        5,

      `TEST 2: ЧТ cases = ${monday.deliveries[0].recommendedCases}`
    );


    assert(
      monday.deliveries[1]
        .recommendedCases ===
        8,

      `TEST 2: СБ cases = ${monday.deliveries[1].recommendedCases}`
    );


    assert(
      monday
        .totalRecommendedCases ===
        13,

      `TEST 2: total = ${monday.totalRecommendedCases}`
    );


    tests.push({

      test:
        "Разделение ЧТ / СБ",

      status:
        "✅",

      thursday:
        monday.deliveries[0]
          .recommendedCases,

      saturday:
        monday.deliveries[1]
          .recommendedCases,

      total:
        monday
          .totalRecommendedCases

    });


    /* =================================================
       TEST 3
       ЧТ → ВТ

       ВТ покрывает ВТ + СР + ЧТ.
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
          120,

        dailyUsage:
          20,

        safetyStock:
          20,

        caseToBase:
          24,

        deliverySchedule:
          schedule

      });


    assert(
      thursday
        .deliveries
        .length === 1,

      "TEST 3: должна быть одна поставка"
    );


    assert(
      thursday
        .deliveries[0]
        .date ===
        "2026-08-18",

      "TEST 3: поставка должна быть ВТ"
    );


    assert(
      thursday
        .coverageEndDate ===
        "2026-08-20",

      "TEST 3: покрытие должно быть до ЧТ включительно"
    );


    assert(
      thursday
        .totalRecommendedCases ===
        2,

      `TEST 3: cases = ${thursday.totalRecommendedCases}`
    );


    tests.push({

      test:
        "ЧТ → ВТ",

      status:
        "✅",

      cases:
        thursday
          .totalRecommendedCases

    });


    /* =================================================
       TEST 4
       KNOWN INCOMING

       Мысалы алдыңғы заказдан
       ВТ машина уже ожидается.
    ================================================= */

    const withIncoming =
      calculateProduct({

        countDate:
          "2026-08-10",

        orderDate:
          "2026-08-10",

        orderDay:
          "monday",

        startStock:
          40,

        dailyUsage:
          20,

        safetyStock:
          20,

        caseToBase:
          10,

        deliverySchedule:
          schedule,

        knownDeliveries: [

          {
            date:
              "2026-08-11",

            qty:
              60
          }

        ]

      });


    assert(
      withIncoming
        .hasShortageBeforeFirstDelivery ===
        false,

      "TEST 4: incoming должен убрать shortage"
    );


    tests.push({

      test:
        "Уже ожидаемая поставка",

      status:
        "✅",

      total:
        withIncoming
          .totalRecommendedCases

    });


    /* =================================================
       TEST 5
       COUNT DATE ДО ORDER DATE

       ВС считаем остаток,
       ПН делаем заказ.
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
          20,

        safetyStock:
          20,

        caseToBase:
          10,

        deliverySchedule:
          schedule

      });


    assert(
      earlyCount
        .forecast[0]
        .date ===
        "2026-08-09",

      "TEST 5: прогноз должен начинаться с countDate"
    );


    tests.push({

      test:
        "ВС подсчет → ПН заказ",

      status:
        "✅",

      total:
        earlyCount
          .totalRecommendedCases

    });


    /* =================================================
       TEST 6
       БИЗНЕС-ПРИМЕР САЛАТА

       ПН остаток 24, расход 15.
       ВТ ожидается 24.
       CASE = 6.

       ЧТ:
       дефицит до СБ = 42
       42 / 6 = 7 CASE.

       СБ:
       дефицит до ВТ = 45
       45 / 6 = 7.5
       дробная часть <= 0.7
       → 7 CASE.
    ================================================= */

    const salad =
      calculateProduct({

        countDate:
          "2026-08-10",

        orderDate:
          "2026-08-10",

        orderDay:
          "monday",

        startStock:
          24,

        dailyUsage:
          15,

        safetyStock:
          0,

        caseToBase:
          6,

        deliverySchedule:
          schedule,

        knownDeliveries: [

          {
            date:
              "2026-08-11",

            qty:
              24
          }

        ]

      });


    assert(
      salad.deliveries[0]
        .rawRecommendedBaseQty ===
        42,

      `TEST 6: ЧТ raw = ${salad.deliveries[0].rawRecommendedBaseQty}`
    );


    assert(
      salad.deliveries[0]
        .recommendedCases ===
        7,

      `TEST 6: ЧТ cases = ${salad.deliveries[0].recommendedCases}`
    );


    assert(
      salad.deliveries[1]
        .rawRecommendedBaseQty ===
        45,

      `TEST 6: СБ raw = ${salad.deliveries[1].rawRecommendedBaseQty}`
    );


    assert(
      salad.deliveries[1]
        .recommendedCases ===
        7,

      `TEST 6: СБ cases = ${salad.deliveries[1].recommendedCases}`
    );


    tests.push({

      test:
        "Салат 24 / 15 / 24 / case 6",

      status:
        "✅",

      thursday:
        salad.deliveries[0]
          .recommendedCases,

      saturday:
        salad.deliveries[1]
          .recommendedCases,

      total:
        salad.totalRecommendedCases

    });


    /* =================================================
       CONSOLE
    ================================================= */

    console.group(
      "[Step 3 General] TESTS"
    );


    console.table(
      tests
    );


    console.log(
      "MONDAY DELIVERY SPLIT:"
    );


    console.table(
      monday.deliveries.map(
        function (delivery) {

          return {

            date:
              delivery.date,

            coverage:
              `${delivery.coverageStartDate} → ${delivery.coverageEndDate}`,

            stock_before:
              delivery
                .stockBeforeDelivery,

            raw:
              delivery
                .rawRecommendedBaseQty,

            case:
              delivery
                .recommendedCases,

            base:
              delivery
                .recommendedBaseQty

          };

        }
      )
    );


    console.log(
      "MONDAY DAILY FORECAST:"
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
      "✅ GENERAL: 6/6 tests passed"
    );


    console.groupEnd();


    return {

      success:
        true,

      mondayPlan,

      monday,

      thursday,

      withIncoming,

      earlyCount,

      salad

    };

  }


  /* =====================================================
     PUBLIC API
  ===================================================== */

  window.OrderStep3General = {

    resolvePlan,

    calculateProduct,

    runTests

  };


  console.log(
    "[Step 3 General] loaded"
  );

})();
