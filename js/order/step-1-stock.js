/* =====================================================
   I’M | ЗАКАЗ
   STEP 1 — ФАКТИЧЕСКИЕ ОСТАТКИ

   - ПН / ЧТ
   - график поставок ресторана
   - машина приехала / еще не приехала
   - фактический подсчет
   - case / slv / кг-л-шт
   - итоговый остаток
   - autosave
   - progress
   - добавление / изменение товаров
   - Fresh lots integration
===================================================== */

(function () {
  "use strict";


  /* =====================================================
     CONFIG
  ===================================================== */

  const CATEGORY_NAMES = {
    cola: "Cola",
    fresh: "Fresh",
    freezer: "Freezer",
    cooler: "Cooler",
    dry: "Сухой",
    chemistry: "Химия",
    household: "Хоз. товары",
    other: "Другое"
  };


  const ORDER_DAYS = {

    monday: {
      weekday: 1,
      label: "Понедельник",
      short: "ПН"
    },

    thursday: {
      weekday: 4,
      label: "Четверг",
      short: "ЧТ"
    }

  };


  const SAVE_DELAY = 500;


  /* =====================================================
     STATE
  ===================================================== */

  let root = null;

  let appContext = null;

  let restaurantId = null;

  let userId = null;

  let weeklyOrder = null;

  let selectedOrderDay = "monday";

  let currentCategory = "cola";

  let productSearch = "";

  let products = [];

  let deliverySchedule = new Map();

  let stockMap = new Map();

  let saveTimers = new Map();

  let dirtyProducts = new Set();

  let editVersions = new Map();

  let activeSaves = 0;


  /* =====================================================
     HELPERS
  ===================================================== */

  function escapeHTML(value) {

    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  }


  function normalizeDecimal(value) {

    return String(value ?? "")
      .trim()
      .replace(",", ".");

  }


  function toNullableNumber(value) {

    const raw =
      normalizeDecimal(value);


    if (raw === "") {
      return null;
    }


    const number =
      Number(raw);


    if (
      !Number.isFinite(number) ||
      number < 0
    ) {
      return null;
    }


    return number;

  }


  function formatNumber(value) {

    const number =
      Number(value || 0);


    return new Intl.NumberFormat(
      "ru-RU",
      {
        maximumFractionDigits: 4
      }
    ).format(number);

  }


  function formatInputValue(value) {

    if (
      value === null ||
      value === undefined
    ) {
      return "";
    }


    return String(value);

  }


  function getTodayString() {

    return dateToYMD(
      new Date()
    );

  }


  function dateToYMD(date) {

    const year =
      date.getFullYear();


    const month =
      String(
        date.getMonth() + 1
      ).padStart(2, "0");


    const day =
      String(
        date.getDate()
      ).padStart(2, "0");


    return `${year}-${month}-${day}`;

  }


  function formatOrderDate(dateString) {

    if (!dateString) {
      return "—";
    }


    const date =
      new Date(
        `${dateString}T00:00:00`
      );


    return new Intl.DateTimeFormat(
      "ru-RU",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }
    ).format(date);

  }


  function getProductsWord(count) {

    const mod100 =
      count % 100;


    const mod10 =
      count % 10;


    if (
      mod100 >= 11 &&
      mod100 <= 14
    ) {
      return "товаров";
    }


    if (mod10 === 1) {
      return "товар";
    }


    if (
      mod10 >= 2 &&
      mod10 <= 4
    ) {
      return "товара";
    }


    return "товаров";

  }


  function getCurrentIsoWeekday() {

    const day =
      new Date().getDay();


    return (
      day === 0
        ? 7
        : day
    );

  }


  function getDefaultOrderDay() {

    const weekday =
      getCurrentIsoWeekday();


    if (weekday === 1) {
      return "monday";
    }


    if (weekday === 4) {
      return "thursday";
    }


    if (
      weekday === 2 ||
      weekday === 3
    ) {
      return "thursday";
    }


    return "monday";

  }


  function getOrderDateForDay(orderDay) {

    const config =
      ORDER_DAYS[orderDay];


    if (!config) {
      return getTodayString();
    }


    const today =
      new Date();


    today.setHours(
      0,
      0,
      0,
      0
    );


    const currentWeekday =
      today.getDay() === 0
        ? 7
        : today.getDay();


    let difference =
      config.weekday -
      currentWeekday;


    if (difference < 0) {
      difference += 7;
    }


    const result =
      new Date(today);


    result.setDate(
      result.getDate() +
      difference
    );


    return dateToYMD(
      result
    );

  }


  /* =====================================================
     USER / RESTAURANT
  ===================================================== */

  async function loadUserContext() {

    const {
      data: userData,
      error: userError
    } =
      await supabaseClient
        .auth
        .getUser();


    if (
      userError ||
      !userData?.user
    ) {

      throw new Error(
        "Не удалось определить пользователя."
      );

    }


    userId =
      userData.user.id;


    const {
      data: profile,
      error: profileError
    } =
      await supabaseClient

        .from("profiles")

        .select(`
          restaurant_id,
          restaurant:restaurants (
            id
          )
        `)

        .eq(
          "id",
          userId
        )

        .single();


    if (profileError) {
      throw profileError;
    }


    restaurantId =

      profile?.restaurant_id ||

      profile?.restaurant?.id;


    if (!restaurantId) {

      throw new Error(
        "У пользователя не указан ресторан."
      );

    }

  }


  /* =====================================================
     DELIVERY SCHEDULE
  ===================================================== */

  async function loadDeliverySchedule() {

    const {
      data,
      error
    } =
      await supabaseClient

        .from(
          "restaurant_delivery_schedule"
        )

        .select(`
          delivery_group,
          weekday,
          source_order_day,
          is_active
        `)

        .eq(
          "restaurant_id",
          restaurantId
        )

        /*
          STEP 1 использует только
          основной график поставок.

          Cola рассчитывается отдельно
          в STEP 3.
        */
        .eq(
          "delivery_group",
          "general"
        )

        .order(
          "weekday",
          {
            ascending: true
          }
        );


    if (error) {
      throw error;
    }


    deliverySchedule =
      new Map();


    (data || [])
      .forEach(
        function (item) {

          deliverySchedule.set(
            Number(
              item.weekday
            ),
            item
          );

        }
      );

  }


  function getSameDayDelivery() {

    const config =
      ORDER_DAYS[
        selectedOrderDay
      ];


    if (!config) {
      return null;
    }


    const item =
      deliverySchedule.get(
        config.weekday
      );


    if (
      !item ||
      !item.is_active
    ) {

      return null;

    }


    return item;

  }


  function requiresDeliveryStatus() {

    return Boolean(
      getSameDayDelivery()
    );

  }


  function deliveryStatusIsReady() {

    if (
      !requiresDeliveryStatus()
    ) {

      return true;

    }


    return (

      weeklyOrder
        ?.same_day_delivery_status ===
        "arrived"

      ||

      weeklyOrder
        ?.same_day_delivery_status ===
        "pending"

    );

  }


  /* =====================================================
     ORDER SESSION
  ===================================================== */

  async function normalizeWeeklyOrder(order) {

    const patch = {};

    const sameDayDelivery =
      getSameDayDelivery();


    if (
      order.order_day !==
      selectedOrderDay
    ) {

      patch.order_day =
        selectedOrderDay;

    }


    if (
      !sameDayDelivery &&
      order.same_day_delivery_status !==
        "none"
    ) {

      patch.same_day_delivery_status =
        "none";

    }


    if (
      sameDayDelivery &&
      order.same_day_delivery_status ===
        "none"
    ) {

      patch.same_day_delivery_status =
        null;

    }


    if (
      order.count_date !==
      order.order_date
    ) {

      patch.count_date =
        order.order_date;

    }


    if (
      Object.keys(
        patch
      ).length === 0
    ) {

      return order;

    }


    const {
      data,
      error
    } =
      await supabaseClient

        .from("weekly_orders")

        .update(
          patch
        )

        .eq(
          "id",
          order.id
        )

        .select()

        .single();


    if (error) {
      throw error;
    }


    return data;

  }


  async function ensureWeeklyOrder() {

    const orderDate =
      getOrderDateForDay(
        selectedOrderDay
      );


    const {
      data,
      error
    } =
      await supabaseClient

        .from("weekly_orders")

        .select(`
          id,
          restaurant_id,
          order_date,
          order_day,
          count_date,
          same_day_delivery_status,
          status,
          created_by,
          created_at,
          updated_at
        `)

        .eq(
          "restaurant_id",
          restaurantId
        )

        .eq(
          "order_date",
          orderDate
        )

        .maybeSingle();


    if (error) {
      throw error;
    }


    if (data) {

      weeklyOrder =
        await normalizeWeeklyOrder(
          data
        );


      updateOrderHeader();

      return;

    }


    const sameDayDelivery =
      getSameDayDelivery();


    const insertPayload = {

      restaurant_id:
        restaurantId,

      order_date:
        orderDate,

      order_day:
        selectedOrderDay,

      count_date:
        orderDate,

      same_day_delivery_status:
        sameDayDelivery
          ? null
          : "none",

      status:
        "counting",

      created_by:
        userId

    };


    const {
      data: created,
      error: createError
    } =
      await supabaseClient

        .from("weekly_orders")

        .insert(
          insertPayload
        )

        .select()

        .single();


    if (
      createError &&
      createError.code ===
        "23505"
    ) {

      const {
        data: retryData,
        error: retryError
      } =
        await supabaseClient

          .from("weekly_orders")

          .select("*")

          .eq(
            "restaurant_id",
            restaurantId
          )

          .eq(
            "order_date",
            orderDate
          )

          .single();


      if (retryError) {
        throw retryError;
      }


      weeklyOrder =
        await normalizeWeeklyOrder(
          retryData
        );

    }

    else if (createError) {

      throw createError;

    }

    else {

      weeklyOrder =
        created;

    }


    updateOrderHeader();

  }


  /* =====================================================
     ORDER HEADER
  ===================================================== */

  function updateOrderHeader() {

    if (
      !root ||
      !weeklyOrder
    ) {
      return;
    }


    root
      .querySelectorAll(
        "[data-stock-order-day]"
      )

      .forEach(
        function (button) {

          button.classList.toggle(
            "is-active",

            button.dataset
              .stockOrderDay ===
              selectedOrderDay
          );

        }
      );


    const dateElement =
      root.querySelector(
        "#stock-order-date"
      );


    if (dateElement) {

      dateElement.textContent =
        formatOrderDate(
          weeklyOrder.order_date
        );

    }


    const dayElement =
      root.querySelector(
        "#stock-order-date-day"
      );


    if (dayElement) {

      dayElement.textContent =
        ORDER_DAYS[
          selectedOrderDay
        ]?.label ||
        "—";

    }


    updateSameDayDeliveryUI();

  }


  function updateSameDayDeliveryUI() {

    if (!root) {
      return;
    }


    const delivery =
      getSameDayDelivery();


    const panel =
      root.querySelector(
        "#stock-same-day-delivery"
      );


    const noDelivery =
      root.querySelector(
        "#stock-no-same-day-delivery"
      );


    if (
      !panel ||
      !noDelivery
    ) {
      return;
    }


    if (delivery) {

      panel.hidden =
        false;


      noDelivery.hidden =
        true;


      const title =
        root.querySelector(
          "#stock-same-day-delivery-title"
        );


      if (title) {

        title.textContent =
          `${
            ORDER_DAYS[
              selectedOrderDay
            ].label
          }: по графику есть поставка`;

      }


      root
        .querySelectorAll(
          "[data-stock-delivery-status]"
        )

        .forEach(
          function (button) {

            button.classList.toggle(
              "is-active",

              button.dataset
                .stockDeliveryStatus ===
                weeklyOrder
                  ?.same_day_delivery_status
            );

          }
        );

    }

    else {

      panel.hidden =
        true;


      noDelivery.hidden =
        false;

    }

  }


  /* =====================================================
     PRODUCTS
  ===================================================== */

  async function loadProducts() {

    const {
      data,
      error
    } =
      await supabaseClient

        .from("order_products")

        .select(`
          id,
          category,
          name,
          iiko_code,
          iiko_name,
          iiko_unit,
          case_to_base,
          slv_to_base,
          pcs_to_base,
          safety_stock,
          delivery_group,
          sort_order,
          is_active
        `)

        .eq(
          "restaurant_id",
          restaurantId
        )

        .eq(
          "is_active",
          true
        )

        .order(
          "category"
        )

        .order(
          "sort_order"
        )

        .order(
          "name"
        );


    if (error) {
      throw error;
    }


    products =
      data || [];

  }


  /* =====================================================
     SAVED STOCK
  ===================================================== */

  async function loadStock() {

    if (!weeklyOrder) {

      stockMap =
        new Map();

      return;

    }


    const {
      data,
      error
    } =
      await supabaseClient

        .from(
          "weekly_order_stock_items"
        )

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

        .eq(
          "weekly_order_id",
          weeklyOrder.id
        );


    if (error) {
      throw error;
    }


    stockMap =
      new Map();


    (data || [])
      .forEach(
        function (item) {

          stockMap.set(
            item.product_id,
            item
          );

        }
      );

  }


  /* =====================================================
     FRESH LOTS INTEGRATION
  ===================================================== */

  async function initFreshLots() {

    const moduleObject =
      window.OrderStep1FreshLots;


    if (
      !moduleObject ||
      typeof moduleObject.init !==
        "function"
    ) {

      throw new Error(
        "Модуль Fresh Lots не загружен."
      );

    }


    await moduleObject.init({

      root,

      getWeeklyOrder:
        function () {

          return weeklyOrder;

        },

      getProducts:
        function () {

          return products;

        },

      getStockRecord:
        function (productId) {

          return getStockRecord(
            productId
          );

        },

      calculateBaseQty:
        function (
          product,
          record
        ) {

          return calculateBaseQty(
            product,
            record
          );

        },

      formatNumber,

      onValidationChange:
        function () {

          updateProgress();

        }

    });

  }


  async function refreshFreshLots() {

    const moduleObject =
      window.OrderStep1FreshLots;


    if (
      moduleObject &&
      typeof moduleObject.refresh ===
        "function"
    ) {

      await moduleObject.refresh();

    }

  }


  function renderFreshLots() {

    const moduleObject =
      window.OrderStep1FreshLots;


    if (
      moduleObject &&
      typeof moduleObject.afterRender ===
        "function"
    ) {

      moduleObject.afterRender();

    }

  }


  function freshLotsIsReady() {

    const moduleObject =
      window.OrderStep1FreshLots;


    if (
      !moduleObject ||
      typeof moduleObject.isReady !==
        "function"
    ) {

      return true;

    }


    return moduleObject.isReady();

  }

  async function flushFreshLots() {

    const moduleObject =
      window.OrderStep1FreshLots;


    if (
      moduleObject &&
      typeof moduleObject.flushAllSaves ===
        "function"
    ) {

      await moduleObject.flushAllSaves();

    }

  }


  function notifyFreshStockChanged(
    productId
  ) {

    const moduleObject =
      window.OrderStep1FreshLots;


    if (
      moduleObject &&
      typeof moduleObject.onStockChanged ===
        "function"
    ) {

      moduleObject.onStockChanged(
        productId
      );

    }

  }


  /* =====================================================
     COUNT LOGIC
  ===================================================== */

  function getStockRecord(productId) {

    return (
      stockMap.get(productId) ||
      {
        product_id:
          productId,

        case_qty:
          null,

        slv_qty:
          null,

        pcs_qty:
          null,

        base_qty:
          0
      }
    );

  }


  function isCountedRecord(record) {

    return (

      record.case_qty !== null ||

      record.slv_qty !== null ||

      record.pcs_qty !== null

    );

  }


  function calculateBaseQty(
    product,
    record
  ) {

    const caseQty =
      Number(
        record.case_qty || 0
      );


    const slvQty =
      Number(
        record.slv_qty || 0
      );


    const pcsQty =
      Number(
        record.pcs_qty || 0
      );


    const caseSize =
      Number(
        product.case_to_base || 0
      );


    const slvSize =
      Number(
        product.slv_to_base || 0
      );


    const pcsSize =
      Number(
        product.pcs_to_base || 0
      );


    return (

      caseQty * caseSize +

      slvQty * slvSize +

      pcsQty * pcsSize

    );

  }


  /* =====================================================
     PACKAGING TEXT
  ===================================================== */

  function getPackagingText(product) {

    const parts = [];


    if (
      product.case_to_base !== null &&
      product.case_to_base !== undefined
    ) {

      parts.push(
        `case ${formatNumber(
          product.case_to_base
        )}`
      );

    }


    if (
      product.slv_to_base !== null &&
      product.slv_to_base !== undefined
    ) {

      parts.push(
        `slv ${formatNumber(
          product.slv_to_base
        )}`
      );

    }


    parts.push(
      `ед. ${product.iiko_unit}`
    );


    return parts.join(" · ");

  }


  /* =====================================================
     RENDER COUNT INPUT
  ===================================================== */

  function renderCountInput(
    product,
    type,
    coefficient
  ) {

    if (
      coefficient === null ||
      coefficient === undefined
    ) {

      return `
        <td class="stock-count-disabled">
          —
        </td>
      `;

    }


    const record =
      getStockRecord(
        product.id
      );


    const key =
      `${type}_qty`;


    return `
      <td class="stock-count-cell">

        <input
          class="stock-count-input"
          type="number"
          min="0"
          step="0.01"
          inputmode="decimal"
          placeholder="0"
          value="${escapeHTML(
            formatInputValue(
              record[key]
            )
          )}"
          data-stock-input
          data-product-id="${escapeHTML(
            product.id
          )}"
          data-count-type="${escapeHTML(
            type
          )}"
        >

      </td>
    `;

  }


  function renderBaseInput(product) {

    const record =
      getStockRecord(
        product.id
      );


    return `
      <td class="stock-count-cell">

        <div class="stock-unit-count-wrap">

          <input
            class="stock-count-input"
            type="number"
            min="0"
            step="0.01"
            inputmode="decimal"
            placeholder="0"
            value="${escapeHTML(
              formatInputValue(
                record.pcs_qty
              )
            )}"
            data-stock-input
            data-product-id="${escapeHTML(
              product.id
            )}"
            data-count-type="pcs"
          >

          <span class="stock-count-unit">
            ${escapeHTML(
              product.iiko_unit
            )}
          </span>

        </div>

      </td>
    `;

  }


  /* =====================================================
     RENDER PRODUCTS
  ===================================================== */

  function renderProducts() {

    const tbody =
      root.querySelector(
        "#stock-products-body"
      );


    if (!tbody) {
      return;
    }


    const search =
  productSearch
    .trim()
    .toLowerCase();


const categoryProducts =
  products.filter(
    function (product) {

      if (
        product.category !==
        currentCategory
      ) {
        return false;
      }


      if (!search) {
        return true;
      }


      const name =
        String(
          product.name || ""
        ).toLowerCase();


      const iikoCode =
        String(
          product.iiko_code || ""
        ).toLowerCase();


      const iikoName =
        String(
          product.iiko_name || ""
        ).toLowerCase();


      return (
        name.includes(search) ||
        iikoCode.includes(search) ||
        iikoName.includes(search)
      );

    }
  );


    const categoryTitle =
      root.querySelector(
        "#stock-current-category"
      );


    if (categoryTitle) {

      categoryTitle.textContent =
        CATEGORY_NAMES[
          currentCategory
        ] ||
        currentCategory;

    }


    const productCount =
      root.querySelector(
        "#stock-product-count"
      );


    if (productCount) {

      productCount.textContent =
        `${categoryProducts.length} ${getProductsWord(
          categoryProducts.length
        )}`;

    }


    if (!categoryProducts.length) {

  tbody.innerHTML = `
    <tr class="stock-empty-row">

      <td colspan="6">

        <div class="stock-empty">

          <strong>
            ${
              productSearch
                ? "Товар не найден"
                : "В этой категории пока нет товаров"
            }
          </strong>

          <p>
            ${
              productSearch
                ? "Попробуйте изменить поисковый запрос."
                : "Используйте кнопку «Добавить товар»."
            }
          </p>

        </div>

      </td>

    </tr>
  `;


      updateProgress();


      renderFreshLots();


      return;

    }


    tbody.innerHTML =
      categoryProducts

        .map(
          function (
            product,
            index
          ) {

            const record =
              getStockRecord(
                product.id
              );


            const baseQty =
              calculateBaseQty(
                product,
                record
              );


            record.base_qty =
              baseQty;


            const counted =
              isCountedRecord(
                record
              );


            const safety =
              Number(
                product.safety_stock || 0
              );


            return `
              <tr
                class="
                  stock-product-row
                  ${
                    counted
                      ? "is-counted"
                      : ""
                  }
                "
                data-stock-row="${escapeHTML(
                  product.id
                )}"
              >

                <td class="stock-number-cell">
                  ${index + 1}
                </td>


                <td>

                  <div class="stock-product-main">

                    <strong>
                      ${escapeHTML(
                        product.name
                      )}
                    </strong>


                    <button
                      class="stock-edit-button"
                      type="button"
                      data-stock-edit="${escapeHTML(
                        product.id
                      )}"
                    >
                      Изменить
                    </button>

                  </div>


                  <div class="stock-product-meta">

                    <span class="stock-iiko-status">
                      IIKO ✓
                      ${escapeHTML(
                        product.iiko_code
                      )}
                    </span>


                    ${
                      product.iiko_name

                        ? `
                          <span>
                            ${escapeHTML(
                              product.iiko_name
                            )}
                          </span>
                        `

                        : ""
                    }

                  </div>


                  <div class="stock-product-package">

                    <span>
                      ${escapeHTML(
                        getPackagingText(
                          product
                        )
                      )}
                    </span>


                    ${
                      safety > 0

                        ? `
                          <span class="stock-safety-badge">

                            Запас +

                            ${escapeHTML(
                              formatNumber(
                                safety
                              )
                            )}

                            ${escapeHTML(
                              product.iiko_unit
                            )}

                          </span>
                        `

                        : ""
                    }

                  </div>


                  <div class="stock-product-tools">

                    <button
                      class="stock-zero-button"
                      type="button"
                      data-stock-zero="${escapeHTML(
                        product.id
                      )}"
                    >
                      Нет остатка
                    </button>

                  </div>

                </td>


                ${renderCountInput(
                  product,
                  "case",
                  product.case_to_base
                )}


                ${renderCountInput(
                  product,
                  "slv",
                  product.slv_to_base
                )}


                ${renderBaseInput(
                  product
                )}


                <td class="stock-total-cell">

                  <div class="stock-total-value">

                    <span
                      class="stock-total-number"
                      data-stock-total="${escapeHTML(
                        product.id
                      )}"
                    >
                      ${escapeHTML(
                        formatNumber(
                          baseQty
                        )
                      )}
                    </span>

                    <span class="stock-total-unit">
                      ${escapeHTML(
                        product.iiko_unit
                      )}
                    </span>

                  </div>

                </td>

              </tr>
            `;

          }
        )

        .join("");


    updateProgress();


    renderFreshLots();

  }


  /* =====================================================
     PROGRESS
  ===================================================== */

  function updateProgress() {

    const counted =
      products.filter(
        function (product) {

          return isCountedRecord(
            getStockRecord(
              product.id
            )
          );

        }
      ).length;


    const total =
      products.length;


    const progress =
      root.querySelector(
        "#stock-progress-value"
      );


    if (progress) {

      progress.textContent =
        `${counted} / ${total}`;

    }


    root
      .querySelectorAll(
        ".stock-category"
      )

      .forEach(
        function (button) {

          const category =
            button.dataset.category;


          const categoryProducts =
            products.filter(
              function (product) {

                return (
                  product.category ===
                  category
                );

              }
            );


          const categoryCounted =
            categoryProducts.filter(
              function (product) {

                return isCountedRecord(
                  getStockRecord(
                    product.id
                  )
                );

              }
            ).length;


          button.classList.toggle(
            "is-complete",

            categoryProducts.length > 0 &&

            categoryCounted ===
              categoryProducts.length
          );

        }
      );


    const nextButton =
      root.querySelector(
        "#stock-next-button"
      );


    if (nextButton) {

      /*
        Теперь неполный подсчет
        не блокирует кнопку "Далее".

        Проверка непросчитанных товаров
        выполняется после нажатия.
      */

      nextButton.disabled = !(
        total > 0 &&
        deliveryStatusIsReady()
      );

    }

  }


  /* =====================================================
     LOCAL COUNT CHANGE
  ===================================================== */

  function updateLocalCount(
    productId,
    type,
    value
  ) {

    const product =
      products.find(
        function (item) {

          return (
            item.id ===
            productId
          );

        }
      );


    if (!product) {
      return;
    }


    const record = {
      ...getStockRecord(
        productId
      )
    };


    record[
      `${type}_qty`
    ] =
      toNullableNumber(
        value
      );


    record.base_qty =
      calculateBaseQty(
        product,
        record
      );


    stockMap.set(
      productId,
      record
    );


    const version =
      (
        editVersions.get(
          productId
        ) || 0
      ) + 1;


    editVersions.set(
      productId,
      version
    );


    dirtyProducts.add(
      productId
    );


    updateVisibleRow(
      productId
    );


    notifyFreshStockChanged(
      productId
    );


    updateProgress();


    scheduleSave(
      productId
    );

  }


  function updateVisibleRow(productId) {

    const product =
      products.find(
        function (item) {

          return (
            item.id ===
            productId
          );

        }
      );


    if (!product) {
      return;
    }


    const record =
      getStockRecord(
        productId
      );


    const row =
      root.querySelector(
        `[data-stock-row="${productId}"]`
      );


    if (row) {

      row.classList.toggle(
        "is-counted",
        isCountedRecord(
          record
        )
      );

    }


    const total =
      root.querySelector(
        `[data-stock-total="${productId}"]`
      );


    if (total) {

      total.textContent =
        formatNumber(
          calculateBaseQty(
            product,
            record
          )
        );

    }

  }


  /* =====================================================
     ZERO STOCK
  ===================================================== */

  function setZeroStock(productId) {

    const product =
      products.find(
        function (item) {

          return (
            item.id ===
            productId
          );

        }
      );


    if (!product) {
      return;
    }


    const record = {
      ...getStockRecord(
        productId
      )
    };


    record.case_qty =

      product.case_to_base !== null &&
      product.case_to_base !== undefined

        ? 0

        : null;


    record.slv_qty =

      product.slv_to_base !== null &&
      product.slv_to_base !== undefined

        ? 0

        : null;


    record.pcs_qty =
      0;


    record.base_qty =
      0;


    stockMap.set(
      productId,
      record
    );


    const version =
      (
        editVersions.get(
          productId
        ) || 0
      ) + 1;


    editVersions.set(
      productId,
      version
    );


    dirtyProducts.add(
      productId
    );


    const row =
      root.querySelector(
        `[data-stock-row="${productId}"]`
      );


    row
      ?.querySelectorAll(
        "[data-stock-input]"
      )

      .forEach(
        function (input) {

          input.value =
            "0";

        }
      );


    updateVisibleRow(
      productId
    );


    notifyFreshStockChanged(
      productId
    );


    updateProgress();


    saveImmediately(
      productId
    );

  }


  /* =====================================================
     SAVE STATUS
  ===================================================== */

  function setSaveStatus(
    type,
    text
  ) {

    const status =
      root?.querySelector(
        "#stock-save-status"
      );


    const statusText =
      root?.querySelector(
        "#stock-save-status-text"
      );


    if (
      !status ||
      !statusText
    ) {
      return;
    }


    status.className =
      "stock-save-status";


    if (type) {

      status.classList.add(
        `is-${type}`
      );

    }


    statusText.textContent =
      text;

  }


  /* =====================================================
     AUTOSAVE
  ===================================================== */

  function scheduleSave(productId) {

    const oldTimer =
      saveTimers.get(
        productId
      );


    if (oldTimer) {

      clearTimeout(
        oldTimer
      );

    }


    const timer =
      window.setTimeout(
        function () {

          saveTimers.delete(
            productId
          );


          saveProductCount(
            productId
          ).catch(
            function () {

              /*
                Ошибка уже показана.
              */

            }
          );

        },
        SAVE_DELAY
      );


    saveTimers.set(
      productId,
      timer
    );


    setSaveStatus(
      "saving",
      "Ожидает сохранения..."
    );

  }


  function saveImmediately(productId) {

    const timer =
      saveTimers.get(
        productId
      );


    if (timer) {

      clearTimeout(
        timer
      );


      saveTimers.delete(
        productId
      );

    }


    return saveProductCount(
      productId
    );

  }


  async function saveProductCount(productId) {

    if (!weeklyOrder) {
      return;
    }


    const product =
      products.find(
        function (item) {

          return (
            item.id ===
            productId
          );

        }
      );


    if (!product) {
      return;
    }


    const record =
      getStockRecord(
        productId
      );


    const version =
      editVersions.get(
        productId
      ) || 0;


    const baseQty =
      calculateBaseQty(
        product,
        record
      );


    const payload = {

      weekly_order_id:
        weeklyOrder.id,

      product_id:
        productId,

      case_qty:
        record.case_qty,

      slv_qty:
        record.slv_qty,

      pcs_qty:
        record.pcs_qty,

      base_qty:
        baseQty

    };


    activeSaves++;


    setSaveStatus(
      "saving",
      "Сохранение..."
    );


    try {

      const {
        data,
        error
      } =
        await supabaseClient

          .from(
            "weekly_order_stock_items"
          )

          .upsert(
            payload,
            {
              onConflict:
                "weekly_order_id,product_id"
            }
          )

          .select()

          .single();


      if (error) {
        throw error;
      }


      const currentVersion =
        editVersions.get(
          productId
        ) || 0;


      if (
        currentVersion ===
        version
      ) {

        stockMap.set(
          productId,
          data
        );


        dirtyProducts.delete(
          productId
        );


        updateVisibleRow(
          productId
        );

      }

    } catch (error) {

      console.error(
        "Ошибка autosave:",
        error
      );


      setSaveStatus(
        "error",
        "Ошибка сохранения"
      );


      throw error;

    } finally {

      activeSaves--;


      if (
        activeSaves === 0 &&
        dirtyProducts.size === 0
      ) {

        setSaveStatus(
          "saved",
          "Все изменения сохранены"
        );

      }

    }

  }


  async function flushAllSaves() {

    saveTimers.forEach(
      function (timer) {

        clearTimeout(
          timer
        );

      }
    );


    saveTimers.clear();


    const productIds =
      Array.from(
        dirtyProducts
      );


    if (!productIds.length) {
      return;
    }


    await Promise.all(
      productIds.map(
        function (productId) {

          return saveProductCount(
            productId
          );

        }
      )
    );

  }


  /* =====================================================
     CATEGORY
  ===================================================== */

  function setCategory(category) {

    if (
      !CATEGORY_NAMES[
        category
      ]
    ) {
      return;
    }


    currentCategory =
      category;


    root
      .querySelectorAll(
        ".stock-category"
      )

      .forEach(
        function (button) {

          button.classList.toggle(
            "is-active",

            button.dataset.category ===
              category
          );

        }
      );


    renderProducts();

  }


  /* =====================================================
     ORDER DAY SWITCH
  ===================================================== */

  async function switchOrderDay(orderDay) {

    if (
      !ORDER_DAYS[
        orderDay
      ]
    ) {
      return;
    }


    if (
      orderDay ===
      selectedOrderDay
    ) {
      return;
    }


    try {

      setSaveStatus(
        "saving",
        "Переключение заказа..."
      );


      await flushAllSaves();

      await flushFreshLots();


      selectedOrderDay =
        orderDay;


      weeklyOrder =
        null;


      stockMap =
        new Map();


      saveTimers =
        new Map();


      dirtyProducts =
        new Set();


      editVersions =
        new Map();


      await ensureWeeklyOrder();


      await loadStock();


      /*
        ПН / ЧТ ауысқанда Fresh lots
        жаңа weekly_order_id бойынша
        қайта жүктелуі керек.
      */

      await refreshFreshLots();


      updateOrderHeader();


      renderProducts();


      setSaveStatus(
        "saved",
        "Все изменения сохранены"
      );

    } catch (error) {

      console.error(
        "Order day switch:",
        error
      );


      setSaveStatus(
        "error",
        error.message ||
        "Не удалось переключить день заказа"
      );

    }

  }


  /* =====================================================
     DELIVERY STATUS
  ===================================================== */

  async function setDeliveryStatus(status) {

    if (
      !weeklyOrder ||
      !requiresDeliveryStatus()
    ) {
      return;
    }


    if (
      status !== "arrived" &&
      status !== "pending"
    ) {
      return;
    }


    try {

      setSaveStatus(
        "saving",
        "Сохранение статуса поставки..."
      );


      const {
        data,
        error
      } =
        await supabaseClient

          .from(
            "weekly_orders"
          )

          .update({

            same_day_delivery_status:
              status

          })

          .eq(
            "id",
            weeklyOrder.id
          )

          .select()

          .single();


      if (error) {
        throw error;
      }


      weeklyOrder =
        {
          ...weeklyOrder,
          ...data
        };


      updateSameDayDeliveryUI();


      updateProgress();


      setSaveStatus(
        "saved",
        "Статус поставки сохранен"
      );

    } catch (error) {

      console.error(
        "Delivery status:",
        error
      );


      setSaveStatus(
        "error",
        error.message ||
        "Не удалось сохранить статус поставки"
      );

    }

  }


  /* =====================================================
     PRODUCT MODAL
  ===================================================== */

  function updateModalUnitLabels() {

    const unit =
      root
        .querySelector(
          "#stock-product-iiko-unit"
        )
        ?.value ||
      "шт";


    root
      .querySelectorAll(
        "[data-stock-unit]"
      )

      .forEach(
        function (element) {

          element.textContent =
            unit;

        }
      );

  }


  function setFormMessage(
    text,
    type = ""
  ) {

    const element =
      root.querySelector(
        "#stock-form-message"
      );


    if (!element) {
      return;
    }


    element.textContent =
      text || "";


    element.className =
      "stock-form-message";


    if (type) {

      element.classList.add(
        `is-${type}`
      );

    }

  }


  function openProductModal(product = null) {

    const modal =
      root.querySelector(
        "#stock-product-modal"
      );


    const form =
      root.querySelector(
        "#stock-product-form"
      );


    if (
      !modal ||
      !form
    ) {
      return;
    }


    form.reset();


    setFormMessage("");


    root.querySelector(
      "#stock-product-id"
    ).value =
      product?.id || "";


    root.querySelector(
      "#stock-product-category"
    ).value =
      product?.category ||
      currentCategory;


    root.querySelector(
      "#stock-product-name"
    ).value =
      product?.name || "";


    root.querySelector(
      "#stock-product-iiko-code"
    ).value =
      product?.iiko_code || "";


    root.querySelector(
      "#stock-product-iiko-name"
    ).value =
      product?.iiko_name || "";


    root.querySelector(
      "#stock-product-iiko-unit"
    ).value =
      product?.iiko_unit ||
      "шт";


    root.querySelector(
      "#stock-product-case"
    ).value =
      product?.case_to_base ??
      "";


    root.querySelector(
      "#stock-product-slv"
    ).value =
      product?.slv_to_base ??
      "";


    root.querySelector(
      "#stock-product-pcs"
    ).value =
      product?.pcs_to_base ??
      1;


    root.querySelector(
      "#stock-product-safety-stock"
    ).value =
      product?.safety_stock ??
      0;


    root.querySelector(
      "#stock-product-modal-title"
    ).textContent =
      product
        ? "Изменить товар"
        : "Добавить товар";


    root.querySelector(
      "#stock-product-save-button"
    ).textContent =
      product
        ? "Сохранить изменения"
        : "Добавить товар";


    updateModalUnitLabels();


    modal.classList.add(
      "is-open"
    );


    modal.setAttribute(
      "aria-hidden",
      "false"
    );


    document.body
      .classList
      .add(
        "stock-modal-open"
      );

  }


  function closeProductModal() {

    const modal =
      root.querySelector(
        "#stock-product-modal"
      );


    if (!modal) {
      return;
    }


    modal.classList.remove(
      "is-open"
    );


    modal.setAttribute(
      "aria-hidden",
      "true"
    );


    document.body
      .classList
      .remove(
        "stock-modal-open"
      );

  }


  /* =====================================================
     SAVE PRODUCT CONFIG
  ===================================================== */

  async function saveProduct(event) {

    event.preventDefault();


    const id =
      root.querySelector(
        "#stock-product-id"
      ).value.trim();


    const category =
      root.querySelector(
        "#stock-product-category"
      ).value;


    const payload = {

      category:
        category,


      /*
        Cola = отдельный delivery group.
        Остальные категории = general.
      */

      delivery_group:
        category === "cola"
          ? "cola"
          : "general",


      name:
        root.querySelector(
          "#stock-product-name"
        ).value.trim(),


      iiko_code:
        root.querySelector(
          "#stock-product-iiko-code"
        ).value.trim(),


      iiko_name:
        root.querySelector(
          "#stock-product-iiko-name"
        ).value.trim() ||
        null,


      iiko_unit:
        root.querySelector(
          "#stock-product-iiko-unit"
        ).value,


      case_to_base:
        toNullableNumber(
          root.querySelector(
            "#stock-product-case"
          ).value
        ),


      slv_to_base:
        toNullableNumber(
          root.querySelector(
            "#stock-product-slv"
          ).value
        ),


      pcs_to_base:
        toNullableNumber(
          root.querySelector(
            "#stock-product-pcs"
          ).value
        ) ?? 1,


      safety_stock:
        toNullableNumber(
          root.querySelector(
            "#stock-product-safety-stock"
          ).value
        ) ?? 0

    };


    if (
      !payload.name ||
      !payload.iiko_code
    ) {

      setFormMessage(
        "Заполните название и код IIKO.",
        "error"
      );


      return;

    }


    const button =
      root.querySelector(
        "#stock-product-save-button"
      );


    if (button) {

      button.disabled =
        true;

    }


    setFormMessage(
      "Сохранение...",
      "loading"
    );


    try {

      if (id) {

        const {
          error
        } =
          await supabaseClient

            .from(
              "order_products"
            )

            .update(
              payload
            )

            .eq(
              "id",
              id
            )

            .eq(
              "restaurant_id",
              restaurantId
            );


        if (error) {
          throw error;
        }

      }

      else {

        const categoryCount =
          products.filter(
            function (product) {

              return (
                product.category ===
                payload.category
              );

            }
          ).length;


        const {
          error
        } =
          await supabaseClient

            .from(
              "order_products"
            )

            .insert({

              ...payload,

              restaurant_id:
                restaurantId,

              sort_order:
                categoryCount + 1,

              is_active:
                true

            });


        if (error) {
          throw error;
        }

      }


      currentCategory =
        payload.category;


      await loadProducts();


      /*
        Егер товар Fresh-қа ауыстырылса
        немесе жаңа Fresh қосылса,
        Fresh module state жаңартамыз.
      */

      await refreshFreshLots();


      closeProductModal();


      setCategory(
        currentCategory
      );

    } catch (error) {

      console.error(
        "Product save:",
        error
      );


      setFormMessage(

        error.code === "23505"

          ? "Такой код IIKO уже существует."

          : (
              error.message ||
              "Ошибка сохранения"
            ),

        "error"

      );

    } finally {

      if (button) {

        button.disabled =
          false;

      }

    }

  }

  /* =====================================================
   UNCOUNTED PRODUCTS WARNING
===================================================== */

  function getUncountedProducts() {

    return products.filter(
      function (product) {

        return !isCountedRecord(
          getStockRecord(
            product.id
          )
        );

      }
    );

  }


function openUncountedModal(
  uncountedProducts
) {

  const modal =
    root.querySelector(
      "#stock-uncounted-modal"
    );


  const list =
    root.querySelector(
      "#stock-uncounted-list"
    );


  if (
    !modal ||
    !list
  ) {
    return;
  }


  list.innerHTML =
    uncountedProducts
      .map(
        function (product) {

          return `
            <div class="stock-warning-item">

              <strong>
                ${escapeHTML(
                  product.name
                )}
              </strong>

              <span>
                ${escapeHTML(
                  CATEGORY_NAMES[
                    product.category
                  ] ||
                  product.category
                )}
              </span>

            </div>
          `;

        }
      )
      .join("");


  modal.classList.add(
    "is-open"
  );


  modal.setAttribute(
    "aria-hidden",
    "false"
  );


  document.body.classList.add(
    "stock-modal-open"
  );

}


function closeUncountedModal() {

  const modal =
    root.querySelector(
      "#stock-uncounted-modal"
    );


  if (!modal) {
    return;
  }


  modal.classList.remove(
    "is-open"
  );


  modal.setAttribute(
    "aria-hidden",
    "true"
  );


  document.body.classList.remove(
    "stock-modal-open"
  );

}


  /* =====================================================
     NEXT STEP
  ===================================================== */

  async function goNext(
  forceContinue = false
) {

  if (
    !deliveryStatusIsReady()
  ) {

    setSaveStatus(
      "error",
      "Укажите, приехала ли поставка"
    );


    return;

  }


  /*
    Fresh сроктары бөлек validation.
    Оны өткізіп жіберуге болмайды.
  */

  if (
    !freshLotsIsReady()
  ) {

    setSaveStatus(
      "error",
      "Распределите остатки Fresh по срокам"
    );


    return;

  }


  /*
    Проверяем непросчитанные товары.
  */

  if (!forceContinue) {

    const uncountedProducts =
      getUncountedProducts();


    if (
      uncountedProducts.length
    ) {

      openUncountedModal(
        uncountedProducts
      );


      return;

    }

  }


  const button =
    root.querySelector(
      "#stock-next-button"
    );


  if (button) {

    button.disabled =
      true;

  }


  try {

    closeUncountedModal();


    await flushAllSaves();

    await flushFreshLots();


    const {
      data,
      error
    } =
      await supabaseClient

        .from(
          "weekly_orders"
        )

        .update({
          status:
            "sales"
        })

        .eq(
          "id",
          weeklyOrder.id
        )

        .select()

        .single();


    if (error) {
      throw error;
    }


    weeklyOrder = {
      ...weeklyOrder,
      ...data
    };


    if (
      appContext &&
      typeof appContext.goToStep ===
        "function"
    ) {

      await appContext.goToStep(
        2
      );

    }

  } catch (error) {

    console.error(
      "Next step:",
      error
    );


    setSaveStatus(
      "error",
      error.message ||
      "Не удалось перейти дальше"
    );


    if (button) {

      button.disabled =
        false;

    }

  }

  }


  /* =====================================================
     EVENTS
  ===================================================== */

  function bindEvents() {

    root.addEventListener(
      "click",
      function (event) {

        /*
          ПН / ЧТ
        */

        const orderDayButton =
          event.target.closest(
            "[data-stock-order-day]"
          );


        if (orderDayButton) {

          switchOrderDay(
            orderDayButton.dataset
              .stockOrderDay
          );


          return;

        }


        /*
          Машина приехала / нет
        */

        const deliveryStatusButton =
          event.target.closest(
            "[data-stock-delivery-status]"
          );


        if (deliveryStatusButton) {

          setDeliveryStatus(
            deliveryStatusButton.dataset
              .stockDeliveryStatus
          );


          return;

        }


        /*
          CATEGORY
        */

        const categoryButton =
          event.target.closest(
            ".stock-category"
          );


        if (categoryButton) {

          setCategory(
            categoryButton.dataset
              .category
          );


          return;

        }


        /*
          ADD PRODUCT
        */

        if (
          event.target.closest(
            "#stock-add-product-button"
          )
        ) {

          openProductModal();


          return;

        }


        /*
          EDIT PRODUCT
        */

        const editButton =
          event.target.closest(
            "[data-stock-edit]"
          );


        if (editButton) {

          const product =
            products.find(
              function (item) {

                return (
                  item.id ===
                  editButton.dataset
                    .stockEdit
                );

              }
            );


          if (product) {

            openProductModal(
              product
            );

          }


          return;

        }


        /*
          ZERO STOCK
        */

        const zeroButton =
          event.target.closest(
            "[data-stock-zero]"
          );


        if (zeroButton) {

          setZeroStock(
            zeroButton.dataset
              .stockZero
          );


          return;

        }


        /*
          MODAL CLOSE
        */

        if (
          event.target.closest(
            "[data-stock-modal-close]"
          )
        ) {

          closeProductModal();


          return;

        }

        /*
          UNCOUNTED MODAL CLOSE
        */

        if (
          event.target.closest(
            "[data-stock-uncounted-close]"
          )
        ) {

          closeUncountedModal();


          return;

        }


        /*
          CONTINUE WITHOUT UNCOUNTED
        */

        if (
          event.target.closest(
            "#stock-uncounted-continue"
          )
        ) {

          goNext(
            true
          );


          return;

        }


        /*
          NEXT
        */

        if (
          event.target.closest(
            "#stock-next-button"
          )
        ) {

          goNext();

        }

      }
    );

    /*
  PRODUCT SEARCH
*/

const searchInput =
  root.querySelector(
    "#stock-product-search"
  );


const searchClear =
  root.querySelector(
    "#stock-search-clear"
  );


searchInput?.addEventListener(
  "input",
  function () {

    productSearch =
      searchInput.value;


    if (searchClear) {

      searchClear.hidden =
        !productSearch;

    }


    renderProducts();

  }
);


searchClear?.addEventListener(
  "click",
  function () {

    productSearch = "";


    if (searchInput) {

      searchInput.value = "";

      searchInput.focus();

    }


    searchClear.hidden =
      true;


    renderProducts();

  }
);


    /*
      COUNT INPUT
    */

    root.addEventListener(
      "input",
      function (event) {

        const input =
          event.target.closest(
            "[data-stock-input]"
          );


        if (!input) {
          return;
        }


        updateLocalCount(

          input.dataset.productId,

          input.dataset.countType,

          input.value

        );

      }
    );


    /*
      Когда пользователь вышел
      из поля — сохраняем сразу.
    */

    root.addEventListener(
      "focusout",
      function (event) {

        const input =
          event.target.closest(
            "[data-stock-input]"
          );


        if (!input) {
          return;
        }


        saveImmediately(
          input.dataset.productId
        ).catch(
          function () {

            /*
              Ошибка уже отображена.
            */

          }
        );

      }
    );


    /*
      PRODUCT FORM
    */

    root
      .querySelector(
        "#stock-product-form"
      )
      ?.addEventListener(
        "submit",
        saveProduct
      );


    /*
      IIKO UNIT
    */

    root
      .querySelector(
        "#stock-product-iiko-unit"
      )
      ?.addEventListener(
        "change",
        updateModalUnitLabels
      );

  }


  /* =====================================================
     INIT
  ===================================================== */

  async function init(
    container,
    context
  ) {

    root =
      container.querySelector(
        "#order-stock-step"
      );


    if (!root) {

      throw new Error(
        "Step 1 root не найден."
      );

    }


    appContext =
      context || null;


    selectedOrderDay =
      getDefaultOrderDay();


    currentCategory =
      "cola";


    products = [];


    deliverySchedule =
      new Map();


    stockMap =
      new Map();


    saveTimers =
      new Map();


    dirtyProducts =
      new Set();


    editVersions =
      new Map();


    activeSaves =
      0;


    bindEvents();


    try {

      setSaveStatus(
        "saving",
        "Подготовка заказа..."
      );


      /*
        1. Пользователь + ресторан
      */

      await loadUserContext();


      /*
        2. Основной график поставок
      */

      await loadDeliverySchedule();


      /*
        3. Weekly order ПН / ЧТ
      */

      await ensureWeeklyOrder();


      /*
        4. Товары + физический остаток
      */

      await Promise.all([

        loadProducts(),

        loadStock()

      ]);


      /*
        5. Запускаем отдельный
           Fresh Lots module.
      */

      await initFreshLots();


      /*
        6. UI
      */

      updateOrderHeader();


      setCategory(
        currentCategory
      );


      setSaveStatus(
        "saved",
        "Все изменения сохранены"
      );

    } catch (error) {

      console.error(
        "Step 1 init error:",
        error
      );


      const tbody =
        root.querySelector(
          "#stock-products-body"
        );


      if (tbody) {

        tbody.innerHTML = `
          <tr class="stock-error-row">

            <td colspan="6">

              <strong>
                Ошибка загрузки
              </strong>

              <br><br>

              ${escapeHTML(
                error.message ||
                String(error)
              )}

            </td>

          </tr>
        `;

      }


      setSaveStatus(
        "error",
        "Ошибка загрузки"
      );

    }

  }


  /* =====================================================
     PUBLIC API
  ===================================================== */

  window.OrderStep1Stock = {
    getNotesContext: () => ({ order: weeklyOrder, userId, restaurantId, products }),

    init,


    reload:
      async function () {

        if (!root) {
          return;
        }


        await loadDeliverySchedule();


        await Promise.all([

          loadProducts(),

          loadStock()

        ]);


        await refreshFreshLots();


        updateOrderHeader();


        renderProducts();

      }

  };

})();
