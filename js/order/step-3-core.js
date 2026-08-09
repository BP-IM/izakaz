/* =====================================================
   I’M | ЗАКАЗ
   STEP 3 — CORE

   Общие инструменты расчета.
   Здесь НЕТ:
   - Supabase
   - Cola логики
   - General логики
   - Fresh логики
   - UI
===================================================== */

(function () {
  "use strict";


  const EPSILON = 0.000001;
  const MAX_FORECAST_DAYS = 60;


  /* =====================================================
     NUMBERS
  ===================================================== */

  function roundNumber(
    value,
    precision = 6
  ) {

    const number =
      Number(value);


    if (!Number.isFinite(number)) {
      return 0;
    }


    const factor =
      Math.pow(
        10,
        precision
      );


    return (
      Math.round(
        number * factor
      ) / factor
    );

  }


  function requireNumber(
    value,
    name,
    options = {}
  ) {

    const number =
      Number(value);


    if (!Number.isFinite(number)) {

      throw new Error(
        `${name}: некорректное число`
      );

    }


    if (
      options.min !== undefined &&
      number < options.min
    ) {

      throw new Error(
        `${name}: значение не может быть меньше ${options.min}`
      );

    }


    return number;

  }


  /* =====================================================
     DATES
  ===================================================== */

  function parseDate(
    value
  ) {

    if (
      typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {

      throw new Error(
        `Некорректная дата: ${value}`
      );

    }


    const [
      year,
      month,
      day
    ] =
      value
        .split("-")
        .map(Number);


    const date =
      new Date(
        Date.UTC(
          year,
          month - 1,
          day
        )
      );


    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {

      throw new Error(
        `Некорректная дата: ${value}`
      );

    }


    return date;

  }


  function formatDate(
    date
  ) {

    return [
      date.getUTCFullYear(),

      String(
        date.getUTCMonth() + 1
      ).padStart(2, "0"),

      String(
        date.getUTCDate()
      ).padStart(2, "0")

    ].join("-");

  }


  function addDays(
    dateString,
    days
  ) {

    const date =
      parseDate(
        dateString
      );


    date.setUTCDate(
      date.getUTCDate() +
      Number(days)
    );


    return formatDate(
      date
    );

  }


  /*
    ISO weekday:

    1 = ПН
    2 = ВТ
    3 = СР
    4 = ЧТ
    5 = ПТ
    6 = СБ
    7 = ВС
  */

  function getIsoWeekday(
    dateString
  ) {

    const date =
      parseDate(
        dateString
      );


    const weekday =
      date.getUTCDay();


    return (
      weekday === 0
        ? 7
        : weekday
    );

  }


  function nextWeekdayDate(
    fromDate,
    targetWeekday,
    strictlyAfter = true
  ) {

    const target =
      requireNumber(
        targetWeekday,
        "weekday",
        {
          min: 1
        }
      );


    if (target > 7) {

      throw new Error(
        "weekday должен быть от 1 до 7"
      );

    }


    const current =
      getIsoWeekday(
        fromDate
      );


    let difference =
      target - current;


    if (difference < 0) {

      difference += 7;

    }


    if (
      strictlyAfter &&
      difference === 0
    ) {

      difference = 7;

    }


    return addDays(
      fromDate,
      difference
    );

  }


  function getDateRange(
    startDate,
    endDate
  ) {

    parseDate(startDate);
    parseDate(endDate);


    if (
      endDate < startDate
    ) {

      throw new Error(
        "Конечная дата раньше начальной"
      );

    }


    const result = [];

    let current =
      startDate;


    while (
      current <= endDate
    ) {

      result.push(
        current
      );


      if (
        result.length >
        MAX_FORECAST_DAYS
      ) {

        throw new Error(
          "Слишком большой период расчета"
        );

      }


      current =
        addDays(
          current,
          1
        );

    }


    return result;

  }


  /* =====================================================
     DELIVERY MAP
  ===================================================== */

  function buildDeliveryMap(
    deliveries = []
  ) {

    const map =
      new Map();


    if (
      !Array.isArray(deliveries)
    ) {

      throw new Error(
        "deliveries должен быть массивом"
      );

    }


    deliveries.forEach(
      function (delivery) {

        if (!delivery?.date) {
          return;
        }


        parseDate(
          delivery.date
        );


        const qty =
          requireNumber(
            delivery.qty || 0,
            "delivery qty",
            {
              min: 0
            }
          );


        const currentQty =
          map.get(
            delivery.date
          ) || 0;


        map.set(
          delivery.date,

          roundNumber(
            currentQty +
            qty
          )
        );

      }
    );


    return map;

  }


  /* =====================================================
     CASE ROUNDING

     Заказ ВСЕГДА только CASE.
     slv / pcs никогда не предлагаем.
  ===================================================== */

  function roundToCases(
    requiredBaseQty,
    caseToBase
  ) {

    const required =
      requireNumber(
        requiredBaseQty,
        "requiredBaseQty",
        {
          min: 0
        }
      );


    const caseSize =
      requireNumber(
        caseToBase,
        "caseToBase"
      );


    if (
      caseSize <= EPSILON
    ) {

      throw new Error(
        "У товара отсутствует корректный case_to_base"
      );

    }


    if (
      required <= EPSILON
    ) {

      return {
        cases: 0,
        baseQty: 0
      };

    }


    /*
      Всегда вверх.

      Например:
      нужно 25
      case = 12

      25 / 12 = 2.08
      заказ = 3 case
    */

    const cases =
      Math.ceil(
        required /
        caseSize -
        EPSILON
      );


    return {

      cases,

      baseQty:
        roundNumber(
          cases *
          caseSize
        )

    };

  }


  /* =====================================================
     DAILY STOCK SIMULATION

     Порядок дня:

     openingStock
     + delivery
     - usage
     = closingStock

     Если товара не хватило:
     closingStock = 0
     shortageQty = сколько не хватило

     Минусовой физический остаток
     на следующий день НЕ переносим.
  ===================================================== */

  function simulateDailyStock(
    options
  ) {

    const startDate =
      options.startDate;


    const endDate =
      options.endDate;


    let stock =
      requireNumber(
        options.startStock,
        "startStock",
        {
          min: 0
        }
      );


    const dailyUsage =
      requireNumber(
        options.dailyUsage,
        "dailyUsage",
        {
          min: 0
        }
      );


    const deliveryMap =
      options.deliveryMap instanceof Map

        ? options.deliveryMap

        : buildDeliveryMap(
            options.deliveries || []
          );


    const dates =
      getDateRange(
        startDate,
        endDate
      );


    const rows = [];


    dates.forEach(
      function (date) {

        const openingStock =
          roundNumber(
            stock
          );


        const deliveryQty =
          roundNumber(
            deliveryMap.get(date) || 0
          );


        const availableQty =
          roundNumber(
            openingStock +
            deliveryQty
          );


        const rawClosingStock =
          roundNumber(
            availableQty -
            dailyUsage
          );


        const isShortage =
          rawClosingStock <
          -EPSILON;


        const shortageQty =
          isShortage

            ? roundNumber(
                Math.abs(
                  rawClosingStock
                )
              )

            : 0;


        const closingStock =
          isShortage

            ? 0

            : roundNumber(
                Math.max(
                  0,
                  rawClosingStock
                )
              );


        rows.push({

          date,

          openingStock,

          deliveryQty,

          availableQty,

          usageQty:
            dailyUsage,

          closingStock,

          shortageQty,

          isShortage,

          status:
            isShortage
              ? "shortage"
              : "ok"

        });


        stock =
          closingStock;

      }
    );


    return rows;

  }


  /* =====================================================
     PUBLIC API
  ===================================================== */

  window.OrderStep3Core = {

    EPSILON,

    roundNumber,

    requireNumber,

    parseDate,

    formatDate,

    addDays,

    getIsoWeekday,

    nextWeekdayDate,

    getDateRange,

    buildDeliveryMap,

    roundToCases,

    simulateDailyStock

  };


  console.log(
    "[Step 3 Core] loaded"
  );

})();