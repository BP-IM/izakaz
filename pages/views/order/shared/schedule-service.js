
/* ==========================================
   IZAKAZ v0.2.0
   ORDER — SCHEDULE SERVICE

   Cola / Delivery planning

   Поставка приходит в конце дня.
   День поставки покрывает старый запас.
========================================== */

(function () {
  "use strict";

  const ORDER_DAYS = {
    1: "monday",
    4: "thursday"
  };

  /* ========================================
     DATE HELPERS
  ======================================== */

  function parseDate(value) {
    if (
      typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
      throw new Error(
        "Некорректная дата: " + value
      );
    }

    const [year, month, day] =
      value.split("-").map(Number);

    const date = new Date(
      Date.UTC(year, month - 1, day)
    );

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new Error(
        "Некорректная дата: " + value
      );
    }

    return date;
  }

  function formatDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function addDays(value, days) {
    const date = parseDate(value);

    date.setUTCDate(
      date.getUTCDate() + days
    );

    return formatDate(date);
  }

  function getWeekday(value) {
    const day = parseDate(value).getUTCDay();

    return day === 0 ? 7 : day;
  }

  function nextWeekdayAfter(
    fromDate,
    targetWeekday
  ) {
    const target = Number(targetWeekday);

    if (
      !Number.isInteger(target) ||
      target < 1 ||
      target > 7
    ) {
      throw new Error(
        "Некорректный день поставки"
      );
    }

    const current = getWeekday(fromDate);

    let difference =
      (target - current + 7) % 7;

    if (difference === 0) {
      difference = 7;
    }

    return addDays(
      fromDate,
      difference
    );
  }

  /* ========================================
     SUPABASE — COLA SCHEDULE
  ======================================== */

  async function loadColaSchedule(
    restaurantId
  ) {
    if (!restaurantId) {
      throw new Error(
        "Не указан ресторан"
      );
    }

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

    const { data, error } = await client
      .from("restaurant_delivery_schedule")
      .select(`
        weekday,
        delivery_group,
        source_order_day,
        is_active
      `)
      .eq("restaurant_id", restaurantId)
      .eq("delivery_group", "cola")
      .eq("is_active", true)
      .order("weekday");

    if (error) {
      throw error;
    }

    if (!data?.length) {
      throw new Error(
        "График поставок Cola не настроен"
      );
    }

    return data;
  }

  /* ========================================
     BUILD DELIVERY PLAN
  ======================================== */

  function buildColaPlan(options) {
    const orderDate = options.orderDate;
    const schedule = options.schedule;

    const orderWeekday = getWeekday(orderDate);
    const orderDay = ORDER_DAYS[orderWeekday];

    if (!orderDay) {
      throw new Error(
        "Заказ Cola доступен только ПН/ЧТ"
      );
    }

    if (!Array.isArray(schedule)) {
      throw new Error(
        "Не передан график Cola"
      );
    }

    const active = schedule
      .filter(function (item) {
        return (
          item.delivery_group === "cola" &&
          item.is_active !== false
        );
      })
      .map(function (item) {
        return {
          weekday: Number(item.weekday),
          sourceOrderDay: item.source_order_day
        };
      });

    if (!active.length) {
      throw new Error(
        "Нет активных поставок Cola"
      );
    }

    const sourceDeliveries = active
      .filter(function (item) {
        return item.sourceOrderDay === orderDay;
      });

    if (!sourceDeliveries.length) {
      throw new Error(
        "Нет поставок Cola для " + orderDay
      );
    }

    const currentDeliveries = sourceDeliveries
      .map(function (item) {
        return {
          date: nextWeekdayAfter(
            orderDate,
            item.weekday
          ),
          weekday: item.weekday
        };
      })
      .sort(function (a, b) {
        return a.date.localeCompare(b.date);
      });

    const deliveries = currentDeliveries.map(
      function (delivery) {

        // Следующая активная поставка Cola.
        const nextDeliveryDate = active
          .map(function (item) {
            return nextWeekdayAfter(
              delivery.date,
              item.weekday
            );
          })
          .sort()[0];

        return {
          date: delivery.date,
          weekday: delivery.weekday,

          coverageStartDate: addDays(
            delivery.date,
            1
          ),

          // День следующей поставки включаем:
          // новая машина приходит в конце дня.
          coverageEndDate: nextDeliveryDate,

          nextDeliveryDate
        };
      }
    );

    return {
      orderDate,
      orderDay,
      deliveryGroup: "cola",
      deliveries
    };
  }

  /* ========================================
     PUBLIC API
  ======================================== */

  window.IzakazOrderSchedule = {
    loadColaSchedule,
    buildColaPlan,
    addDays,
    getWeekday
  };

})();
