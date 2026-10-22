
/* ==========================================
   IZAKAZ v0.2.0
   COLA — STEP 1: STOCK
   Supabase Autosave
========================================== */

(function () {
  "use strict";

  const SAVE_DELAY = 500;

  const FIELDS = {
    case: {
      qty: "case_qty",
      factor: "case_to_base"
    },
    slv: {
      qty: "slv_qty",
      factor: "slv_to_base"
    },
    pcs: {
      qty: "pcs_qty",
      factor: "pcs_to_base"
    }
  };

  let root = null;
  let restaurantId = null;
  let userId = null;
  let order = null;
  let orderDate = "";

  let products = [];
  let productsById = new Map();
  let counts = new Map();
  let schedule = [];

  let ready = false;
  let switching = false;

  const saveTimers = new Map();
  const saveChains = new Map();
  const editVersions = new Map();
  const pendingProducts = new Set();
  const saveErrors = new Map();

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

  async function loadRestaurant() {
    const client = getClient();

    const {
      data: auth,
      error: authError
    } = await client.auth.getUser();

    if (authError || !auth?.user) {
      throw new Error("Пользователь не найден");
    }

    userId = auth.user.id;

    const { data, error } = await client
      .from("profiles")
      .select("restaurant_id")
      .eq("id", userId)
      .single();

    if (error) throw error;

    if (!data?.restaurant_id) {
      throw new Error("Ресторан не найден");
    }

    restaurantId = data.restaurant_id;
  }

  /* ========================================
     HELPERS
  ======================================== */

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("ru-RU", {
      maximumFractionDigits: 4
    }).format(Number(value || 0));
  }

  function localDateString(date) {
    const year = date.getFullYear();

    const month = String(
      date.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
      date.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function isoWeekday(date) {
    return date.getDay() || 7;
  }

  function getDefaultOrderDate() {
    const today = new Date();
    const day = isoWeekday(today);

    const monday = (1 - day + 7) % 7;
    const thursday = (4 - day + 7) % 7;

    today.setDate(
      today.getDate() + Math.min(monday, thursday)
    );

    return localDateString(today);
  }

  function isOrderDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }

    const date = new Date(`${value}T12:00:00`);

    return (
      !Number.isNaN(date.getTime()) &&
      localDateString(date) === value &&
      [1, 4].includes(isoWeekday(date))
    );
  }

  function getOrderDay() {
    const date = new Date(`${orderDate}T12:00:00`);

    return isoWeekday(date) === 1
      ? "monday"
      : "thursday";
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(`${value}T12:00:00`);

    return new Intl.DateTimeFormat("ru-RU", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit"
    }).format(date);
  }

  function isReadOnly() {
    return [
      "confirmed",
      "completed",
      "finished",
      "cancelled"
    ].includes(
      String(order?.status || "").toLowerCase()
    );
  }

  function hasUnit(product, field) {
    const factor = Number(
      product[FIELDS[field].factor]
    );

    return Number.isFinite(factor) && factor > 0;
  }

  function getEmptyCount() {
    return {
      case_qty: null,
      slv_qty: null,
      pcs_qty: null
    };
  }

  function hasCount(count) {
    return Boolean(
      count &&
      Object.values(count).some(
        value => value !== null && value !== undefined
      )
    );
  }

  function calculateTotal(product, count) {
    let total = 0;

    for (const field of Object.keys(FIELDS)) {
      if (!hasUnit(product, field)) continue;

      const config = FIELDS[field];
      const qty = count?.[config.qty];

      if (qty === null || qty === undefined) {
        continue;
      }

      total += (
        Number(qty) *
        Number(product[config.factor])
      );
    }

    return Math.round(total * 10000) / 10000;
  }

  /* ========================================
     PRODUCTS
  ======================================== */

  async function loadProducts() {
    const { data, error } = await getClient()
      .from("order_products")
      .select(`
        id,
        name,
        category,
        iiko_code,
        iiko_unit,
        case_to_base,
        slv_to_base,
        pcs_to_base,
        sort_order
      `)
      .eq("restaurant_id", restaurantId)
      .eq("category", "cola")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;

    products = data || [];

    productsById = new Map(
      products.map(product => [String(product.id), product])
    );
  }

  /* ========================================
     ORDER
  ======================================== */

  async function loadOrCreateOrder() {
    const client = getClient();

    const { data, error } = await client
      .from("cola_orders")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .eq("order_date", orderDate)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;

    const payload = {
      restaurant_id: restaurantId,
      order_date: orderDate,
      order_day: getOrderDay(),
      count_date: orderDate,
      same_day_delivery_status: "none",
      status: "counting",
      created_by: userId
    };

    const {
      data: created,
      error: createError
    } = await client
      .from("cola_orders")
      .insert(payload)
      .select("*")
      .single();

    if (!createError) return created;

    // Another session may have created the order.
    if (createError.code !== "23505") {
      throw createError;
    }

    const { data: existing, error: retryError } =
      await client
        .from("cola_orders")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("order_date", orderDate)
        .single();

    if (retryError) throw retryError;

    return existing;
  }

  /* ========================================
     LOAD SAVED STOCK
  ======================================== */

  async function loadSavedStock() {
    const { data, error } = await getClient()
      .from("cola_order_stock_items")
      .select(`
        product_id,
        case_qty,
        slv_qty,
        pcs_qty,
        base_qty
      `)
      .eq("cola_order_id", order.id);

    if (error) throw error;

    counts = new Map(
      (data || []).map(item => [
        String(item.product_id),
        {
          case_qty: item.case_qty == null
            ? null : Number(item.case_qty),

          slv_qty: item.slv_qty == null
            ? null : Number(item.slv_qty),

          pcs_qty: item.pcs_qty == null
            ? null : Number(item.pcs_qty)
        }
      ])
    );
  }

  /* ========================================
     STATUS
  ======================================== */

  function setStatus(message, isError = false) {
    const element = root?.querySelector(
      "#cola-stock-status"
    );

    if (!element) return;

    element.textContent = message;
    element.classList.toggle("is-error", isError);
  }

  function allCounted() {
    return (
      products.length > 0 &&
      products.every(product =>
        hasCount(counts.get(String(product.id)))
      )
    );
  }

  function hasPendingSaves() {
    return (
      saveTimers.size > 0 ||
      saveChains.size > 0 ||
      pendingProducts.size > 0
    );
  }

  function updateNextButton() {
    const button = root?.querySelector(
      "[data-cola-next]"
    );

    if (!button) return;

    button.disabled = (
      !ready ||
      switching ||
      !order ||
      !allCounted() ||
      hasPendingSaves() ||
      saveErrors.size > 0
    );
  }

  function updateSaveStatus() {
    if (!ready || switching) {
      updateNextButton();
      return;
    }

    if (saveErrors.size) {
      const firstError = [...saveErrors.values()][0];

      setStatus(
        "Ошибка сохранения: " + firstError,
        true
      );
    } else if (hasPendingSaves()) {
      setStatus("Сохранение остатков...");
    } else {
      setStatus("Все изменения сохранены в Supabase.");
    }

    updateNextButton();
  }

  /* ========================================
     RENDER SHELL
  ======================================== */

    
  function renderShell() {
    const container = root.querySelector(
      "#cola-stock-content"
    );

    container.innerHTML = `
      <div class="cola-stock-toolbar">

        <div class="cola-stock-plan">
          <span>График поставки</span>

          <strong id="cola-stock-plan-value">
            Загрузка...
          </strong>

          <small id="cola-stock-coverage">—</small>
        </div>

      </div>

      <div class="cola-stock-summary">
        <div>
          <span>Товаров Cola</span>
          <strong id="cola-stock-total">0</strong>
        </div>

        <div>
          <span>Подсчитано</span>
          <strong id="cola-stock-progress">0 / 0</strong>
        </div>
      </div>

      <div
        id="cola-stock-status"
        class="cola-stock-status"
      >
        Загрузка товаров...
      </div>

      <div class="cola-stock-table-wrap">
        <table class="cola-stock-table">

          <thead>
            <tr>
              <th>№</th>
              <th>Наименование</th>
              <th>case</th>
              <th>slv</th>
              <th>ед.</th>
              <th>Итого</th>
              <th></th>
            </tr>
          </thead>

          <tbody id="cola-stock-products">
            <tr>
              <td colspan="7">
                Загрузка...
              </td>
            </tr>
          </tbody>

        </table>
      </div>
    `;
  }


  function renderInput(product, field) {
    if (!hasUnit(product, field)) {
      return '<span class="cola-stock-na">—</span>';
    }

    const config = FIELDS[field];
    const count = counts.get(String(product.id));

    const value = count?.[config.qty] ?? "";

    return `
      <input
        class="cola-stock-input"
        type="number"
        min="0"
        step="0.01"
        placeholder="—"
        data-cola-stock-input="${field}"
        value="${escapeHTML(value)}"
        ${isReadOnly() ? "disabled" : ""}
        aria-label="${escapeHTML(
          product.name + " " + field
        )}"
      >
    `;
  }

  function renderProducts() {
    const tbody = root.querySelector(
      "#cola-stock-products"
    );

    root.querySelector(
      "#cola-stock-total"
    ).textContent = products.length;

    if (!products.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7">
            Нет активных товаров Cola
          </td>
        </tr>
      `;

      updateProgress();
      return;
    }

    tbody.innerHTML = products
      .map((product, index) => `
        <tr
          data-cola-product="${escapeHTML(product.id)}"
        >
          <td>${index + 1}</td>

          <td>
            <strong class="cola-stock-name">
              ${escapeHTML(product.name)}
            </strong>

            <small class="cola-stock-code">
              ${escapeHTML(product.iiko_code || "")}
            </small>
          </td>

          <td>${renderInput(product, "case")}</td>
          <td>${renderInput(product, "slv")}</td>
          <td>${renderInput(product, "pcs")}</td>

          <td>
            <strong data-cola-stock-total>—</strong>

            <small class="cola-stock-code">
              ${escapeHTML(product.iiko_unit || "ед.")}
            </small>
          </td>

          <td>
            <button
              class="cola-stock-zero"
              type="button"
              data-cola-stock-zero
              ${isReadOnly() ? "disabled" : ""}
              title="Нет остатка"
            >0</button>
          </td>
        </tr>
      `)
      .join("");

    products.forEach(product => {
      updateRow(String(product.id));
    });

    updateProgress();
  }

  function updateRow(productId) {
    const product = productsById.get(productId);
    const count = counts.get(productId);

    if (!product) return;

    const row = Array.from(
      root.querySelectorAll("[data-cola-product]")
    ).find(
      element =>
        element.dataset.colaProduct === productId
    );

    if (!row) return;

    const totalElement = row.querySelector(
      "[data-cola-stock-total]"
    );

    if (hasCount(count)) {
      totalElement.textContent = formatNumber(
        calculateTotal(product, count)
      );

      row.classList.add("is-counted");
    } else {
      totalElement.textContent = "—";
      row.classList.remove("is-counted");
    }
  }

  function updateProgress() {
    const completed = products.filter(
      product => hasCount(
        counts.get(String(product.id))
      )
    ).length;

    const element = root.querySelector(
      "#cola-stock-progress"
    );

    if (element) {
      element.textContent =
        `${completed} / ${products.length}`;
    }

    updateNextButton();
  }

  /* ========================================
     DELIVERY SCHEDULE
  ======================================== */

  function updateDeliveryPlan() {
    const planValue = root.querySelector(
      "#cola-stock-plan-value"
    );

    const coverage = root.querySelector(
      "#cola-stock-coverage"
    );

    if (!isOrderDate(orderDate)) {
      planValue.textContent = "Неверная дата";
      coverage.textContent =
        "Выберите понедельник или четверг";
      return;
    }

    if (!window.IzakazOrderSchedule) {
      planValue.textContent =
        "Модуль графика не загружен";

      coverage.textContent = "—";
      return;
    }

    try {
      const plan =
        window.IzakazOrderSchedule.buildColaPlan({
          orderDate,
          schedule
        });

      const deliveries = plan.deliveries || [];

      planValue.textContent = deliveries
        .map(item => formatDate(item.date))
        .join(", ") || "Нет поставок";

      const last = deliveries[deliveries.length - 1];

      coverage.textContent = last
        ? `Покрытие до ${formatDate(
            last.coverageEndDate
          )}`
        : "Поставок нет";

    } catch (error) {
      planValue.textContent = "Нет графика";
      coverage.textContent = error.message;
    }
  }

  /* ========================================
     AUTOSAVE
  ======================================== */

  function queueSave(productId) {
    if (!ready || switching || isReadOnly()) {
      return;
    }

    const nextVersion =
      (editVersions.get(productId) || 0) + 1;

    editVersions.set(productId, nextVersion);

    pendingProducts.add(productId);
    saveErrors.delete(productId);

    const oldTimer = saveTimers.get(productId);

    if (oldTimer) {
      clearTimeout(oldTimer);
    }

    const timer = setTimeout(() => {
      saveTimers.delete(productId);
      saveProduct(productId);
    }, SAVE_DELAY);

    saveTimers.set(productId, timer);

    updateSaveStatus();
  }

  function saveProduct(productId) {
    const product = productsById.get(productId);

    if (!product || !order?.id) {
      return Promise.resolve();
    }

    const version = editVersions.get(productId);
    const count = {
      ...(counts.get(productId) || getEmptyCount())
    };

    const orderId = order.id;

    // Жаңа сақтау алдыңғы сақтаудан кейін жүреді.
    const previous =
      saveChains.get(productId) || Promise.resolve();

    const task = previous
      .catch(() => {})
      .then(async () => {
        const client = getClient();

        if (!hasCount(count)) {
          const { error } = await client
            .from("cola_order_stock_items")
            .delete()
            .eq("cola_order_id", orderId)
            .eq("product_id", productId);

          if (error) throw error;

          return;
        }

        const payload = {
          cola_order_id: orderId,
          product_id: productId,
          case_qty: count.case_qty,
          slv_qty: count.slv_qty,
          pcs_qty: count.pcs_qty,
          base_qty: calculateTotal(product, count)
        };

        const { error } = await client
          .from("cola_order_stock_items")
          .upsert(payload, {
            onConflict: "cola_order_id,product_id"
          });

        if (error) throw error;
      });

    const observed = task
      .then(() => {
        if (editVersions.get(productId) === version) {
          pendingProducts.delete(productId);
          saveErrors.delete(productId);
        }
      })
      .catch(error => {
        if (editVersions.get(productId) === version) {
          saveErrors.set(
            productId,
            error.message || String(error)
          );
          pendingProducts.add(productId);
        }

        console.error(
          "[Cola Stock] Autosave:",
          error
        );
      })
      .finally(() => {
        if (saveChains.get(productId) === observed) {
          saveChains.delete(productId);
        }

        updateSaveStatus();
      });

    saveChains.set(productId, observed);

    updateSaveStatus();

    return observed;
  }

  async function flushSaves() {
    // Барлық таймерлерді бірден орындау.
    for (const [productId, timer] of saveTimers) {
      clearTimeout(timer);
      saveTimers.delete(productId);

      saveProduct(productId);
    }

    await Promise.all([...saveChains.values()]);

    if (saveErrors.size > 0) {
      throw new Error(
        "Есть несохранённые товары. Проверьте ошибки сохранения."
      );
    }
  }

  /* ========================================
     INPUT HANDLERS
  ======================================== */

  function handleCountInput(input) {
    if (!ready || switching || isReadOnly()) {
      return;
    }

    const row = input.closest(
      "[data-cola-product]"
    );

    if (!row) return;

    const productId = row.dataset.colaProduct;
    const product = productsById.get(productId);

    const field = input.dataset.colaStockInput;
    const config = FIELDS[field];

    if (!product || !config) return;

    const raw = input.value.trim();

    if (
      raw !== "" &&
      (
        !Number.isFinite(Number(raw)) ||
        Number(raw) < 0
      )
    ) {
      input.setCustomValidity(
        "Введите число от 0"
      );

      input.reportValidity();
      return;
    }

    input.setCustomValidity("");

    const count = {
      ...(counts.get(productId) || getEmptyCount())
    };

    count[config.qty] =
      raw === "" ? null : Number(raw);

    counts.set(productId, count);

    queueSave(productId);
    updateRow(productId);
    updateProgress();
  }

  function setZero(row) {
    if (!ready || switching || isReadOnly()) {
      return;
    }

    const productId = row.dataset.colaProduct;
    const product = productsById.get(productId);

    if (!product) return;

    const count = getEmptyCount();

    for (const field of Object.keys(FIELDS)) {
      if (hasUnit(product, field)) {
        count[FIELDS[field].qty] = 0;
      }
    }

    counts.set(productId, count);

    row.querySelectorAll(
      "[data-cola-stock-input]"
    ).forEach(input => {
      input.value = "0";
    });

    queueSave(productId);
    updateRow(productId);
    updateProgress();
  }

  /* ========================================
     OPEN ORDER BY DATE
  ======================================== */

  
  async function openDate(date) {
    if (!isOrderDate(date)) {
      throw new Error(
        "Заказ можно оформить только ПН или ЧТ"
      );
    }

    switching = true;
    ready = false;

    updateNextButton();

    const content = root.querySelector(
      "#cola-stock-products"
    );

    if (content) {
      content.innerHTML = `
        <tr>
          <td colspan="7">
            Загрузка остатков...
          </td>
        </tr>
      `;
    }

    try {
      orderDate = date;

      setStatus(
        "Загрузка заказа и остатков..."
      );

      order = await loadOrCreateOrder();

      if (!root?.isConnected) return;

      await loadSavedStock();

      if (!root?.isConnected) return;

      renderProducts();

      const input = root.querySelector(
        "#cola-stock-date"
      );

      if (input) {
        input.value = orderDate;
      }

      updateDeliveryPlan();

      // Сообщаем контроллеру о загруженном заказе.
      // confirmed -> готовый список
      // counting -> обычный подсчёт
      root.dispatchEvent(
        new CustomEvent("cola:order-loaded", {
          detail: {
            order: { ...order },
            orderDate
          }
        })
      );

      ready = !isReadOnly();

      setStatus(
        isReadOnly()
          ? "Заказ подтверждён. Остатки только для просмотра."
          : "Остатки загружены. Автосохранение включено."
      );

    } finally {
      switching = false;
      updateNextButton();
    }
  }


    /* ========================================
      EVENTS
    ======================================== */

    function bindEvents() {
      root.addEventListener("input", event => {
        const input = event.target.closest(
          "[data-cola-stock-input]"
        );

        if (input) {
          handleCountInput(input);
        }
      });

      root.addEventListener("click", event => {
        const button = event.target.closest(
          "[data-cola-stock-zero]"
        );

        if (!button) return;

        const row = button.closest(
          "[data-cola-product]"
        );

        if (row) {
          setZero(row);
        }
      });

      root.addEventListener(
        "change",
        async event => {
          if (
            event.target.id !==
            "cola-stock-date"
          ) {
            return;
          }

          const input = event.target;
          const nextDate = input.value;
          const previousDate = orderDate;

          if (!isOrderDate(nextDate)) {
            input.value = previousDate;

            setStatus(
              "Заказ возможен только в ПН или ЧТ",
              true
            );
            return;
          }

          if (nextDate === previousDate) {
            return;
          }

          if (switching) {
            input.value = previousDate;
            return;
          }

          switching = true;
          input.disabled = true;

          updateNextButton();

          try {
            await flushSaves();

            pendingProducts.clear();
            saveErrors.clear();
            editVersions.clear();

            await openDate(nextDate);

          } catch (error) {
            console.error(
              "[Cola Stock] Date switch:",
              error
            );

            if (orderDate !== previousDate) {
              try {
                await openDate(previousDate);
              } catch (restoreError) {
                console.error(
                  "[Cola Stock] Restore:",
                  restoreError
                );
              }
            }

            input.value = previousDate;

            setStatus(
              error.message || "Ошибка загрузки",
              true
            );

          } finally {
            switching = false;
            input.disabled = false;

            updateNextButton();
          }
        }
      );

      // Не переходить к расчёту,
      // пока есть несохранённые данные.
      root.addEventListener(
        "click",
        event => {
          const button = event.target.closest(
            "[data-cola-next], [data-cola-step='2']"
          );

          if (!button) return;

          if (
            !ready ||
            switching ||
            !allCounted() ||
            hasPendingSaves() ||
            saveErrors.size > 0
          ) {
            event.preventDefault();
            event.stopImmediatePropagation();

            setStatus(
              "Сначала подсчитайте и сохраните все товары Cola.",
              true
            );
          }
        },
        true
      );
    }

  /* ========================================
     INITIALIZATION
  ======================================== */

  async function init(container = document) {
    const element = container.querySelector(
      "#cola-order-page"
    );

    if (!element) return;

    if (
      element.dataset.colaStockInitialized ===
      "true"
    ) {
      return;
    }

    root = element;

    root.dataset.colaStockInitialized = "true";

    window.IzakazPageLoading?.show(
      root,
      "Загрузка заказа Cola…"
    );

    ready = false;
    switching = false;

    orderDate = getDefaultOrderDate();
    order = null;

    products = [];
    productsById = new Map();
    counts = new Map();

    schedule = [];

    saveTimers.clear();
    saveChains.clear();
    editVersions.clear();
    pendingProducts.clear();
    saveErrors.clear();

    
    renderShell();

    const dateField = root.querySelector(
      "#cola-stock-date"
    );

    if (dateField) {
      dateField.value = orderDate;
    }

    bindEvents();
    updateNextButton();


    try {
      await loadRestaurant();

      await loadProducts();

      if (!root.isConnected) return;

      if (!window.IzakazOrderSchedule) {
        throw new Error(
          "Модуль schedule-service.js не загружен"
        );
      }

      schedule =
        await window.IzakazOrderSchedule
          .loadColaSchedule(restaurantId);

      if (!root.isConnected) return;

      await openDate(orderDate);

    } catch (error) {
      console.error("[Cola Stock]", error);

      if (root?.isConnected) {
        setStatus(
          error.message || "Ошибка загрузки",
          true
        );
      }
    }

    updateNextButton();

    window.IzakazPageLoading?.hide(
      root
    );
  }

  /* ========================================
     SPA ROUTER
  ======================================== */

  document.addEventListener(
    "app:page-loaded",
    event => {
      if (event.detail?.route === "order-cola") {
        init(document);
      }
    }
  );

  window.IzakazColaStock = {
    init,
    getOrder: () => order,
    getOrderDate: () => orderDate,
    getProducts: () => products,
    getCounts: () => counts,
    flushSaves
  };

})();
