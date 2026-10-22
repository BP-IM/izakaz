
/* ==========================================
   IZAKAZ v0.2.0
   COLA — ORDER CALCULATION

   Правила:
   1. Остаток — утром дня заказа.
   2. Расход — отдельно по дням ПН–ВС.
   3. Поставка — после расхода дня.
   4. Покрытие — до следующей поставки
      включительно.
   5. Safety stock — на конец покрытия.
   6. Заказ — целыми CASE.

   Модуль только рассчитывает.
   Ничего не записывает в Supabase.
========================================== */

(function () {
  "use strict";

  const EPS = 0.00000001;

  function round(value) {
    return Math.round(value * 10000) / 10000;
  }

  function positiveNumber(value, label) {
    const number = Number(value);

    if (!Number.isFinite(number) || number < 0) {
      throw new Error(
        `${label}: требуется число от 0`
      );
    }

    return number;
  }

  function getSchedule() {
    const service = window.IzakazOrderSchedule;

    if (!service) {
      throw new Error(
        "schedule-service.js не загружен"
      );
    }

    return service;
  }

  function getUsageService() {
    const service = window.IzakazOrderUsage;

    if (!service) {
      throw new Error(
        "usage-service.js не загружен"
      );
    }

    return service;
  }

  function getCount(counts, productId) {
    if (counts instanceof Map) {
      return counts.get(String(productId));
    }

    return counts?.[String(productId)];
  }

  function getOpeningStock(product, counts) {
    const count = getCount(counts, product.id);

    if (!count) {
      throw new Error(
        `Не подсчитан товар: ${product.name}`
      );
    }

    const units = [
      ["case_qty", "case_to_base"],
      ["slv_qty", "slv_to_base"],
      ["pcs_qty", "pcs_to_base"]
    ];

    let total = 0;
    let counted = false;

    for (const [quantityKey, factorKey] of units) {
      const factor = Number(product[factorKey]);

      if (!Number.isFinite(factor) || factor <= 0) {
        continue;
      }

      const raw = count[quantityKey];

      if (raw === null || raw === undefined) {
        continue;
      }

      const quantity = positiveNumber(
        raw,
        `${product.name}: ${quantityKey}`
      );

      counted = true;
      total += quantity * factor;
    }

    if (!counted) {
      throw new Error(
        `Не указан остаток: ${product.name}`
      );
    }

    return round(total);
  }

  /*
    incoming:
    [
      {
        productId: "uuid",
        date: "2026-10-13",
        baseQty: 40
      }
    ]

    Только уже подтверждённые,
    ожидаемые поставки.

    Текущий создаваемый заказ
    сюда НЕ добавляется.
  */

  function getIncomingForDay(
    incoming,
    productId,
    date
  ) {
    let total = 0;

    for (const item of incoming) {
      if (
        String(item.productId) !== String(productId) ||
        item.date !== date
      ) {
        continue;
      }

      total += positiveNumber(
        item.baseQty,
        "Количество входящей поставки"
      );
    }

    return round(total);
  }

  function calculateProduct(options) {
    const {
      product,
      counts,
      usages,
      orderDate,
      deliveryDate,
      coverageEndDate,
      incoming = []
    } = options;

    if (!product?.id) {
      throw new Error("Не указан товар");
    }

    const schedule = getSchedule();
    const usageService = getUsageService();

    if (
      !orderDate ||
      !deliveryDate ||
      !coverageEndDate ||
      orderDate > deliveryDate ||
      deliveryDate > coverageEndDate
    ) {
      throw new Error(
        "Некорректный период расчёта"
      );
    }

    const caseSize = positiveNumber(
      product.case_to_base,
      `${product.name}: CASE`
    );

    if (caseSize <= 0) {
      throw new Error(
        `${product.name}: не задан CASE`
      );
    }

    // Null/undefined means 0 only when
    // safety stock is not configured.
    const safetyStock = positiveNumber(
      product.safety_stock ?? 0,
      `${product.name}: Safety stock`
    );

    const openingStock = getOpeningStock(
      product,
      counts
    );

    let stock = openingStock;
    let totalUsage = 0;
    let incomingTotal = 0;

    // Минимум необходимого пополнения
    // в дату создаваемой поставки.
    let requiredBase = 0;

    let preDeliveryShortage = 0;

    const days = [];

    let date = orderDate;
    let iterations = 0;

    while (date <= coverageEndDate) {
      if (++iterations > 366) {
        throw new Error(
          "Слишком длинный период расчёта"
        );
      }

      const opening = stock;

      const usage =
        usageService.getUsageForDate(
          usages,
          product.id,
          date
        );

      totalUsage += usage;

      // Сначала расход дня.
      const afterUsage = opening - usage;

      // Заказ, приходящий сегодня вечером,
      // не может покрыть дневной расход.
      if (date < deliveryDate) {
        preDeliveryShortage = Math.max(
          preDeliveryShortage,
          -afterUsage,
          0
        );
      }

      // Уже ожидаемые поставки.
      const receipt = getIncomingForDay(
        incoming,
        product.id,
        date
      );

      incomingTotal += receipt;

      // Только после расхода добавляем
      // подтверждённые поставки.
      stock = afterUsage + receipt;

      // Наша новая поставка поступит
      // в конце deliveryDate.
      // Проверяем дефицит после её прихода.
      if (date >= deliveryDate) {
        requiredBase = Math.max(
          requiredBase,
          -stock,
          0
        );
      }

      days.push({
        date,
        opening: round(opening),
        usage: round(usage),
        afterUsage: round(afterUsage),
        incoming: round(receipt),
        closingWithoutNewOrder: round(stock)
      });

      date = schedule.addDays(date, 1);
    }

    // На конец покрытия должен
    // остаться safety stock.
    requiredBase = Math.max(
      requiredBase,
      safetyStock - stock,
      0
    );

    // Только целые CASE.
    const suggestedCases =
      requiredBase <= EPS
        ? 0
        : Math.ceil(
            (requiredBase - EPS) / caseSize
          );

    const suggestedBase =
      suggestedCases * caseSize;

    return {
      productId: String(product.id),
      productName: product.name,
      iikoCode: product.iiko_code || "",
      unit: product.iiko_unit || "",

      orderDate,
      deliveryDate,
      coverageEndDate,

      caseSize,
      safetyStock,

      openingStock,
      totalUsage: round(totalUsage),
      incomingTotal: round(incomingTotal),

      // Остаток без нового заказа
      closingWithoutNewOrder: round(stock),

      requiredBase: round(requiredBase),
      suggestedCases,
      suggestedBase: round(suggestedBase),

      // Ожидаемый остаток в конце периода
      closingWithNewOrder: round(
        stock + suggestedBase
      ),

      preDeliveryShortage: round(
        preDeliveryShortage
      ),

      hasPreDeliveryShortage:
        preDeliveryShortage > EPS,

      days
    };
  }

  function calculateOrder(options) {
    const {
      products,
      counts,
      usages,
      plan,
      incoming = []
    } = options;

    if (!Array.isArray(products)) {
      throw new Error(
        "Не передан список товаров Cola"
      );
    }

    if (!(usages instanceof Map)) {
      throw new Error(
        "Не загружена реализация Cola"
      );
    }

    if (!Array.isArray(incoming)) {
      throw new Error(
        "Неверный список входящих поставок"
      );
    }

    const deliveries = plan?.deliveries;

    if (!Array.isArray(deliveries) ||
        deliveries.length !== 1) {
      throw new Error(
        "Для этого расчёта требуется " +
        "одна поставка Cola. " +
        "Несколько поставок будут " +
        "обрабатываться отдельным расчётом."
      );
    }

    const delivery = deliveries[0];

    const results = products.map(product =>
      calculateProduct({
        product,
        counts,
        usages,
        orderDate: plan.orderDate,
        deliveryDate: delivery.date,
        coverageEndDate:
          delivery.coverageEndDate,
        incoming
      })
    );

    return {
      orderDate: plan.orderDate,
      deliveryDate: delivery.date,
      coverageEndDate:
        delivery.coverageEndDate,

      products: results,

      totalProducts: results.length,

      productsToOrder: results.filter(
        item => item.suggestedCases > 0
      ).length,

      productsWithShortage: results.filter(
        item => item.hasPreDeliveryShortage
      ).length
    };
  }

  window.IzakazColaCalculation = {
    calculateProduct,
    calculateOrder
  };

})();
