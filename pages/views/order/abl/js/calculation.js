
/* ==========================================
   IZAKAZ v0.2.0
   ABL — ORDER CALCULATION

   Freezer / Cooler / Fresh / Dry

   Daily usage: Monday to Sunday
   Existing deliveries included
   Delivery arrives after daily usage
   CASE rounded upwards
   Safety stock supported
   No legacy 0.7 rule

   Pure calculations — no database writes
========================================== */

(function () {
  "use strict";

  const EPS = 0.00000001;

  const DAYS = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday"
  ];

  const CATEGORIES = new Set([
    "freezer",
    "cooler",
    "fresh",
    "dry"
  ]);

  function round(value) {
    return Math.round(value * 1000000) / 1000000;
  }

  function nonnegative(value, label) {
    const result = Number(value);

    if (
      !Number.isFinite(result) ||
      result < 0
    ) {
      throw new Error(
        `${label}: требуется число от 0`
      );
    }

    return result;
  }

  function parseDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
      throw new Error("Некорректная дата: " + value);
    }

    const [y, m, d] = value.split("-").map(Number);

    const date = new Date(Date.UTC(y, m - 1, d));

    if (date.toISOString().slice(0, 10) !== value) {
      throw new Error("Некорректная дата: " + value);
    }

    return date;
  }

  function addDays(value, days) {
    const date = parseDate(value);

    date.setUTCDate(date.getUTCDate() + days);

    return date.toISOString().slice(0, 10);
  }

  function weekday(value) {
    const result = parseDate(value).getUTCDay();

    return result === 0 ? 7 : result;
  }

  function dayKey(value) {
    return DAYS[weekday(value) - 1];
  }

  function nextWeekday(date, target) {
    const desired = Number(target);

    if (
      !Number.isInteger(desired) ||
      desired < 1 ||
      desired > 7
    ) {
      throw new Error("Некорректный день поставки");
    }

    let difference =
      (desired - weekday(date) + 7) % 7;

    if (difference === 0) difference = 7;

    return addDays(date, difference);
  }

  function dateRange(start, end) {
    if (start > end) {
      throw new Error("Некорректный период расчёта");
    }

    const dates = [];

    for (
      let date = start;
      date <= end;
      date = addDays(date, 1)
    ) {
      dates.push(date);

      if (dates.length > 60) {
        throw new Error(
          "Период расчёта слишком большой"
        );
      }
    }

    return dates;
  }

  /* ==========================================
     DELIVERY SCHEDULE
  ========================================== */

  function buildPlan(orderDate, schedule) {
    if (!Array.isArray(schedule)) {
      throw new Error(
        "График поставок не передан"
      );
    }

    const orderWeekday = weekday(orderDate);

    const orderDay =
      orderWeekday === 1
        ? "monday"
        : orderWeekday === 4
          ? "thursday"
          : null;

    if (!orderDay) {
      throw new Error(
        "Заказ ABL доступен в ПН и ЧТ"
      );
    }

    const active = schedule.filter(row =>
      row.delivery_group === "general" &&
      row.is_active !== false
    );

    if (!active.length) {
      throw new Error(
        "График ABL не настроен"
      );
    }

    const current = active
      .filter(row =>
        row.source_order_day === orderDay
      )
      .map(row => ({
        date: nextWeekday(
          orderDate,
          row.weekday
        ),
        weekday: Number(row.weekday)
      }))
      .sort((a, b) =>
        a.date.localeCompare(b.date)
      );

    if (!current.length) {
      throw new Error(
        "Нет поставок для этого дня заказа"
      );
    }

    const lastDate =
      current[current.length - 1].date;

    const nextDeliveryDate = active
      .map(row =>
        nextWeekday(lastDate, row.weekday)
      )
      .sort()[0];

    if (!nextDeliveryDate) {
      throw new Error(
        "Следующая поставка не определена"
      );
    }

    const deliveries = current.map(
      (delivery, index) => {
        const next =
          current[index + 1]?.date ||
          nextDeliveryDate;

        return {
          ...delivery,
          coverageStartDate:
            addDays(delivery.date, 1),
          coverageEndDate: next
        };
      }
    );

    return {
      orderDate,
      orderDay,
      deliveries,
      nextDeliveryDate
    };
  }

  /* ==========================================
     NORMALIZE WEEKLY USAGE
  ========================================== */

  function normalizeUsage(usage, productName) {
    if (!usage) {
      throw new Error(
        `Не настроена реализация: ${productName}`
      );
    }

    const result = {};

    for (const day of DAYS) {
      if (
        usage[day] === null ||
        usage[day] === undefined ||
        usage[day] === ""
      ) {
        throw new Error(
          `Не заполнена реализация ${day}: ` +
          productName
        );
      }

      result[day] = nonnegative(
        usage[day],
        `Реализация ${productName} / ${day}`
      );
    }

    return result;
  }

  /* ==========================================
     EXISTING DELIVERIES

     Input:
     [{ date, qty }]

     qty is in BASE units.

     They must already be confirmed.
     Do not include current order deliveries.
  ========================================== */

  function buildKnownMap(deliveries) {
    const map = new Map();

    for (const row of deliveries || []) {
      if (!row.date) {
        throw new Error(
          "У ожидаемой поставки нет даты"
        );
      }

      parseDate(row.date);

      const qty = nonnegative(
        row.qty,
        "Количество ожидаемой поставки"
      );

      map.set(
        row.date,
        round((map.get(row.date) || 0) + qty)
      );
    }

    return map;
  }

  /* ==========================================
     DAILY FORECAST

     First subtract sales,
     then add delivery.
  ========================================== */

  function forecastDays(options) {
    const {
      startDate,
      endDate,
      startStock,
      usage,
      knownMap,
      plannedMap
    } = options;

    let stock = nonnegative(
      startStock,
      "Фактический остаток"
    );

    const rows = [];

    for (const date of dateRange(
      startDate,
      endDate
    )) {
      const openingStock = stock;

      const dailyUsage =
        usage[dayKey(date)];

      const stockBeforeDelivery =
        round(openingStock - dailyUsage);

      const knownDelivery =
        knownMap.get(date) || 0;

      const plannedDelivery =
        plannedMap.get(date) || 0;

      stock = round(
        stockBeforeDelivery +
        knownDelivery +
        plannedDelivery
      );

      rows.push({
        date,
        openingStock,
        dailyUsage,
        stockBeforeDelivery,
        knownDelivery,
        plannedDelivery,
        closingStock: stock,
        shortageQty: round(
          Math.max(0, -stockBeforeDelivery)
        )
      });
    }

    return rows;
  }

  /* ==========================================
     CALCULATE ONE PRODUCT
  ========================================== */

  function calculateProduct(options) {
    const {
      product,
      orderDate,
      plan,
      openingStock,
      weeklyUsage,
      knownDeliveries = [],
      safetyStock = 0,
      overrides = {}
    } = options;

    if (!product?.id) {
      throw new Error("Товар не указан");
    }

    if (!CATEGORIES.has(product.category)) {
      throw new Error(
        "Недопустимая категория: " +
        product.category
      );
    }

    const name =
      product.name || String(product.id);

    const caseSize = nonnegative(
      product.case_to_base,
      `CASE ${name}`
    );

    if (caseSize <= EPS) {
      throw new Error(
        `Не настроен CASE: ${name}`
      );
    }

    const usage =
      normalizeUsage(weeklyUsage, name);

    const startStock = nonnegative(
      openingStock,
      `Остаток ${name}`
    );

    const safety = nonnegative(
      safetyStock,
      `Запас ${name}`
    );

    const knownMap =
      buildKnownMap(knownDeliveries);

    const plannedMap = new Map();
    const calculatedDeliveries = [];

    for (const delivery of plan.deliveries) {
      // Остаток на конец дня поставки
      // БЕЗ новой поставки этого заказа.
      const before = forecastDays({
        startDate: orderDate,
        endDate: delivery.date,
        startStock,
        usage,
        knownMap,
        plannedMap
      });

      const stockBeforeNew =
        before[before.length - 1]
          .closingStock;

      let simulated = stockBeforeNew;
      let minimum = simulated;

      for (const date of dateRange(
        delivery.coverageStartDate,
        delivery.coverageEndDate
      )) {
        simulated = round(
          simulated -
          usage[dayKey(date)] +
          (knownMap.get(date) || 0) +
          (plannedMap.get(date) || 0)
        );

        minimum = Math.min(
          minimum,
          simulated
        );
      }

      const requiredForShortage =
        Math.max(0, -minimum);

      const requiredForSafety =
        Math.max(0, safety - simulated);

      const requiredBaseQty = round(
        Math.max(
          requiredForShortage,
          requiredForSafety
        )
      );

      const automaticCases = Math.max(
        0,
        Math.ceil(
          (requiredBaseQty - EPS) /
          caseSize
        )
      );

      const hasOverride =
        Object.prototype.hasOwnProperty.call(
          overrides,
          delivery.date
        );

      const cases = hasOverride
        ? Number(overrides[delivery.date])
        : automaticCases;

      if (
        !Number.isInteger(cases) ||
        cases < 0
      ) {
        throw new Error(
          `Некорректный CASE: ${name}, ` +
          delivery.date
        );
      }

      const baseQty = round(
        cases * caseSize
      );

      plannedMap.set(
        delivery.date,
        round(
          (plannedMap.get(delivery.date) || 0) +
          baseQty
        )
      );

      calculatedDeliveries.push({
        ...delivery,
        automaticCases,
        recommendedCases: cases,
        recommendedBaseQty: baseQty,
        requiredBaseQty,
        isManualOverride: hasOverride,
        stockBeforeNewDelivery:
          stockBeforeNew
      });
    }

    const forecast = forecastDays({
      startDate: orderDate,
      endDate: plan.nextDeliveryDate,
      startStock,
      usage,
      knownMap,
      plannedMap
    });

    const shortageDays = forecast.filter(
      row => row.shortageQty > EPS
    );

    return {
      ok: true,
      product,
      orderDate,
      startStock,
      safetyStock: safety,
      caseToBase: caseSize,
      deliveries: calculatedDeliveries,
      totalRecommendedCases:
        calculatedDeliveries.reduce(
          (sum, delivery) =>
            sum + delivery.recommendedCases,
          0
        ),
      forecast,
      shortageDays,
      hasShortageBeforeDelivery:
        shortageDays.length > 0,
      knownDeliveries
    };
  }

  /* ==========================================
     CALCULATE ALL PRODUCTS

     Expected options:
     {
       orderDate,
       products,
       stockByProduct: Map,
       usageByProduct: Map,
       knownByProduct: Map,
       safetyByProduct: Map,
       overridesByProduct: Map,
       deliverySchedule
     }
  ========================================== */

  function calculateAll(options) {
    const plan = buildPlan(
      options.orderDate,
      options.deliverySchedule
    );

    const read = (collection, id, fallback) => {
      if (collection instanceof Map) {
        return collection.has(id)
          ? collection.get(id)
          : fallback;
      }

      return collection?.[id] ?? fallback;
    };

    const results = [];

    for (const product of options.products || []) {
      const id = String(product.id);

      const openingStock = read(
        options.stockByProduct,
        id,
        undefined
      );

      if (
        openingStock === null ||
        openingStock === undefined
      ) {
        throw new Error(
          "Нет остатка: " + product.name
        );
      }

      const result = calculateProduct({
        product,
        orderDate: options.orderDate,
        plan,
        openingStock,
        weeklyUsage: read(
          options.usageByProduct,
          id,
          null
        ),
        knownDeliveries: read(
          options.knownByProduct,
          id,
          []
        ),
        safetyStock: read(
          options.safetyByProduct,
          id,
          0
        ),
        overrides: read(
          options.overridesByProduct,
          id,
          {}
        )
      });

      results.push(result);
    }

    return {
      orderDate: options.orderDate,
      plan,
      results,
      totalCases: results.reduce(
        (sum, item) =>
          sum + item.totalRecommendedCases,
        0
      )
    };
  }

  /* ==========================================
     PUBLIC API
  ========================================== */

  window.IzakazAblCalculation = {
    buildPlan,
    calculateProduct,
    calculateAll,
    forecastDays,
    buildKnownMap,
    addDays,
    dayKey
  };

})();
