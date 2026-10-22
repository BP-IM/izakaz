
/* ==========================================
   IZAKAZ v0.2.0
   ORDER — WEEKLY USAGE SERVICE

   Источник: product_weekly_usage
   ПН–ВС: отдельный расход каждого дня

   Только чтение. Без изменения настроек.
========================================== */

(function () {
  "use strict";

  const DAYS = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday"
  ];

  const DAY_LABELS = [
    "ПН",
    "ВТ",
    "СР",
    "ЧТ",
    "ПТ",
    "СБ",
    "ВС"
  ];

  /* ========================================
     SUPABASE
  ======================================== */

  function getClient() {
    const client =
      window.supabaseClient ||
      (
        typeof supabaseClient !== "undefined"
          ? supabaseClient
          : null
      );

    if (!client) {
      throw new Error("Supabase не подключен");
    }

    return client;
  }

  /* ========================================
     VALIDATION
  ======================================== */

  function normalizeUsage(row) {
    if (!row?.product_id) {
      throw new Error(
        "В реализации отсутствует product_id"
      );
    }

    const result = {
      product_id: String(row.product_id),
      last_reviewed_at: row.last_reviewed_at ?? null,
      review_interval_days:
        row.review_interval_days ?? null
    };

    const missingDays = [];

    for (const day of DAYS) {
      const raw = row[day];

      if (
        raw === null ||
        raw === undefined ||
        raw === ""
      ) {
        missingDays.push(day);
        continue;
      }

      const value = Number(raw);

      if (
        !Number.isFinite(value) ||
        value < 0
      ) {
        throw new Error(
          `Некорректный расход: ${day}, ` +
          `товар ${row.product_id}`
        );
      }

      result[day] = value;
    }

    result.isComplete = missingDays.length === 0;
    result.missingDays = missingDays;

    return result;
  }

  /* ========================================
     LOAD USAGE
  ======================================== */

  async function loadColaUsage(
    restaurantId,
    productIds = []
  ) {
    if (!restaurantId) {
      throw new Error(
        "Не указан ресторан для загрузки реализации"
      );
    }

    if (!Array.isArray(productIds)) {
      throw new Error(
        "productIds должен быть массивом"
      );
    }

    const ids = [
      ...new Set(
        productIds.map(String)
      )
    ];

    if (!ids.length) {
      return {
        usages: new Map(),
        missingProducts: [],
        incompleteProducts: [],
        isComplete: true
      };
    }

    const client = getClient();

    const { data, error } = await client
      .from("product_weekly_usage")
      .select(`
        product_id,
        monday,
        tuesday,
        wednesday,
        thursday,
        friday,
        saturday,
        sunday,
        review_interval_days,
        last_reviewed_at
      `)
      .eq("restaurant_id", restaurantId)
      .in("product_id", ids);

    if (error) {
      throw error;
    }

    const usages = new Map();

    for (const row of data || []) {
      const normalized = normalizeUsage(row);

      if (usages.has(normalized.product_id)) {
        throw new Error(
          "Дублируется реализация товара: " +
          normalized.product_id
        );
      }

      usages.set(
        normalized.product_id,
        normalized
      );
    }

    const missingProducts = ids.filter(
      id => !usages.has(id)
    );

    const incompleteProducts = ids.filter(
      id => {
        const usage = usages.get(id);

        return (
          usage &&
          !usage.isComplete
        );
      }
    );

    return {
      usages,
      missingProducts,
      incompleteProducts,

      isComplete:
        missingProducts.length === 0 &&
        incompleteProducts.length === 0
    };
  }

  /* ========================================
     DATE HELPERS
  ======================================== */

  function getWeekday(dateString) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        String(dateString)
      )
    ) {
      throw new Error(
        "Некорректная дата: " + dateString
      );
    }

    const date = new Date(
      `${dateString}T12:00:00Z`
    );

    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !==
        dateString
    ) {
      throw new Error(
        "Некорректная дата: " + dateString
      );
    }

    const day = date.getUTCDay();

    return day === 0 ? 7 : day;
  }

  function getDayKey(dateString) {
    const weekday = getWeekday(dateString);

    return DAYS[weekday - 1];
  }

  /* ========================================
     GET DAILY USAGE
  ======================================== */

  function getUsageForDate(
    usages,
    productId,
    dateString
  ) {
    if (!(usages instanceof Map)) {
      throw new Error(
        "Некорректная карта реализации"
      );
    }

    const id = String(productId);

    const usage = usages.get(id);

    if (!usage) {
      throw new Error(
        "Не настроена реализация товара: " + id
      );
    }

    const day = getDayKey(dateString);

    const value = usage[day];

    if (
      value === null ||
      value === undefined ||
      !Number.isFinite(Number(value))
    ) {
      throw new Error(
        "Не заполнена реализация " +
        day +
        " для товара: " +
        id
      );
    }

    const number = Number(value);

    if (number < 0) {
      throw new Error(
        "Расход не может быть отрицательным"
      );
    }

    return number;
  }

  /* ========================================
     GET USAGE BETWEEN DATES
  ======================================== */

  function getUsageBetweenDates(
    usages,
    productId,
    startDate,
    endDate
  ) {
    const schedule =
      window.IzakazOrderSchedule;

    if (!schedule?.addDays) {
      throw new Error(
        "schedule-service.js не загружен"
      );
    }

    if (startDate > endDate) {
      throw new Error(
        "Дата начала позже даты окончания"
      );
    }

    const days = [];

    let date = startDate;

    let total = 0;

    let iterations = 0;

    while (date <= endDate) {
      if (++iterations > 366) {
        throw new Error(
          "Период расчёта превышает 366 дней"
        );
      }

      const quantity = getUsageForDate(
        usages,
        productId,
        date
      );

      days.push({
        date,
        weekday: getWeekday(date),
        dayKey: getDayKey(date),
        quantity
      });

      total += quantity;

      date = schedule.addDays(date, 1);
    }

    return {
      productId: String(productId),
      startDate,
      endDate,
      total: Math.round(total * 10000) / 10000,
      days
    };
  }

  /* ========================================
     PUBLIC API
  ======================================== */

  window.IzakazOrderUsage = {
    DAYS,
    DAY_LABELS,

    loadColaUsage,
    getWeekday,
    getDayKey,
    getUsageForDate,
    getUsageBetweenDates
  };

})();
