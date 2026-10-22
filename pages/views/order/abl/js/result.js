
/* ==========================================
   IZAKAZ v0.2.0
   ABL — STEP 2 / RESULT

   Tabs: Freezer, Cooler, Fresh, Dry
   Daily forecast
   Existing expected deliveries
   Separate CASE for each delivery
   Manual overrides
========================================== */

(function () {
  "use strict";

  const ROOT_ID = "abl-order-page";

  const CATEGORIES = [
    { key: "freezer", name: "Freezer" },
    { key: "cooler", name: "Cooler" },
    { key: "fresh", name: "Fresh" },
    { key: "dry", name: "Сухой" }
  ];

  const DAYS = [
    "monday", "tuesday", "wednesday",
    "thursday", "friday", "saturday", "sunday"
  ];

  let root = null;
  let client = null;
  let activeCategory = "freezer";
  let activeOrderId = null;

  let calculationContext = null;
  let result = null;
  let overrides = new Map();

  let loading = false;
  let generation = 0;

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatNumber(value, digits = 2) {
    return new Intl.NumberFormat("ru-RU", {
      maximumFractionDigits: digits
    }).format(Number(value || 0));
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value + "T12:00:00Z");

    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC"
    }).format(date);
  }

  function shortDate(value) {
    const date = new Date(value + "T12:00:00Z");

    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "UTC"
    }).format(date);
  }

  function dayName(value) {
    const date = new Date(value + "T12:00:00Z");

    return new Intl.DateTimeFormat("ru-RU", {
      weekday: "short",
      timeZone: "UTC"
    }).format(date).replace(".", "").toUpperCase();
  }

  function getClient() {
    const connection =
      window.supabaseClient ||
      (
        typeof supabaseClient !== "undefined"
          ? supabaseClient
          : null
      );

    if (!connection) {
      throw new Error("Supabase не подключён");
    }

    return connection;
  }

  function getStock() {
    if (!window.IzakazAblStock?.getOrder) {
      throw new Error("ABL stock.js не загружен");
    }
    return window.IzakazAblStock;
  }

  function getCalculator() {
    if (!window.IzakazAblCalculation?.calculateAll) {
      throw new Error("ABL calculation.js не загружен");
    }
    return window.IzakazAblCalculation;
  }

  function getContent() {
    return root?.querySelector("#abl-result-content");
  }

  function getSummary() {
    return root?.querySelector("#abl-calculation-summary");
  }

  function showMessage(message) {
    const element = getContent();
    if (!element) return;

    element.innerHTML = `
      <div class="abl-placeholder">
        <strong>Расчёт заказа ABL</strong>
        <p>${escapeHTML(message)}</p>
      </div>
    `;
  }

  async function restaurantId() {
    const auth = await client.auth.getUser();

    if (auth.error || !auth.data?.user) {
      throw new Error("Пользователь не найден");
    }

    const profile = await client
      .from("profiles")
      .select("restaurant_id")
      .eq("id", auth.data.user.id)
      .single();

    if (profile.error) throw profile.error;

    if (!profile.data?.restaurant_id) {
      throw new Error("Ресторан не определён");
    }

    return profile.data.restaurant_id;
  }

  async function loadUsage(id, products) {
    const response = await client
      .from("product_weekly_usage")
      .select(`
        product_id,
        monday,
        tuesday,
        wednesday,
        thursday,
        friday,
        saturday,
        sunday
      `)
      .eq("restaurant_id", id)
      .in("product_id", products.map(x => x.id));

    if (response.error) throw response.error;

    const map = new Map(
      (response.data || []).map(row => [
        String(row.product_id), row
      ])
    );

    for (const product of products) {
      const usage = map.get(String(product.id));

      if (!usage) {
        throw new Error(
          "Нет реализации: " + product.name
        );
      }

      for (const day of DAYS) {
        const value = usage[day];

        if (
          value === null ||
          value === undefined ||
          value === "" ||
          !Number.isFinite(Number(value)) ||
          Number(value) < 0
        ) {
          throw new Error(
            "Проверьте реализацию " +
            day + ": " + product.name
          );
        }
      }
    }

    return map;
  }

  async function loadSchedule(id) {
    const response = await client
      .from("restaurant_delivery_schedule")
      .select(`
        weekday,
        source_order_day,
        delivery_group,
        is_active
      `)
      .eq("restaurant_id", id)
      .eq("delivery_group", "general")
      .eq("is_active", true);

    if (response.error) throw response.error;

    if (!response.data?.length) {
      throw new Error("График ABL не настроен");
    }

    return response.data;
  }

  async function loadKnownDeliveries(
    id, startDate, endDate, products, orderId
  ) {
    const known = new Map(
      products.map(p => [String(p.id), []])
    );

    const productsById = new Map(
      products.map(p => [String(p.id), p])
    );

    const response = await client
      .from("order_deliveries")
      .select(`
        id,
        delivery_date,
        delivery_group,
        source_weekly_order_id,
        status
      `)
      .eq("restaurant_id", id)
      .eq("delivery_group", "general")
      .gte("delivery_date", startDate)
      .lte("delivery_date", endDate);

    if (response.error) throw response.error;

    const activeStatuses = new Set([
      "expected",
      "confirmed",
      "in_transit",
      "in-transit",
      "shipped"
    ]);

    const excludedStatuses = new Set([
      "draft",
      "received",
      "completed",
      "cancelled",
      "canceled"
    ]);

    const deliveries = (response.data || [])
      .filter(row => {
        if (row.source_weekly_order_id === orderId) {
          return false;
        }

        const status = String(
          row.status || ""
        ).toLowerCase();

        if (activeStatuses.has(status)) return true;
        if (excludedStatuses.has(status)) return false;

        throw new Error(
          "Неизвестный статус поставки: " + status
        );
      });

    if (!deliveries.length) return known;

    const responseItems = await client
      .from("order_delivery_items")
      .select(`
        delivery_id,
        product_id,
        case_qty,
        slv_qty,
        pcs_qty,
        base_qty
      `)
      .in("delivery_id", deliveries.map(d => d.id));

    if (responseItems.error) throw responseItems.error;

    const deliveriesById = new Map(
      deliveries.map(d => [String(d.id), d])
    );

    for (const item of responseItems.data || []) {
      const key = String(item.product_id);
      const product = productsById.get(key);
      const delivery = deliveriesById.get(
        String(item.delivery_id)
      );

      if (!product || !delivery) continue;

      const baseQty = item.base_qty != null
        ? Number(item.base_qty)
        : (
          Number(item.case_qty || 0) *
            Number(product.case_to_base || 0) +
          Number(item.slv_qty || 0) *
            Number(product.slv_to_base || 0) +
          Number(item.pcs_qty || 0) *
            Number(product.pcs_to_base || 0)
        );

      if (
        !Number.isFinite(baseQty) ||
        baseQty < 0
      ) {
        throw new Error(
          "Некорректная поставка: " + product.name
        );
      }

      known.get(key).push({
        date: delivery.delivery_date,
        qty: baseQty
      });
    }

    return known;
  }

  function buildStockMap(products) {
    const stock = getStock();
    const map = new Map();

    for (const product of products) {
      const item = stock.getStock(product.id);

      if (
        !item ||
        [
          item.case_qty,
          item.slv_qty,
          item.pcs_qty
        ].every(x => x == null)
      ) {
        throw new Error(
          "Не подсчитан остаток: " + product.name
        );
      }

      const qty =
        Number(item.case_qty || 0) *
          Number(product.case_to_base || 0) +
        Number(item.slv_qty || 0) *
          Number(product.slv_to_base || 0) +
        Number(item.pcs_qty || 0) *
          Number(product.pcs_to_base || 0);

      map.set(String(product.id), qty);
    }

    return map;
  }

  /* ==========================================
     RECOMPUTE WITHOUT NETWORK
  ========================================== */

  function recalculate() {
    if (!calculationContext) return;

    result = getCalculator().calculateAll({
      ...calculationContext,
      overridesByProduct: overrides
    });

    render();
  }

  async function calculate() {
    if (!root || loading) return;

    const request = ++generation;
    loading = true;

    showMessage("Загрузка расчёта...");

    try {
      const stock = getStock();

      await stock.flushSaves();

      const order = stock.getOrder();
      const orderDate = stock.getOrderDate();

      if (!order?.id || !orderDate) {
        throw new Error(
          "Сначала завершите подсчёт остатков"
        );
      }

      const products = stock.getProducts().filter(
        p => CATEGORIES.some(c => c.key === p.category)
      );

      const id = await restaurantId();

      const [usage, schedule] = await Promise.all([
        loadUsage(id, products),
        loadSchedule(id)
      ]);

      const plan = getCalculator().buildPlan(
        orderDate, schedule
      );

      const known = await loadKnownDeliveries(
        id,
        orderDate,
        plan.nextDeliveryDate,
        products,
        order.id
      );

      if (
        request !== generation ||
        !root.isConnected ||
        stock.getOrder()?.id !== order.id
      ) {
        return;
      }

      if (activeOrderId !== order.id) {
        overrides = new Map();
        activeOrderId = order.id;
      }

      calculationContext = {
        orderDate,
        products,
        stockByProduct: buildStockMap(products),
        usageByProduct: usage,
        knownByProduct: known,
        safetyByProduct: new Map(),
        deliverySchedule: schedule
      };

      recalculate();

    } catch (error) {
      if (request !== generation) return;

      calculationContext = null;
      result = null;

      console.error("[ABL Result]", error);

      showMessage(
        error.message || "Ошибка расчёта"
      );

    } finally {
      loading = false;
    }
  }

  /* ==========================================
     CATEGORY SUMMARY
  ========================================== */

  function renderSummary() {
    const container = getSummary();
    if (!container || !result) return;

    const categoryItems = result.results.filter(
      item => item.product.category === activeCategory
    );

    const cases = categoryItems.reduce(
      (sum, item) => sum + item.totalRecommendedCases,
      0
    );

    const shortages = categoryItems.filter(
      item => item.hasShortageBeforeDelivery
    ).length;

    const deliveryDates = result.plan.deliveries
      .map(item => shortDate(item.date))
      .join(" · ");

    container.innerHTML = `
      <div class="abl-result-stats">
        <div class="abl-result-stat">
          <span>ПОЗИЦИЙ</span>
          <strong>${categoryItems.length}</strong>
        </div>

        <div class="abl-result-stat">
          <span>ПОСТАВКИ</span>
          <strong>${escapeHTML(deliveryDates)}</strong>
        </div>

        <div class="abl-result-stat">
          <span>РЕКОМЕНДАЦИЯ</span>
          <strong>${formatNumber(cases, 0)} CASE</strong>
        </div>

        <div class="abl-result-stat">
          <span>РИСК НЕХВАТКИ</span>
          <strong>${shortages} товаров</strong>
        </div>
      </div>
    `;
  }

  /* ==========================================
     PRODUCT CARD
  ========================================== */

  function renderProductCard(item) {
    const product = item.product;
    const unit = escapeHTML(product.iiko_unit || "");
    const id = escapeHTML(product.id);

    const usage = calculationContext.usageByProduct
      .get(String(product.id));

    const average = DAYS.reduce(
      (sum, day) => sum + Number(usage[day] || 0),
      0
    ) / 7;

    const knownHTML = item.knownDeliveries.length
      ? item.knownDeliveries
          .map(delivery => `
            <span class="abl-known-delivery">
              ${escapeHTML(shortDate(delivery.date))}
              · +${formatNumber(delivery.qty)} ${unit}
            </span>
          `).join("")
      : `<span class="abl-result-muted">
           Ожидаемых поставок нет
         </span>`;

    const controls = item.deliveries.map(delivery => `
      <div class="abl-case-control">
        <div class="abl-case-control-info">
          <strong>
            ${escapeHTML(dayName(delivery.date))}
            ${escapeHTML(shortDate(delivery.date))}
          </strong>
          <small>
            Покрытие:
            ${escapeHTML(
              shortDate(delivery.coverageStartDate)
            )}
            –
            ${escapeHTML(
              shortDate(delivery.coverageEndDate)
            )}
          </small>
          <small>
            Авто: ${delivery.automaticCases} CASE
          </small>
        </div>

        <div class="abl-case-actions">
          <button type="button"
            data-abl-minus="${id}"
            data-abl-date="${delivery.date}">−</button>

          <input type="number"
            min="0"
            step="1"
            data-abl-case-product="${id}"
            data-abl-case-date="${delivery.date}"
            value="${delivery.recommendedCases}">

          <button type="button"
            data-abl-plus="${id}"
            data-abl-date="${delivery.date}">+</button>
        </div>

        <small>
          ${formatNumber(
            delivery.recommendedBaseQty
          )} ${unit}
        </small>
      </div>
    `).join("");

    const forecast = item.forecast.map(day => {
      const existing = day.knownDelivery > 0;
      const ordered = day.plannedDelivery > 0;
      const shortage = day.stockBeforeDelivery < 0;

      return `
        <div class="abl-forecast-day ${
          shortage ? "is-shortage" :
          ordered ? "is-ordered" :
          existing ? "is-expected" : ""
        }">

          <div class="abl-forecast-date">
            <strong>${escapeHTML(dayName(day.date))}</strong>
            <span>${escapeHTML(shortDate(day.date))}</span>
          </div>

          <span class="abl-forecast-label">
            Остаток
          </span>

          <strong class="abl-forecast-balance">
            ${formatNumber(day.closingStock)}
            <small>${unit}</small>
          </strong>

          <small>
            Расход:
            −${formatNumber(day.dailyUsage)}
          </small>

          ${
            existing
              ? `<small class="abl-forecast-incoming">
                   Уже ожидается:
                   +${formatNumber(day.knownDelivery)}
                 </small>`
              : ""
          }

          ${
            ordered
              ? `<small class="abl-forecast-new">
                   Новый заказ:
                   +${formatNumber(day.plannedDelivery)}
                 </small>`
              : ""
          }

          ${
            shortage
              ? `<small class="abl-forecast-warning">
                   Нехватка до поставки
                 </small>`
              : ""
          }
        </div>
      `;
    }).join("");

    return `
      <article class="abl-product-result-card">

        <header class="abl-product-result-header">
          <div>
            <h3>${escapeHTML(product.name)}</h3>

            <div class="abl-result-product-meta">
              ${escapeHTML(product.category)}
              · IIKO:
              ${escapeHTML(product.iiko_code || "—")}
            </div>
          </div>

          <div class="abl-product-result-total">
            <span>ВСЕГО ЗАКАЗАТЬ</span>
            <strong>
              ${item.totalRecommendedCases}
            </strong>
            <small>CASE</small>
          </div>
        </header>

        <div class="abl-product-metrics">
          <div>
            <span>Факт. остаток</span>
            <strong>
              ${formatNumber(item.startStock)} ${unit}
            </strong>
          </div>

          <div>
            <span>Средний расход / день</span>
            <strong>
              ${formatNumber(average)} ${unit}
            </strong>
          </div>

          <div>
            <span>1 CASE</span>
            <strong>
              ${formatNumber(item.caseToBase)} ${unit}
            </strong>
          </div>

          <div>
            <span>Запас</span>
            <strong>
              ${formatNumber(item.safetyStock)} ${unit}
            </strong>
          </div>
        </div>

        <div class="abl-case-controls">
          ${controls}
        </div>

        <div class="abl-known-deliveries">
          <strong>УЖЕ ОЖИДАЕТСЯ:</strong>
          ${knownHTML}
        </div>

        <div class="abl-forecast-heading">
          ПРОГНОЗ ПО ДНЯМ
        </div>

        <div class="abl-forecast-scroll">
          <div class="abl-forecast-grid">
            ${forecast}
          </div>
        </div>

      </article>
    `;
  }

  /* ==========================================
     RENDER
  ========================================== */

  function render() {
    if (!root || !result) return;

    renderSummary();

    const content = getContent();
    if (!content) return;

    const categoryItems = result.results.filter(
      item => item.product.category === activeCategory
    );

    const tabs = CATEGORIES.map(category => {
      const count = result.results.filter(
        item => item.product.category === category.key
      ).length;

      return `
        <button
          type="button"
          class="abl-result-tab ${
            activeCategory === category.key
              ? "is-active" : ""
          }"
          data-abl-result-category="${category.key}">
          ${category.name}
          <span>${count}</span>
        </button>
      `;
    }).join("");

    content.innerHTML = `
      <div class="abl-result-tabs">
        ${tabs}
      </div>

      <div class="abl-result-category-title">
        <h3>
          ${CATEGORIES.find(
            c => c.key === activeCategory
          )?.name || activeCategory}
        </h3>

        <span>
          ${categoryItems.length} позиций
        </span>
      </div>

      <div class="abl-result-product-list">
        ${categoryItems.map(renderProductCard).join("")}
      </div>

      <div class="abl-result-confirm-bar">
        <div>
          <strong>
            Всего по ABL:
            ${formatNumber(result.totalCases, 0)} CASE
          </strong>
          <small>
            Проверьте количества и даты поставок
          </small>
        </div>

        <button
          type="button"
          class="abl-button is-primary"
          id="abl-confirm-order">
          Подтвердить заказ
        </button>
      </div>
    `;

    root.dispatchEvent(
      new CustomEvent("abl:result-ready", {
        detail: {
          result,
          orderDate: result.orderDate
        }
      })
    );
  }

  /* ==========================================
     CASE EDITING
  ========================================== */

  function changeCases(productId, date, value) {
    const quantity = Number(value);

    if (
      !Number.isInteger(quantity) ||
      quantity < 0
    ) {
      return;
    }

    const key = String(productId);

    const item = {
      ...(overrides.get(key) || {})
    };

    item[date] = quantity;

    overrides.set(key, item);
    recalculate();
  }

  function handleCases(event) {
    const plus = event.target.closest(
      "[data-abl-plus]"
    );

    const minus = event.target.closest(
      "[data-abl-minus]"
    );

    const button = plus || minus;
    if (!button) return false;

    const id = button.dataset.ablPlus ||
      button.dataset.ablMinus;

    const date = button.dataset.ablDate;

    const input = Array.from(
      root.querySelectorAll(
        "[data-abl-case-product]"
      )
    ).find(element =>
      element.dataset.ablCaseProduct === id &&
      element.dataset.ablCaseDate === date
    );

    if (!input) return true;

    const current = Number(input.value) || 0;

    changeCases(
      id,
      date,
      plus
        ? current + 1
        : Math.max(0, current - 1)
    );

    return true;
  }

  /* ==========================================
     EVENTS
  ========================================== */

  function bindEvents() {
    root.addEventListener("click", event => {
      const tab = event.target.closest(
        "[data-abl-result-category]"
      );

      if (tab) {
        activeCategory =
          tab.dataset.ablResultCategory;

        render();
        return;
      }

      handleCases(event);
    });

    root.addEventListener("change", event => {
      const input = event.target.closest(
        "[data-abl-case-product]"
      );

      if (!input) return;

      const value = input.value.trim();

      if (
        value === "" ||
        !Number.isInteger(Number(value)) ||
        Number(value) < 0
      ) {
        input.classList.add("is-invalid");
        return;
      }

      changeCases(
        input.dataset.ablCaseProduct,
        input.dataset.ablCaseDate,
        Number(value)
      );
    });

    root.addEventListener(
      "abl:step-changed",
      event => {
        if (event.detail?.step !== 2) return;

        if (
          calculationContext &&
          activeOrderId === getStock().getOrder()?.id
        ) {
          recalculate();
        } else {
          calculate();
        }
      }
    );

    root.addEventListener(
      "abl:date-changed",
      () => {
        generation++;
        calculationContext = null;
        result = null;
        overrides = new Map();
        activeOrderId = null;
        loading = false;
      }
    );
  }

  function init(container) {
    const nextRoot =
      container?.querySelector("#" + ROOT_ID) ||
      document.getElementById(ROOT_ID);

    if (!nextRoot) return;

    if (
      nextRoot.dataset.ablResultInitialized === "true"
    ) {
      return;
    }

    root = nextRoot;
    root.dataset.ablResultInitialized = "true";

    client = getClient();
    bindEvents();
  }

  document.addEventListener(
    "app:page-loaded",
    event => {
      if (event.detail?.route !== "order-abl") return;

      init(
        document.getElementById("page-container")
      );
    }
  );

  window.IzakazAblResult = {
    init,
    calculate,

    getResult() {
      return result;
    },

    getOverrides() {
      return overrides;
    }
  };

})();
