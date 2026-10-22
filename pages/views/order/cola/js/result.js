
/* ==========================================
   IZAKAZ v0.2.0
   COLA — STEP 2: ORDER RESULT

   Product cards + daily forecast
   Manual CASE editing

   Preview only:
   no Supabase writes
========================================== */

(function () {
  "use strict";

  const PAGE = "#cola-order-page";
  const PANEL = '[data-cola-panel="2"]';
  const CONTENT = "#cola-result-content";

  const DAY_NAMES = [
    "ВС", "ПН", "ВТ", "СР",
    "ЧТ", "ПТ", "СБ"
  ];

  let root = null;
  let observer = null;
  let loading = false;
  let generation = 0;
  let lastSignature = "";

  let currentResult = null;
  const manualCases = new Map();

  function esc(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char])
    );
  }

  function fmt(value) {
    return new Intl.NumberFormat("ru-RU", {
      maximumFractionDigits: 2
    }).format(Number(value || 0));
  }

  function formatDate(value) {
    if (!value) return "—";

    const [year, month, day] = value.split("-");

    return `${day}.${month}`;
  }

  function dayName(dateString) {
    const date = new Date(
      `${dateString}T12:00:00Z`
    );

    return DAY_NAMES[date.getUTCDay()];
  }

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

  function getContent() {
    return root?.querySelector(CONTENT);
  }

  function show(html) {
    const content = getContent();

    if (content) {
      content.innerHTML = html;
    }
  }

  /* ========================================
     USER / RESTAURANT
  ======================================== */

  async function getRestaurantId() {
    const db = getClient();

    const {
      data: auth,
      error: authError
    } = await db.auth.getUser();

    if (authError) throw authError;

    if (!auth?.user?.id) {
      throw new Error("Пользователь не найден");
    }

    const { data, error } = await db
      .from("profiles")
      .select("restaurant_id")
      .eq("id", auth.user.id)
      .single();

    if (error) throw error;

    if (!data?.restaurant_id) {
      throw new Error("Ресторан не найден");
    }

    return data.restaurant_id;
  }

  /* ========================================
     LOAD CALCULATION
  ======================================== */

  async function calculate() {
    const db = getClient();

    const orderDate = root
      .querySelector("#cola-stock-date")
      ?.value;

    if (!orderDate) {
      throw new Error("Не выбрана дата заказа");
    }

    const restaurantId = await getRestaurantId();

    const scheduleService =
      window.IzakazOrderSchedule;

    const usageService =
      window.IzakazOrderUsage;

    const calculationService =
      window.IzakazColaCalculation;

    if (
      !scheduleService ||
      !usageService ||
      !calculationService
    ) {
      throw new Error(
        "Не загружены модули расчёта Cola"
      );
    }

    const schedule =
      await scheduleService.loadColaSchedule(
        restaurantId
      );

    const plan =
      scheduleService.buildColaPlan({
        orderDate,
        schedule
      });

    const [
      orderResponse,
      productsResponse
    ] = await Promise.all([
      db.from("cola_orders")
        .select("id,status")
        .eq("restaurant_id", restaurantId)
        .eq("order_date", orderDate)
        .maybeSingle(),

      db.from("order_products")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("category", "cola")
        .eq("is_active", true)
        .order("sort_order")
        .order("name")
    ]);

    if (orderResponse.error) {
      throw orderResponse.error;
    }

    if (productsResponse.error) {
      throw productsResponse.error;
    }

    const order = orderResponse.data;
    const products = productsResponse.data || [];

    if (!order) {
      throw new Error(
        "Подсчёт остатков не найден"
      );
    }

    if (!products.length) {
      throw new Error("Нет товаров Cola");
    }

    const {
      data: stockRows,
      error: stockError
    } = await db
      .from("cola_order_stock_items")
      .select(
        "product_id,case_qty,slv_qty,pcs_qty"
      )
      .eq("cola_order_id", order.id);

    if (stockError) throw stockError;

    const counts = new Map(
      (stockRows || []).map(item => [
        String(item.product_id),
        item
      ])
    );

    const missingStock = products.filter(
      product => !counts.has(String(product.id))
    );

    if (missingStock.length) {
      throw new Error(
        "Не сохранены остатки: " +
        missingStock.map(p => p.name).join(", ")
      );
    }

    const usageResult =
      await usageService.loadColaUsage(
        restaurantId,
        products.map(p => String(p.id))
      );

    if (!usageResult.isComplete) {
      const missingIds = new Set([
        ...usageResult.missingProducts,
        ...usageResult.incompleteProducts
      ]);

      const names = products
        .filter(p => missingIds.has(String(p.id)))
        .map(p => p.name);

      throw new Error(
        "Заполните реализацию ПН–ВС: " +
        names.join(", ")
      );
    }

    const calculation =
      calculationService.calculateOrder({
        products,
        counts,
        usages: usageResult.usages,
        plan,

        // Подключим реальные поставки
        // на следующем этапе.
        incoming: []
      });

    const missingSafety = products
      .filter(p => p.safety_stock == null)
      .map(p => p.name);

    return {
      calculation,
      missingSafety
    };
  }

  /* ========================================
     MANUAL CASE
  ======================================== */

  function getSelectedCases(item) {
    const id = String(item.productId);

    if (manualCases.has(id)) {
      return manualCases.get(id);
    }

    return item.suggestedCases;
  }

  function getExpectedClosing(item, cases) {
    return (
      item.closingWithoutNewOrder +
      cases * item.caseSize
    );
  }

  function getForecast(item, cases) {
    const incomingFromCurrentOrder =
      cases * item.caseSize;

    return item.days.map(day => {
      const hasArrived =
        day.date >= item.deliveryDate;

      const stock =
        day.closingWithoutNewOrder +
        (
          hasArrived
            ? incomingFromCurrentOrder
            : 0
        );

      return {
        ...day,
        closing: stock,
        currentOrderReceipt:
          day.date === item.deliveryDate
            ? incomingFromCurrentOrder
            : 0
      };
    });
  }

  /* ========================================
     DAILY FORECAST
  ======================================== */

  function renderForecast(item, cases) {
    return getForecast(item, cases)
      .map(day => {
        const isDelivery =
          day.date === item.deliveryDate;

        const isNegative =
          day.closing < -0.00001;

        const isBelowSafety =
          day.date === item.coverageEndDate &&
          day.closing < item.safetyStock;

        const classNames = [
          "cola-day-card",
          isDelivery ? "is-delivery" : "",
          isNegative ? "is-shortage" : "",
          isBelowSafety ? "is-low" : ""
        ].filter(Boolean).join(" ");

        return `
          <div class="${classNames}">

            <div class="cola-day-top">
              <strong>
                ${dayName(day.date)}
              </strong>

              <small>
                ${formatDate(day.date)}
              </small>
            </div>

            <div class="cola-day-label">
              Остаток
            </div>

            <div class="cola-day-value">
              ${fmt(day.closing)}
              <small>${esc(item.unit)}</small>
            </div>

            <div class="cola-day-usage">
              Расход: ${fmt(day.usage)}
              ${esc(item.unit)}
            </div>

            ${
              day.currentOrderReceipt > 0
                ? `
                  <div class="cola-day-incoming">
                    + Заказ:
                    ${fmt(day.currentOrderReceipt)}
                    ${esc(item.unit)}
                  </div>
                `
                : ""
            }

            ${
              isNegative
                ? `
                  <div class="cola-day-alert">
                    Дефицит
                  </div>
                `
                : ""
            }

            ${
              isBelowSafety
                ? `
                  <div class="cola-day-alert">
                    Ниже запаса
                  </div>
                `
                : ""
            }

          </div>
        `;
      })
      .join("");
  }

  /* ========================================
     PRODUCT CARD
  ======================================== */

  function renderProduct(item) {
    const selected = getSelectedCases(item);

    const expectedClosing =
      getExpectedClosing(item, selected);

    const isChanged =
      selected !== item.suggestedCases;

    return `
      <article
        class="cola-product-result"
        data-cola-result-product="${esc(item.productId)}"
      >

        <div class="cola-product-result-header">

          <div class="cola-product-identity">
            <h3>
              ${esc(item.productName)}
            </h3>

            <div class="cola-product-tags">

              <span class="cola-product-code">
                ${esc(item.iikoCode)}
              </span>

              <span class="cola-product-unit">
                ${esc(item.unit)}
              </span>

              <span class="cola-product-safety">
                Запас +${fmt(item.safetyStock)}
                ${esc(item.unit)}
              </span>

            </div>
          </div>

          <div class="cola-order-quantity">

            <span>ЗАКАЗАТЬ</span>

            <div class="cola-order-number">
              <input
                type="number"
                min="0"
                max="99999"
                step="1"
                inputmode="numeric"
                value="${selected}"
                data-cola-case-input
                aria-label="Количество CASE: ${esc(item.productName)}"
              >

              <strong>CASE</strong>
            </div>

            <small data-cola-case-base>
              ${fmt(selected * item.caseSize)}
              ${esc(item.unit)}
            </small>

            ${
              isChanged
                ? `
                  <button
                    type="button"
                    class="cola-reset-case"
                    data-cola-case-reset
                  >
                    Вернуть рекомендацию:
                    ${item.suggestedCases}
                  </button>
                `
                : ""
            }

          </div>

        </div>

        <div class="cola-product-metrics">

          <div class="cola-metric">
            <span>Факт. остаток</span>

            <strong>
              ${fmt(item.openingStock)}
              ${esc(item.unit)}
            </strong>
          </div>

          <div class="cola-metric">
            <span>Расход за период</span>

            <strong>
              ${fmt(item.totalUsage)}
              ${esc(item.unit)}
            </strong>
          </div>

          <div class="cola-metric">
            <span>1 CASE</span>

            <strong>
              ${fmt(item.caseSize)}
              ${esc(item.unit)}
            </strong>
          </div>

          <div class="cola-metric is-accent">
            <span>Остаток после</span>

            <strong data-cola-expected-closing>
              ${fmt(expectedClosing)}
              ${esc(item.unit)}
            </strong>
          </div>

        </div>

        ${
          item.hasPreDeliveryShortage
            ? `
              <div class="cola-product-alert">
                Внимание: запас может закончиться
                до прибытия поставки.
                Дефицит:
                ${fmt(item.preDeliveryShortage)}
                ${esc(item.unit)}.
              </div>
            `
            : ""
        }

        <div class="cola-forecast-title">
          ПРОГНОЗ ПО ДНЯМ
        </div>

        <div
          class="cola-forecast-grid"
          data-cola-forecast
        >
          ${renderForecast(item, selected)}
        </div>

      </article>
    `;
  }

  /* ========================================
     STYLES
  ======================================== */

  const STYLES = `
    <style>
      #cola-order-page .cola-result-notice {
        padding: 13px 15px;
        margin-bottom: 15px;
        border: 1px solid #f2d177;
        border-radius: 12px;
        background: #fff9e6;
        color: #735900;
        font-size: 11px;
        line-height: 1.6;
      }

      #cola-order-page .cola-result-heading {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 18px;
      }

      #cola-order-page .cola-result-heading h3 {
        margin: 0 0 5px;
        font-size: 18px;
      }

      #cola-order-page .cola-result-heading p {
        margin: 0;
        color: var(--cola-muted, #777);
        font-size: 11px;
      }

      #cola-order-page .cola-result-reload {
        padding: 10px 15px;
        border: 1px solid var(--cola-border, #ddd);
        border-radius: 10px;
        background: var(--cola-surface, #fff);
        color: var(--cola-text, #222);
        cursor: pointer;
        font-size: 11px;
        font-weight: 700;
      }

      #cola-order-page .cola-product-result {
        margin-bottom: 13px;
        padding: 18px;
        border: 1px solid var(--cola-border, #e1e3e6);
        border-radius: 16px;
        background: var(--cola-surface, #fff);
      }

      #cola-order-page .cola-product-result-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        margin-bottom: 16px;
      }

      #cola-order-page .cola-product-identity {
        min-width: 0;
      }

      #cola-order-page .cola-product-identity h3 {
        margin: 0 0 9px;
        font-size: 15px;
        font-weight: 800;
        overflow-wrap: anywhere;
      }

      #cola-order-page .cola-product-tags {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
      }

      #cola-order-page .cola-product-code,
      #cola-order-page .cola-product-safety {
        padding: 5px 8px;
        border-radius: 6px;
        font-size: 10px;
      }

      #cola-order-page .cola-product-code {
        background: var(--cola-soft, #f3f4f5);
        color: var(--cola-muted, #777);
      }

      #cola-order-page .cola-product-unit {
        font-size: 10px;
        color: var(--cola-muted, #777);
      }

      #cola-order-page .cola-product-safety {
        background: #fff2bd;
        color: #735400;
        font-weight: 700;
      }

      #cola-order-page .cola-order-quantity {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        min-width: 145px;
        padding: 12px;
        border: 1px solid #efbf20;
        border-radius: 13px;
        background: #fff4c8;
        color: #171717;
      }

      #cola-order-page .cola-order-quantity > span {
        font-size: 9px;
        color: #886700;
      }

      #cola-order-page .cola-order-number {
        display: flex;
        align-items: baseline;
        justify-content: flex-end;
        gap: 7px;
        width: 100%;
      }

      #cola-order-page .cola-order-number input {
        width: 76px;
        padding: 0;
        border: 0;
        border-bottom: 1px solid #cfaa28;
        border-radius: 0;
        outline: none;
        background: transparent;
        color: #171717;
        font: inherit;
        font-size: 33px;
        font-weight: 900;
        text-align: right;
      }

      #cola-order-page .cola-order-number strong {
        font-size: 10px;
      }

      #cola-order-page .cola-order-quantity > small {
        margin-top: 5px;
        font-size: 10px;
        color: #8a6a00;
      }

      #cola-order-page .cola-reset-case {
        margin-top: 7px;
        border: 0;
        padding: 0;
        background: transparent;
        color: #705500;
        font-size: 9px;
        cursor: pointer;
        text-decoration: underline;
      }

      #cola-order-page .cola-product-metrics {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 17px;
      }

      #cola-order-page .cola-metric {
        min-width: 0;
        padding: 12px;
        border-radius: 10px;
        background: var(--cola-soft, #f5f6f7);
      }

      #cola-order-page .cola-metric > span {
        display: block;
        margin-bottom: 9px;
        font-size: 10px;
        color: var(--cola-muted, #777);
      }

      #cola-order-page .cola-metric strong {
        font-size: 13px;
      }

      #cola-order-page .cola-metric.is-accent {
        border: 1px solid #f0c33d;
        background: #fff9e6;
        color: #735900;
      }

      #cola-order-page .cola-product-alert {
        margin-bottom: 14px;
        padding: 10px 12px;
        border-radius: 9px;
        background: #fff0ed;
        color: #b42318;
        font-size: 11px;
      }

      #cola-order-page .cola-forecast-title {
        margin-bottom: 9px;
        color: var(--cola-muted, #777);
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.3px;
      }

      #cola-order-page .cola-forecast-grid {
        display: grid;
        grid-template-columns:
          repeat(auto-fit, minmax(135px, 1fr));
        gap: 8px;
      }

      #cola-order-page .cola-day-card {
        min-width: 0;
        padding: 12px;
        border: 1px solid var(--cola-border, #ddd);
        border-radius: 11px;
        background: var(--cola-soft, #f7f8f9);
      }

      #cola-order-page .cola-day-card.is-delivery {
        border-color: #edb600;
        background: #fff9e6;
      }

      #cola-order-page .cola-day-card.is-shortage,
      #cola-order-page .cola-day-card.is-low {
        border-color: #ef9a92;
        background: #fff0ed;
      }

      #cola-order-page .cola-day-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 5px;
        margin-bottom: 12px;
      }

      #cola-order-page .cola-day-top strong {
        font-size: 11px;
      }

      #cola-order-page .cola-day-top small {
        color: var(--cola-muted, #888);
        font-size: 9px;
      }

      #cola-order-page .cola-day-label {
        color: var(--cola-muted, #888);
        font-size: 9px;
      }

      #cola-order-page .cola-day-value {
        margin-top: 4px;
        font-size: 21px;
        font-weight: 850;
      }

      #cola-order-page .cola-day-value small {
        font-size: 9px;
        font-weight: 500;
      }

      #cola-order-page .cola-day-usage {
        margin-top: 9px;
        color: var(--cola-muted, #888);
        font-size: 9px;
      }

      #cola-order-page .cola-day-incoming {
        margin-top: 7px;
        color: #8b6500;
        font-size: 9px;
        font-weight: 800;
      }

      #cola-order-page .cola-day-alert {
        margin-top: 7px;
        color: #b42318;
        font-size: 9px;
        font-weight: 800;
      }

      @media (max-width: 800px) {
        #cola-order-page .cola-product-metrics {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 520px) {
        #cola-order-page .cola-product-result {
          padding: 13px;
        }

        #cola-order-page .cola-product-result-header {
          flex-direction: column;
        }

        #cola-order-page .cola-order-quantity {
          width: 100%;
          align-items: flex-start;
        }

        #cola-order-page .cola-order-number {
          justify-content: flex-start;
        }

        #cola-order-page .cola-order-number input {
          text-align: left;
        }

        #cola-order-page .cola-forecast-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    </style>
  `;

  /* ========================================
     RENDER ALL
  ======================================== */

  function render(result) {
    currentResult = result;

    const c = result.calculation;

    const cards = c.products
      .map(renderProduct)
      .join("");

    show(`
      ${STYLES}

      <div class="cola-result-notice">
        Предварительный расчёт.
        Ранее запланированные поставки
        пока не учитываются.
        Изменения CASE не сохраняются.
      </div>

      ${
        result.missingSafety.length
          ? `
            <div class="cola-result-notice">
              Для ${result.missingSafety.length}
              товаров не задан safety stock.
              В расчёте временно используется 0.
            </div>
          `
          : ""
      }

      <div class="cola-result-heading">
        <div>
          <h3>Расчёт заказа Cola</h3>

          <p>
            Заказ: ${formatDate(c.orderDate)}
            · Поставка: ${formatDate(c.deliveryDate)}
            · Покрытие до:
            ${formatDate(c.coverageEndDate)}
          </p>
        </div>

        <button
          type="button"
          class="cola-result-reload"
          data-cola-result-reload
        >
          Обновить расчёт
        </button>
      </div>

      <div class="cola-product-results">
        ${cards}
      </div>
    `);
  }

  /* ========================================
     MANUAL EDIT UPDATE
  ======================================== */

  function findProduct(productId) {
    return currentResult?.calculation.products
      .find(item =>
        String(item.productId) === String(productId)
      );
  }

  function updateProduct(productId) {
    const item = findProduct(productId);

    if (!item) return;

    const container = getContent()
      ?.querySelectorAll(
        "[data-cola-result-product]"
      );

    const card = [...(container || [])]
      .find(element =>
        element.dataset.colaResultProduct ===
        String(productId)
      );

    if (!card) return;

    const cases = getSelectedCases(item);

    const base = cases * item.caseSize;

    const closing = getExpectedClosing(
      item,
      cases
    );

    const baseElement = card.querySelector(
      "[data-cola-case-base]"
    );

    if (baseElement) {
      baseElement.textContent =
        `${fmt(base)} ${item.unit}`;
    }

    const closingElement = card.querySelector(
      "[data-cola-expected-closing]"
    );

    if (closingElement) {
      closingElement.textContent =
        `${fmt(closing)} ${item.unit}`;
    }

    const forecastElement = card.querySelector(
      "[data-cola-forecast]"
    );

    if (forecastElement) {
      forecastElement.innerHTML =
        renderForecast(item, cases);
    }

    const quantity = card.querySelector(
      ".cola-order-quantity"
    );

    if (quantity) {
      const existingReset = quantity.querySelector(
        "[data-cola-case-reset]"
      );

      existingReset?.remove();

      if (cases !== item.suggestedCases) {
        const button =
          document.createElement("button");

        button.type = "button";
        button.className = "cola-reset-case";
        button.dataset.colaCaseReset = "";

        button.textContent =
          "Вернуть рекомендацию: " +
          item.suggestedCases;

        quantity.appendChild(button);
      }
    }
  }

  /* ========================================
     REFRESH
  ======================================== */

  async function refresh(force = false) {
    if (!root?.isConnected) return;

    const panel = root.querySelector(PANEL);

    if (!panel || panel.hidden) return;

    const date = root.querySelector(
      "#cola-stock-date"
    )?.value || "";

    const signature = date;

    if (
      !force &&
      (
        loading ||
        lastSignature === signature
      )
    ) {
      return;
    }

    loading = true;

    const ticket = ++generation;

    show("<p>Загрузка расчёта Cola...</p>");

    try {
      const result = await calculate();

      if (
        ticket !== generation ||
        !root?.isConnected
      ) {
        return;
      }

      if (force || lastSignature !== signature) {
        manualCases.clear();
      }

      render(result);

      lastSignature = signature;

    } catch (error) {
      if (
        ticket !== generation ||
        !root?.isConnected
      ) {
        return;
      }

      console.error("[Cola Result]", error);

      show(`
        ${STYLES}
        <div class="cola-result-notice">
          Ошибка расчёта:
          ${esc(error.message || error)}
          <br><br>

          <button
            type="button"
            class="cola-result-reload"
            data-cola-result-reload
          >
            Повторить
          </button>
        </div>
      `);

      lastSignature = "";

    } finally {
      if (ticket === generation) {
        loading = false;
      }
    }
  }

  /* ========================================
     EVENTS
  ======================================== */

  function bindEvents() {
    root.addEventListener("change", event => {
      const input = event.target.closest(
        "[data-cola-case-input]"
      );

      if (!input) return;

      const card = input.closest(
        "[data-cola-result-product]"
      );

      if (!card) return;

      const productId =
        card.dataset.colaResultProduct;

      const number = Number(input.value);

      if (
        input.value.trim() === "" ||
        !Number.isSafeInteger(number) ||
        number < 0 ||
        number > 99999
      ) {
        const item = findProduct(productId);

        if (item) {
          input.value = getSelectedCases(item);
        }

        return;
      }

      manualCases.set(productId, number);

      input.value = number;

      updateProduct(productId);
    });

    root.addEventListener("click", event => {
      const reload = event.target.closest(
        "[data-cola-result-reload]"
      );

      if (reload) {
        refresh(true);
        return;
      }

      const reset = event.target.closest(
        "[data-cola-case-reset]"
      );

      if (!reset) return;

      const card = reset.closest(
        "[data-cola-result-product]"
      );

      if (!card) return;

      const productId =
        card.dataset.colaResultProduct;

      const item = findProduct(productId);

      if (!item) return;

      manualCases.delete(productId);

      const input = card.querySelector(
        "[data-cola-case-input]"
      );

      if (input) {
        input.value = item.suggestedCases;
      }

      updateProduct(productId);
    });
  }

  /* ========================================
     INITIALIZATION
  ======================================== */

  function init(container = document) {
    const element = container.querySelector(PAGE);

    if (!element || element === root) {
      return;
    }

    observer?.disconnect();

    root = element;
    generation++;
    loading = false;
    lastSignature = "";
    currentResult = null;
    manualCases.clear();

    bindEvents();

    const panel = root.querySelector(PANEL);

    if (!panel) return;

    observer = new MutationObserver(() => {
      if (!panel.hidden) {
        refresh();
      }
    });

    observer.observe(panel, {
      attributes: true,
      attributeFilter: ["hidden"]
    });

    if (!panel.hidden) {
      refresh();
    }
  }

  document.addEventListener(
    "app:page-loaded",
    event => {
      if (event.detail?.route === "order-cola") {
        init(document);
      }
    }
  );

  window.IzakazColaResult = {
    init,
    refresh,
    getSelectedCases: () =>
      new Map(manualCases)
  };

  if (document.querySelector(PAGE)) {
    init(document);
  }

})();
