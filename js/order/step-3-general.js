/* =====================================================
   I’M | ЗАКАЗ
   STEP 3 — GENERAL

   Используется для:
   - Freezer
   - Cooler
   - Dry

   BUSINESS LOGIC

   ПН заказ:
   → ЧТ поставка
   → СБ поставка

   ЧТ заказ:
   → ВТ поставка

   ПОРЯДОК ДНЯ:
   opening stock
   - расход дня
   + поставка дня
   = closing stock

   То есть поставка приходит
   ПОСЛЕ расхода этого дня.

   ПН заказ:
   ЧТ поставка покрывает:
   → ПТ + СБ

   СБ поставка покрывает:
   → ВС + ПН + ВТ

   ЧТ заказ:
   ВТ поставка покрывает:
   → СР + ЧТ

   ВАЖНО:
   - учитываем already expected deliveries
   - CASE всегда целый
   - если товара не хватает хотя бы немного,
     округляем CASE вверх
   - старого правила 0.7 НЕТ
   - safety_stock = 0 → целевой остаток 0
   - safety_stock > 0 → запас должен остаться
     в конце КАЖДОГО периода покрытия
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

            row.is_active !==
              false
          );

        }
      )

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

  }


  /* =====================================================
     DELIVERY PLAN
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
      orderDay !==
        "monday" &&

      orderDay !==
        "thursday"
    ) {

      throw new Error(
        "General заказ возможен только monday/thursday"
      );

    }


    /*
      Проверяем, что реальная дата
      соответствует order_day.
    */

    const expectedWeekday =
      orderDay ===
        "monday"

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
      Берем только поставки,
      которые формирует ТЕКУЩИЙ заказ.

      Например:

      monday:
      ЧТ + СБ

      thursday:
      ВТ
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
      Получаем реальные даты
      поставок этого заказа.
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
                  row.weekday,
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
      Ищем следующую машину
      ПОСЛЕ последней машины
      текущего заказа.

      Например:

      ПН заказ:
      последняя = СБ
      следующая = ВТ

      ЧТ заказ:
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
                  row.weekday,
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
      Каждая поставка начинает
      покрывать товар СО СЛЕДУЮЩЕГО ДНЯ.

      Потому что в день поставки:

      сначала расход,
      потом машина.

      ПН заказ:

      ЧТ 17.09
      → покрывает 18.09–19.09

      СБ 19.09
      → покрывает 20.09–22.09
    */

    const deliveries =
      currentDeliveries.map(
        function (
          delivery,
          index
        ) {

          const nextCurrentDelivery =
            currentDeliveries[
              index + 1
            ];


          const coverageStartDate =
            Core.addDays(
              delivery.date,
              1
            );


          const coverageEndDate =
            nextCurrentDelivery

              ? nextCurrentDelivery.date

              : nextDeliveryDate;


          return {

            date:
              delivery.date,

            weekday:
              delivery
                .scheduleRow
                .weekday,

            sourceOrderDay:
              delivery
                .scheduleRow
                .source_order_day,

            coverageStartDate,

            coverageEndDate

          };

        }
      );


    return {

      orderDate,

      orderDay,

      deliveries,

      nextDeliveryDate,

      coverageEndDate:
        nextDeliveryDate

    };

  }


  /* =====================================================
     DAILY STOCK SIMULATION

     opening
     - usage
     + delivery
     = closing

     shortage определяется
     ДО прихода поставки.
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
      options.deliveryMap
        instanceof Map

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


        /*
          Сначала расход.
        */

        const stockAfterUsage =
          Core.roundNumber(

            openingStock -
            dailyUsage

          );


        /*
          Потом поставка.
        */

        const deliveryQty =
          Core.roundNumber(
            Number(
              deliveryMap.get(
                date
              ) || 0
            )
          );


        const closingStock =
          Core.roundNumber(

            stockAfterUsage +
            deliveryQty

          );


        /*
          Если ДО машины ушли
          в минус — это shortage.
        */

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
     STOCK AFTER DATE

     Получаем состояние на конец
     нужного дня.
  ===================================================== */

  function calculateStockThroughDate(
    options
  ) {

    if (
      options.startDate >
      options.endDate
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
          options.endDate,

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
     REQUIRED QTY FOR SEGMENT

     currentStock =
       остаток ПОСЛЕ расхода
       дня поставки и после already
       expected поставок этого дня,
       но ДО нашей новой рекомендации.

     Новый заказ добавляется сейчас,
     после расхода delivery day.

     Затем он должен покрыть:

     coverageStartDate
     →
     coverageEndDate

     И после coverageEndDate
     оставить safety_stock.
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
        options.stockBeforeNewDelivery
      );


    let minimumStock =
      stock;


    /*
      Смотрим, что будет,
      если ТЕКУЩУЮ новую поставку
      вообще не добавить.
    */

    dates.forEach(
      function (date) {

        stock =
          Core.roundNumber(

            stock -
            options.dailyUsage +
            Number(
              options.knownDeliveryMap
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
      Сколько нужно,
      чтобы нигде не было минуса.
    */

    const requiredForNoShortage =
      Math.max(
        0,
        Core.roundNumber(
          -minimumStock
        )
      );


    /*
      Сколько нужно,
      чтобы в конце периода
      осталось safety_stock.

      Если safety = 0,
      просто стараемся закончить
      период не ниже 0.
    */

    const requiredForSafety =
      Math.max(
        0,
        Core.roundNumber(
          options.safetyStock -
          stock
        )
      );


    return Core.roundNumber(

      Math.max(
        requiredForNoShortage,
        requiredForSafety
      )

    );

  }


  /* =====================================================
     CASE ROUNDING

     Старого правила 0.7 НЕТ.

     Если required > 0,
     всегда округляем вверх
     до полного CASE.

     Например:

     0.1 CASE → 1 CASE
     0.7 CASE → 1 CASE
     1.01 CASE → 2 CASE
     7.01 CASE → 8 CASE
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

        cases:
          0,

        baseQty:
          0

      };

    }


    /*
      EPSILON вычитаем,
      чтобы число типа
      2.00000000001
      случайно не превратилось
      в 3 CASE.
    */

    const cases =
      Math.max(
        1,
        Math.ceil(
          (
            required -
            Core.EPSILON
          ) /
          caseSize
        )
      );


    return {

      cases,

      baseQty:
        Core.roundNumber(
          cases *
          caseSize
        )

    };

  }


  /* =====================================================
     MANUAL OVERRIDE
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

    }

    else if (
      overrides &&
      typeof overrides ===
        "object"
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
       KNOWN INCOMING
    ================================================= */

    const knownDeliveryMap =
      Core.buildDeliveryMap(
        options.knownDeliveries ||
        []
      );


    /*
      Здесь постепенно будут:

      already expected
      +
      наши новые рекомендации.
    */

    const calculationDeliveryMap =
      new Map(
        knownDeliveryMap
      );


    const recommendedDeliveryMap =
      new Map();


    const calculatedDeliveries =
      [];


    /* =================================================
       EACH PLANNED DELIVERY
    ================================================= */

    plan.deliveries.forEach(
      function (
        plannedDelivery
      ) {

        /*
          1.
          Считаем остаток
          ДО нашей новой поставки.

          ВАЖНО:
          расчет идет ВКЛЮЧИТЕЛЬНО
          до дня поставки.

          Значит в этот день уже:
          - прошел расход
          - пришли known incoming
          - пришли предыдущие
            рекомендации

          Но текущая новая рекомендация
          еще НЕ добавлена.
        */

        const throughDeliveryDay =
          calculateStockThroughDate({

            startDate:
              countDate,

            endDate:
              plannedDelivery.date,

            startStock,

            dailyUsage,

            deliveryMap:
              calculationDeliveryMap

          });


        const stockBeforeNewDelivery =
          throughDeliveryDay
            .stock;


        /*
          2.
          Считаем сколько нужно
          для периода после этой машины.

          ЧТ:
          ПТ + СБ

          СБ:
          ВС + ПН + ВТ
        */

        const rawRequiredBaseQty =
          calculateSegmentRequirement({

            startDate:
              plannedDelivery
                .coverageStartDate,

            endDate:
              plannedDelivery
                .coverageEndDate,

            stockBeforeNewDelivery,

            dailyUsage,

            safetyStock,

            knownDeliveryMap

          });


        /*
          3.
          Округляем вверх
          до полного CASE.
        */

        const automaticRounded =
          roundGeneralToCases(
            rawRequiredBaseQty,
            caseToBase
          );


        /*
          4.
          Проверяем manual override.
        */

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
          5.
          Добавляем рекомендацию
          на дату машины.

          Следующая поставка
          уже будет видеть этот товар
          в остатке.
        */

        const previousQty =
          Number(
            calculationDeliveryMap.get(
              plannedDelivery.date
            ) || 0
          );


        calculationDeliveryMap.set(

          plannedDelivery.date,

          Core.roundNumber(

            previousQty +
            rounded.baseQty

          )

        );


        recommendedDeliveryMap.set(

          plannedDelivery.date,

          Core.roundNumber(
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
            stockBeforeNewDelivery,

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

          const recommendation =
            recommendationMap.get(
              row.date
            );


          const knownQty =
            Number(
              knownDeliveryMap.get(
                row.date
              ) || 0
            );


          const recommendedQty =
            Number(
              recommendedDeliveryMap.get(
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
              Core.roundNumber(
                recommendedQty
              ),

            recommendedCases:
              recommendation
                ?.recommendedCases ||
              0

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


    /*
      Машина приходит ПОСЛЕ расхода.

      Поэтому shortage даже
      В ДЕНЬ первой машины
      считается shortage
      ДО первой поставки.
    */

    const shortageBeforeFirstDelivery =
      firstPlannedDelivery

        ? shortageDays.filter(
            function (row) {

              return (
                row.date <=
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


      /* DATES */

      countDate,

      orderDate:
        plan.orderDate,

      orderDay:
        plan.orderDay,

      nextDeliveryDate:
        plan.nextDeliveryDate,

      coverageEndDate:
        plan.coverageEndDate,


      /* INPUT */

      startStock,

      dailyUsage,

      safetyStock,

      caseToBase,


      /* DELIVERIES */

      deliveries:
        calculatedDeliveries,


      /* TOTAL */

      totalRecommendedCases,

      totalRecommendedBaseQty,


      /* FORECAST */

      forecast,


      /* RISKS */

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
       TEST 1 — PLAN
    ================================================= */

    const mondayPlan =
      resolvePlan({

        orderDate:
          "2026-09-14",

        orderDay:
          "monday",

        deliverySchedule:
          schedule

      });


    assert(
      mondayPlan
        .deliveries
        .length === 2,

      "TEST 1: ПН должен иметь 2 поставки"
    );


    assert(
      mondayPlan
        .deliveries[0]
        .date ===
        "2026-09-17",

      "TEST 1: первая поставка должна быть ЧТ"
    );


    assert(
      mondayPlan
        .deliveries[0]
        .coverageStartDate ===
        "2026-09-18",

      "TEST 1: ЧТ должна начинать покрытие с ПТ"
    );


    assert(
      mondayPlan
        .deliveries[0]
        .coverageEndDate ===
        "2026-09-19",

      "TEST 1: ЧТ должна покрывать до СБ включительно"
    );


    assert(
      mondayPlan
        .deliveries[1]
        .date ===
        "2026-09-19",

      "TEST 1: вторая поставка должна быть СБ"
    );


    assert(
      mondayPlan
        .deliveries[1]
        .coverageStartDate ===
        "2026-09-20",

      "TEST 1: СБ должна начинать покрытие с ВС"
    );


    assert(
      mondayPlan
        .deliveries[1]
        .coverageEndDate ===
        "2026-09-22",

      "TEST 1: СБ должна покрывать до ВТ включительно"
    );


    tests.push({

      test:
        "ПН: ЧТ + СБ",

      status:
        "✅"

    });


    /* =================================================
       TEST 2 — ROUNDING

       0.1 CASE тоже должен
       превратиться в 1 CASE.
    ================================================= */

    const rounding =
      roundGeneralToCases(
        0.1,
        10
      );


    assert(
      rounding.cases ===
        1,

      "TEST 2: 0.1 CASE должен округляться до 1 CASE"
    );


    tests.push({

      test:
        "CASE ceil",

      status:
        "✅"

    });


    /* =================================================
       TEST 3 — NO SHORTAGE AFTER ORDERS
    ================================================= */

    const normal =
      calculateProduct({

        countDate:
          "2026-09-14",

        orderDate:
          "2026-09-14",

        orderDay:
          "monday",

        startStock:
          3000,

        dailyUsage:
          582,

        safetyStock:
          0,

        caseToBase:
          1000,

        deliverySchedule:
          schedule,

        knownDeliveries: [

          {
            date:
              "2026-09-15",

            qty:
              1000
          }

        ]

      });


    /*
      После первой новой поставки
      shortage быть не должен.
    */

    const shortageAfterFirstDelivery =
      normal.shortageDays.filter(
        function (row) {

          return (
            row.date >
            "2026-09-17"
          );

        }
      );


    assert(
      shortageAfterFirstDelivery
        .length === 0,

      "TEST 3: после первой поставки не должно быть shortage"
    );


    tests.push({

      test:
        "Нет shortage после заказа",

      status:
        "✅",

      total:
        normal
          .totalRecommendedCases

    });


    /* =================================================
       TEST 4 — SAFETY
    ================================================= */

    const withSafety =
      calculateProduct({

        countDate:
          "2026-09-14",

        orderDate:
          "2026-09-14",

        orderDay:
          "monday",

        startStock:
          312,

        dailyUsage:
          118.14,

        safetyStock:
          125,

        caseToBase:
          12.5,

        deliverySchedule:
          schedule,

        knownDeliveries: [

          {
            date:
              "2026-09-15",

            qty:
              325
          }

        ]

      });


    assert(
      withSafety
        .endingStock >=
        125 -
        getCore().EPSILON,

      `TEST 4: ending stock должен быть >=125, факт ${withSafety.endingStock}`
    );


    tests.push({

      test:
        "Safety stock",

      status:
        "✅",

      ending:
        withSafety
          .endingStock

    });


    /* =================================================
       TEST 5 — THURSDAY
    ================================================= */

    const thursdayPlan =
      resolvePlan({

        orderDate:
          "2026-09-17",

        orderDay:
          "thursday",

        deliverySchedule:
          schedule

      });


    assert(
      thursdayPlan
        .deliveries
        .length === 1,

      "TEST 5: ЧТ заказ должен иметь одну поставку"
    );


    assert(
      thursdayPlan
        .deliveries[0]
        .date ===
        "2026-09-22",

      "TEST 5: поставка должна быть ВТ"
    );


    assert(
      thursdayPlan
        .deliveries[0]
        .coverageStartDate ===
        "2026-09-23",

      "TEST 5: ВТ поставка покрывает с СР"
    );


    assert(
      thursdayPlan
        .deliveries[0]
        .coverageEndDate ===
        "2026-09-24",

      "TEST 5: ВТ поставка покрывает до ЧТ"
    );


    tests.push({

      test:
        "ЧТ → ВТ",

      status:
        "✅"

    });


    /* =================================================
       OUTPUT
    ================================================= */

    console.group(
      "[Step 3 General] TESTS"
    );


    console.table(
      tests
    );


    console.log(
      "MONDAY PLAN:"
    );


    console.table(
      mondayPlan.deliveries
    );


    console.log(
      "NORMAL PRODUCT:"
    );


    console.table(
      normal.forecast.map(
        function (row) {

          return {

            date:
              row.date,

            opening:
              row.openingStock,

            usage:
              row.usageQty,

            known:
              row.knownDeliveryQty,

            new_order:
              row.recommendedDeliveryQty,

            cases:
              row.recommendedCases,

            closing:
              row.closingStock,

            shortage:
              row.shortageQty,

            status:
              row.isShortage
                ? "🔴"
                : "✅"

          };

        }
      )
    );


    console.log(
      "✅ GENERAL: 5/5 tests passed"
    );


    console.groupEnd();


    return {

      success:
        true,

      mondayPlan,

      normal,

      withSafety,

      thursdayPlan

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