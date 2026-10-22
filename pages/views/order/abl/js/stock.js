
/* ==========================================
   IZAKAZ v0.2.0
   ABL — STOCK MODULE

   Freezer / Cooler / Fresh / Dry

   Supabase:
   - order_products
   - weekly_orders
   - weekly_order_stock_items
   - restaurant_delivery_schedule

   Date synchronization
   Autosave
   Category tabs
   Read-only protection
========================================== */

(function () {
  "use strict";

  const ROOT_ID = "abl-order-page";
  const ROUTE = "order-abl";
  const SAVE_DELAY = 500;

  const CATEGORIES = [
    { key: "freezer", label: "Freezer" },
    { key: "cooler", label: "Cooler" },
    { key: "fresh", label: "Fresh" },
    { key: "dry", label: "Сухой" }
  ];

  let root = null;
  let client = null;

  let restaurantId = null;
  let userId = null;

  let order = null;
  let orderDate = null;
  let requestedDate = null;

  let products = [];
  let stockMap = new Map();

  let activeCategory = "freezer";

  let contextReady = false;
  let ready = false;

  let loadVersion = 0;

  const saveTimers = new Map();
  const saveChains = new Map();
  const saveErrors = new Map();

  /* ==========================================
     HELPERS
  ========================================== */

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&#039;");
  }

  function number(value) {
    const parsed = Number(value);

    return Number.isFinite(parsed)
      ? parsed
      : 0;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat(
      "ru-RU",
      {
        maximumFractionDigits: 4
      }
    ).format(number(value));
  }

  function parseDate(value) {
    if (
      typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
      return null;
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
      return null;
    }

    return date;
  }

  function formatDate(value) {
    const date = parseDate(value);

    if (!date) return "—";

    return new Intl.DateTimeFormat(
      "ru-RU",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "UTC"
      }
    ).format(date);
  }

  function getOrderDay(value) {
    const date = parseDate(value);

    if (!date) return null;

    const weekday = date.getUTCDay();

    if (weekday === 1) return "monday";
    if (weekday === 4) return "thursday";

    return null;
  }

  function getDefaultDate() {
    const today = new Date();

    const weekday = today.getDay();

    const monday =
      (1 - weekday + 7) % 7;

    const thursday =
      (4 - weekday + 7) % 7;

    today.setDate(
      today.getDate() +
      Math.min(monday, thursday)
    );

    const year = today.getFullYear();

    const month = String(
      today.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
      today.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function getClient() {
    const connection =
      window.supabaseClient ||
      (
        typeof supabaseClient !==
        "undefined"
          ? supabaseClient
          : null
      );

    if (!connection) {
      throw new Error(
        "Supabase не подключён."
      );
    }

    return connection;
  }

  function isReadOnly() {
    if (!order) return false;

    return !["counting", "draft"].includes(
      String(order.status || "")
        .toLowerCase()
    );
  }

  function setStatus(
    message,
    type = "info"
  ) {
    const element = root?.querySelector(
      "#abl-stock-status"
    );

    if (!element) return;

    element.textContent = message;
    element.dataset.status = type;
  }

  function setDateStatus(
    message,
    type = "info"
  ) {
    const element = root?.querySelector(
      "#abl-date-status"
    );

    if (!element) return;

    element.textContent = message;
    element.dataset.status = type;
  }

  function getDateField() {
    return root?.querySelector(
      "#abl-order-date"
    );
  }

  function getProduct(productId) {
    return products.find(
      product =>
        String(product.id) ===
        String(productId)
    );
  }

  function getRecord(productId) {
    return stockMap.get(productId) || null;
  }

  function getBaseQuantity(
    product,
    record
  ) {
    if (!product || !record) return 0;

    const total =
      number(record.case_qty) *
        number(product.case_to_base) +
      number(record.slv_qty) *
        number(product.slv_to_base) +
      number(record.pcs_qty) *
        number(product.pcs_to_base);

    return Math.round(total * 1000000) /
      1000000;
  }

  function parseQuantity(value) {
    const raw = String(value ?? "")
      .trim()
      .replace(",", ".");

    if (raw === "") return null;

    const result = Number(raw);

    if (
      !Number.isFinite(result) ||
      result < 0
    ) {
      return undefined;
    }

    return result;
  }

  /* ==========================================
     USER / RESTAURANT
  ========================================== */

  async function loadUserContext() {
    const { data, error } =
      await client.auth.getUser();

    if (error || !data?.user) {
      throw new Error(
        "Не удалось определить пользователя."
      );
    }

    userId = data.user.id;

    const result = await client
      .from("profiles")
      .select("restaurant_id")
      .eq("id", userId)
      .single();

    if (result.error) {
      throw result.error;
    }

    restaurantId =
      result.data?.restaurant_id;

    if (!restaurantId) {
      throw new Error(
        "У пользователя не указан ресторан."
      );
    }
  }

  /* ==========================================
     LOAD PRODUCTS
  ========================================== */

  async function loadProducts() {
    const { data, error } = await client
      .from("order_products")
      .select(`
        id,
        restaurant_id,
        category,
        name,
        iiko_code,
        iiko_unit,
        case_to_base,
        slv_to_base,
        pcs_to_base,
        sort_order,
        delivery_group,
        is_active
      `)
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .in(
        "category",
        CATEGORIES.map(item => item.key)
      )
      .order(
        "sort_order",
        { ascending: true }
      )
      .order(
        "name",
        { ascending: true }
      );

    if (error) throw error;

    products = (data || []).filter(
      product => {
        return (
          CATEGORIES.some(
            category =>
              category.key ===
              product.category
          ) &&
          product.delivery_group !== "cola"
        );
      }
    );

    if (!products.length) {
      throw new Error(
        "Активные товары ABL не найдены."
      );
    }
  }

  /* ==========================================
     FIND OR CREATE ORDER
  ========================================== */

  async function loadOrCreateOrder(date) {
    const orderDay = getOrderDay(date);

    if (!orderDay) {
      throw new Error(
        "Заказ доступен только в ПН и ЧТ."
      );
    }

    const { data, error } = await client
      .from("weekly_orders")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .eq("order_date", date)
      .order(
        "created_at",
        { ascending: false }
      )
      .limit(2);

    if (error) throw error;

    if ((data || []).length > 1) {
      throw new Error(
        "На эту дату найдено несколько заказов. " +
        "Проверьте дубликаты в Supabase."
      );
    }

    if (data?.length === 1) {
      return data[0];
    }

    const created = await client
      .from("weekly_orders")
      .insert({
        restaurant_id: restaurantId,
        order_date: date,
        order_day: orderDay,
        count_date: date,
        same_day_delivery_status: null,
        status: "counting",
        created_by: userId
      })
      .select()
      .single();

    if (created.error) {
      throw created.error;
    }

    return created.data;
  }

  /* ==========================================
     LOAD SAVED STOCK
  ========================================== */

  async function loadSavedStock(orderId) {
    const { data, error } = await client
      .from("weekly_order_stock_items")
      .select(`
        id,
        weekly_order_id,
        product_id,
        case_qty,
        slv_qty,
        pcs_qty,
        base_qty,
        updated_at
      `)
      .eq("weekly_order_id", orderId);

    if (error) throw error;

    return new Map(
      (data || []).map(item => [
        item.product_id,
        item
      ])
    );
  }

  /* ==========================================
     PROGRESS
  ========================================== */

  function isCounted(productId) {
    const record = getRecord(productId);

    if (!record) return false;

    return [
      record.case_qty,
      record.slv_qty,
      record.pcs_qty
    ].some(value =>
      value !== null &&
      value !== undefined
    );
  }

  function getProgress() {
    const total = products.length;

    const counted = products.filter(
      product => isCounted(product.id)
    ).length;

    return {
      total,
      counted,
      complete:
        total > 0 &&
        counted === total
    };
  }

  function updateProgress() {
    if (!root) return;

    const progress = getProgress();

    const total = root.querySelector(
      "#abl-stock-total"
    );

    const counted = root.querySelector(
      "#abl-stock-counted"
    );

    const category = root.querySelector(
      "#abl-current-category"
    );

    if (total) {
      total.textContent = progress.total;
    }

    if (counted) {
      counted.textContent =
        `${progress.counted} / ${progress.total}`;
    }

    if (category) {
      category.textContent =
        CATEGORIES.find(
          item =>
            item.key === activeCategory
        )?.label || activeCategory;
    }

    root.dispatchEvent(
      new CustomEvent(
        "abl:stock-progress",
        {
          detail: {
            ...progress,
            complete:
              progress.complete &&
              ready &&
              !isReadOnly() &&
              saveTimers.size === 0 &&
              saveChains.size === 0 &&
              saveErrors.size === 0
          }
        }
      )
    );
  }

  /* ==========================================
     CATEGORIES
  ========================================== */

  function renderCategories() {
    if (!root) return;

    const container = root.querySelector(
      "#abl-stock-categories"
    );

    if (!container) return;

    container.innerHTML =
      CATEGORIES.map(item => {
        const list = products.filter(
          product =>
            product.category === item.key
        );

        const counted = list.filter(
          product => isCounted(product.id)
        ).length;

        const active =
          activeCategory === item.key;

        return `
          <button
            class="abl-category ${
              active ? "is-active" : ""
            }"
            type="button"
            data-abl-category="${item.key}"
          >
            ${item.label}
            <span class="abl-category-count">
              ${counted}/${list.length}
            </span>
          </button>
        `;
      }).join("");
  }

  /* ==========================================
     INPUTS
  ========================================== */

  function renderInput(
    product,
    field,
    coefficient
  ) {
    if (
      coefficient === null ||
      coefficient === undefined ||
      number(coefficient) <= 0
    ) {
      return `
        <span class="abl-qty-disabled">
          —
        </span>
      `;
    }

    const record = getRecord(product.id);
    const value = record?.[field];

    const disabled =
      !ready || isReadOnly();

    return `
      <input
        class="abl-qty-input"
        type="number"
        min="0"
        step="any"
        inputmode="decimal"
        placeholder="0"
        value="${
          value === null ||
          value === undefined
            ? ""
            : escapeHTML(value)
        }"
        data-abl-product="${
          escapeHTML(product.id)
        }"
        data-abl-field="${field}"
        ${disabled ? "disabled" : ""}
      >
    `;
  }

  /* ==========================================
     PRODUCT LIST
  ========================================== */

  function renderProducts() {
    if (!root) return;

    const tbody = root.querySelector(
      "#abl-stock-products"
    );

    if (!tbody) return;

    const filtered = products.filter(
      product =>
        product.category === activeCategory
    );

    if (!filtered.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7">
            В этой категории нет товаров.
          </td>
        </tr>
      `;

      updateProgress();
      return;
    }

    tbody.innerHTML = filtered.map(
      (product, index) => {
        const record =
          getRecord(product.id);

        const total =
          getBaseQuantity(
            product,
            record
          );

        const counted =
          isCounted(product.id);

        return `
          <tr
            class="${
              counted ? "is-counted" : ""
            }"
            data-abl-stock-row="${
              escapeHTML(product.id)
            }"
          >

            <td>${index + 1}</td>

            <td>
              <strong class="abl-product-name">
                ${escapeHTML(product.name)}
              </strong>

              <span class="abl-product-code">
                IIKO:
                ${escapeHTML(
                  product.iiko_code || "—"
                )}
              </span>
            </td>

            <td>
              ${renderInput(
                product,
                "case_qty",
                product.case_to_base
              )}
            </td>

            <td>
              ${renderInput(
                product,
                "slv_qty",
                product.slv_to_base
              )}
            </td>

            <td>
              ${renderInput(
                product,
                "pcs_qty",
                product.pcs_to_base
              )}

              <small class="abl-product-unit">
                ${escapeHTML(
                  product.iiko_unit || ""
                )}
              </small>
            </td>

            <td>
              <strong
                class="abl-product-total"
                data-abl-total="${
                  escapeHTML(product.id)
                }"
              >
                ${formatNumber(total)}
                ${escapeHTML(
                  product.iiko_unit || ""
                )}
              </strong>
            </td>

            <td>
              ${
                counted
                  ? `<span class="abl-product-counted">✓</span>`
                  : "—"
              }
            </td>

          </tr>
        `;
      }
    ).join("");

    updateProgress();
  }

  /* ==========================================
     SAVE PRODUCT
     Serialized per product
  ========================================== */

  function queueSave(productId) {
    if (
      !ready ||
      isReadOnly() ||
      !order
    ) {
      return Promise.resolve();
    }

    const product = getProduct(productId);
    const record = getRecord(productId);

    if (!product || !record) {
      return Promise.resolve();
    }

    const currentOrderId = order.id;

    const payload = {
      weekly_order_id: currentOrderId,
      product_id: productId,
      case_qty: record.case_qty,
      slv_qty: record.slv_qty,
      pcs_qty: record.pcs_qty,
      base_qty: getBaseQuantity(
        product,
        record
      )
    };

    const previous =
      saveChains.get(productId) ||
      Promise.resolve();

    const task = previous
      .catch(() => {})
      .then(async () => {
        const { error } = await client
          .from("weekly_order_stock_items")
          .upsert(payload, {
            onConflict:
              "weekly_order_id,product_id"
          });

        if (error) throw error;

        saveErrors.delete(productId);
      })
      .catch(error => {
        saveErrors.set(productId, error);

        console.error(
          "[ABL Stock] Save:",
          error
        );

        setStatus(
          "Ошибка сохранения: " +
          error.message,
          "error"
        );

        throw error;
      });

    saveChains.set(productId, task);

    task.finally(() => {
      if (
        saveChains.get(productId) === task
      ) {
        saveChains.delete(productId);
      }

      if (
        saveErrors.size === 0 &&
        saveChains.size === 0 &&
        saveTimers.size === 0
      ) {
        setStatus(
          "Остатки сохранены",
          "saved"
        );
      }

      updateProgress();
    }).catch(() => {});

    return task;
  }

  /* ==========================================
     DEBOUNCE AUTOSAVE
  ========================================== */

  function scheduleSave(productId) {
    const existing =
      saveTimers.get(productId);

    if (existing) {
      clearTimeout(existing);
    }

    saveErrors.delete(productId);

    setStatus(
      "Есть несохранённые изменения",
      "saving"
    );

    const timer = setTimeout(() => {
      saveTimers.delete(productId);

      queueSave(productId)
        .catch(() => {});
    }, SAVE_DELAY);

    saveTimers.set(productId, timer);

    updateProgress();
  }

  /* ==========================================
     FLUSH SAVES
  ========================================== */

  async function flushSaves() {
    const pendingIds = Array.from(
      saveTimers.keys()
    );

    for (const productId of pendingIds) {
      clearTimeout(
        saveTimers.get(productId)
      );

      saveTimers.delete(productId);

      queueSave(productId)
        .catch(() => {});
    }

    while (saveChains.size > 0) {
      const tasks = Array.from(
        saveChains.values()
      );

      await Promise.allSettled(tasks);
    }

    if (saveErrors.size > 0) {
      const error =
        saveErrors.values().next().value;

      throw error;
    }

    updateProgress();
  }

  /* ==========================================
     UPDATE QUANTITY
  ========================================== */

  function changeQuantity(input) {
    if (!ready || isReadOnly()) {
      return;
    }

    const productId =
      input.dataset.ablProduct;

    const field =
      input.dataset.ablField;

    if (
      ![
        "case_qty",
        "slv_qty",
        "pcs_qty"
      ].includes(field)
    ) {
      return;
    }

    const product =
      getProduct(productId);

    if (!product) return;

    const value =
      parseQuantity(input.value);

    if (value === undefined) {
      input.classList.add(
        "is-invalid"
      );

      setStatus(
        "Введите число не меньше 0",
        "error"
      );

      return;
    }

    input.classList.remove(
      "is-invalid"
    );

    const previous =
      getRecord(productId) || {
        product_id: productId,
        case_qty: null,
        slv_qty: null,
        pcs_qty: null,
        base_qty: 0
      };

    const updated = {
      ...previous,
      [field]: value
    };

    updated.base_qty =
      getBaseQuantity(
        product,
        updated
      );

    stockMap.set(
      productId,
      updated
    );

    const row = input.closest(
      "[data-abl-stock-row]"
    );

    if (row) {
      row.classList.toggle(
        "is-counted",
        isCounted(productId)
      );

      const total = row.querySelector(
        "[data-abl-total]"
      );

      if (total) {
        total.textContent =
          formatNumber(
            updated.base_qty
          ) + " " +
          (product.iiko_unit || "");
      }

      const lastCell =
        row.lastElementChild;

      if (lastCell) {
        lastCell.innerHTML =
          isCounted(productId)
            ? `<span class="abl-product-counted">✓</span>`
            : "—";
      }
    }

    renderCategories();
    scheduleSave(productId);
  }

  /* ==========================================
     DELIVERY SCHEDULE
  ========================================== */

  async function loadDeliveryPlan(date) {
    const { data, error } = await client
      .from(
        "restaurant_delivery_schedule"
      )
      .select(`
        weekday,
        source_order_day,
        delivery_group,
        is_active
      `)
      .eq(
        "restaurant_id",
        restaurantId
      )
      .eq(
        "delivery_group",
        "general"
      )
      .eq(
        "is_active",
        true
      );

    if (error) throw error;

    const orderDay =
      getOrderDay(date);

    const rows = (data || [])
      .filter(
        item =>
          item.source_order_day ===
          orderDay
      );

    const dayLabels = {
      1: "ПН",
      2: "ВТ",
      3: "СР",
      4: "ЧТ",
      5: "ПТ",
      6: "СБ",
      7: "ВС"
    };

    const days = rows
      .map(
        item =>
          dayLabels[
            Number(item.weekday)
          ] || "—"
      )
      .join(", ");

    return days
      ? `Заказ: ${formatDate(date)} · Поставки: ${days}`
      : `Заказ: ${formatDate(date)} · График не настроен`;
  }

  /* ==========================================
     LOAD SELECTED DATE
  ========================================== */

  async function openDate(date) {
    if (!root || !contextReady) {
      requestedDate = date;
      return;
    }

    if (!getOrderDay(date)) {
      setDateStatus(
        "Выберите понедельник или четверг",
        "error"
      );

      return;
    }

    requestedDate = date;

    const version = ++loadVersion;
    const selectedRoot = root;

    ready = false;

    setDateStatus(
      "Загрузка заказа...",
      "loading"
    );

    setStatus(
      "Загрузка остатков...",
      "info"
    );

    const planElement = root.querySelector(
      "#abl-delivery-plan"
    );

    if (planElement) {
      planElement.textContent =
        "Загрузка графика поставок...";
    }

    try {
      // Сохраняем остатки старого заказа.
      await flushSaves();

      if (
        version !== loadVersion ||
        selectedRoot !== root
      ) {
        return;
      }

      const nextOrder =
        await loadOrCreateOrder(date);

      if (
        version !== loadVersion ||
        selectedRoot !== root
      ) {
        return;
      }

      const [nextStock, nextPlan] =
        await Promise.all([
          loadSavedStock(nextOrder.id),
          loadDeliveryPlan(date)
        ]);

      if (
        version !== loadVersion ||
        selectedRoot !== root ||
        requestedDate !== date ||
        getDateField()?.value !== date
      ) {
        return;
      }

      // Коммитим новую дату только после
      // успешной загрузки всех данных.
      order = nextOrder;
      orderDate = date;
      stockMap = nextStock;

      ready = !isReadOnly();

      renderCategories();
      renderProducts();

      if (planElement) {
        planElement.textContent =
          nextPlan;
      }

      setStatus(
        ready
          ? "Остатки загружены"
          : "Заказ закрыт для редактирования",
        ready ? "saved" : "info"
      );

      root.dispatchEvent(
        new CustomEvent(
          "abl:order-loaded",
          {
            detail: {
              order: { ...order },
              orderDate: date
            }
          }
        )
      );

      updateProgress();

    } catch (error) {
      if (
        version !== loadVersion ||
        selectedRoot !== root
      ) {
        return;
      }

      ready = false;

      console.error(
        "[ABL Stock] Open date:",
        error
      );

      setStatus(
        error.message ||
        "Ошибка загрузки заказа",
        "error"
      );

      root.dispatchEvent(
        new CustomEvent(
          "abl:order-error",
          {
            detail: {
              orderDate: date,
              message:
                error.message ||
                "Ошибка загрузки заказа"
            }
          }
        )
      );
    }
  }

  /* ==========================================
     EVENTS
  ========================================== */

  function bindEvents() {
    root.addEventListener(
      "click",
      event => {
        const button =
          event.target.closest(
            "[data-abl-category]"
          );

        if (
          !button ||
          !root.contains(button)
        ) {
          return;
        }

        activeCategory =
          button.dataset.ablCategory;

        renderCategories();
        renderProducts();
      }
    );

    root.addEventListener(
      "input",
      event => {
        const input =
          event.target.closest(
            "[data-abl-product]"
          );

        if (
          !input ||
          !root.contains(input)
        ) {
          return;
        }

        changeQuantity(input);
      }
    );

    root.addEventListener(
      "abl:date-changed",
      event => {
        const date =
          event.detail?.orderDate;

        if (!date) return;

        requestedDate = date;

        if (contextReady) {
          openDate(date);
        }
      }
    );
  }

  /* ==========================================
     INIT
  ========================================== */

  async function init(container) {
    const nextRoot =
      container?.querySelector(
        "#" + ROOT_ID
      ) ||
      document.getElementById(ROOT_ID);

    if (!nextRoot) return;

    if (
      nextRoot.dataset
        .ablStockInitialized === "true"
    ) {
      return;
    }

    root = nextRoot;

    root.dataset.ablStockInitialized =
      "true";

    window.IzakazPageLoading?.show(
      root,
      "Загрузка заказа ABL…"
    );

    client = getClient();

    contextReady = false;
    ready = false;

    order = null;
    orderDate = null;
    requestedDate = null;

    products = [];
    stockMap = new Map();

    activeCategory = "freezer";

    bindEvents();

    try {
      await loadUserContext();
      await loadProducts();

      contextReady = true;

      const field = getDateField();

      const date =
        field?.value ||
        requestedDate ||
        window.AblOrder
          ?.getOrderDate?.() ||
        getDefaultDate();

      if (field) {
        field.value = date;
      }

      await openDate(date);

    } catch (error) {
      console.error(
        "[ABL Stock] Init:",
        error
      );

      setStatus(
        error.message ||
        "Ошибка инициализации",
        "error"
      );

      root.dispatchEvent(
        new CustomEvent(
          "abl:order-error",
          {
            detail: {
              orderDate:
                getDateField()?.value,
              message:
                error.message ||
                "Ошибка инициализации"
            }
          }
        )
      );
    }

    window.IzakazPageLoading?.hide(
      root
    );
  }

  /* ==========================================
     ROUTE
  ========================================== */

  document.addEventListener(
    "app:page-loaded",
    event => {
      if (
        event.detail?.route !== ROUTE
      ) {
        return;
      }

      init(
        document.getElementById(
          "page-container"
        )
      );
    }
  );

  /* ==========================================
     PUBLIC API
  ========================================== */

  window.IzakazAblStock = {
    init,
    flushSaves,

    getOrder() {
      return order;
    },

    getOrderDate() {
      return orderDate;
    },

    getProducts() {
      return [...products];
    },

    getStock(productId) {
      return getRecord(productId);
    },

    getProgress,

    isReady() {
      return ready;
    },

    isReadOnly
  };

})();
