/* =====================================================
   IZAKAZ v0.2.0
   INVENTORY — LISTS
===================================================== */

(function () {
  "use strict";


  /* =====================================================
     CONSTANTS
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


  const CATEGORY_ORDER = [
    "cola",
    "fresh",
    "freezer",
    "cooler",
    "dry",
    "chemistry",
    "household",
    "other"
  ];


  const DAY_NAMES = {
    1: "Пн",
    2: "Вт",
    3: "Ср",
    4: "Чт",
    5: "Пт",
    6: "Сб"
  };


  /* =====================================================
     STATE
  ===================================================== */

  let root = null;

  let userId = null;

  let restaurantId = null;

  let products = [];


  /*
    Состояние из Supabase:

    productId -> {
      dailyAll: row | null,
      specificDays: Map(day -> row),
      weekly: row | null
    }
  */

  let savedSchedules =
    new Map();


  /*
    Текущее состояние интерфейса:

    productId -> {
      dailyAll: boolean,
      specificDays: Set([1,2...6]),
      weekly: boolean
    }
  */

  let draftSchedules =
    new Map();


  let dirtyProducts =
    new Set();


  let selectedProducts =
    new Set();


  let currentCategory =
    "all";


  let searchQuery =
    "";


  let editingDaysProductId =
    null;


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


  function normalizeSearch(value) {

    return String(value ?? "")
      .trim()
      .toLowerCase();

  }


  function getCategoryName(
    category
  ) {

    return (
      CATEGORY_NAMES[category] ||
      category ||
      "Другое"
    );

  }


  function getProductById(
    productId
  ) {

    return products.find(
      function (product) {

        return (
          product.id ===
          productId
        );

      }
    );

  }


  function getEmptySavedSchedule() {

    return {
      dailyAll: null,
      specificDays: new Map(),
      weekly: null
    };

  }


  function getEmptyDraftSchedule() {

    return {
      dailyAll: false,
      specificDays: new Set(),
      weekly: false
    };

  }


  function getSavedSchedule(
    productId
  ) {

    if (
      !savedSchedules.has(
        productId
      )
    ) {

      savedSchedules.set(
        productId,
        getEmptySavedSchedule()
      );

    }


    return savedSchedules.get(
      productId
    );

  }


  function getDraftSchedule(
    productId
  ) {

    if (
      !draftSchedules.has(
        productId
      )
    ) {

      draftSchedules.set(
        productId,
        getEmptyDraftSchedule()
      );

    }


    return draftSchedules.get(
      productId
    );

  }


  function setsEqual(
    first,
    second
  ) {

    if (
      first.size !==
      second.size
    ) {
      return false;
    }


    for (
      const value
      of first
    ) {

      if (
        !second.has(
          value
        )
      ) {
        return false;
      }

    }


    return true;

  }


  function getSortedDays(
    days
  ) {

    return Array.from(
      days
    )
      .map(Number)
      .filter(
        function (day) {

          return (
            day >= 1 &&
            day <= 6
          );

        }
      )
      .sort(
        function (a, b) {

          return a - b;

        }
      );

  }


  /* =====================================================
     MESSAGE
  ===================================================== */

  function showMessage(
    text,
    type = "success"
  ) {

    const element =
      root?.querySelector(
        "#inventory-lists-message"
      );


    if (!element) {
      return;
    }


    element.hidden =
      false;


    element.className =
      `inventory-lists-message is-${type}`;


    element.textContent =
      text;


    window.clearTimeout(
      showMessage.timer
    );


    showMessage.timer =
      window.setTimeout(
        function () {

          if (element) {
            element.hidden = true;
          }

        },
        4000
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
        .select(
          "restaurant_id"
        )
        .eq(
          "id",
          userId
        )
        .single();


    if (profileError) {
      throw profileError;
    }


    restaurantId =
      profile?.restaurant_id;


    if (!restaurantId) {

      throw new Error(
        "У пользователя не указан ресторан."
      );

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
        .from(
          "order_products"
        )
        .select(`
          id,
          category,
          name,
          iiko_code,
          iiko_unit,
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
          "category",
          {
            ascending: true
          }
        )
        .order(
          "sort_order",
          {
            ascending: true
          }
        )
        .order(
          "name",
          {
            ascending: true
          }
        );


    if (error) {
      throw error;
    }


    products =
      data || [];

  }


  /* =====================================================
     LIST ITEMS
  ===================================================== */

  async function loadListItems() {

    const {
      data,
      error
    } =
      await supabaseClient
        .from(
          "inventory_list_items"
        )
        .select(`
          id,
          product_id,
          list_type,
          weekday,
          sort_order
        `)
        .eq(
          "restaurant_id",
          restaurantId
        );


    if (error) {
      throw error;
    }


    savedSchedules =
      new Map();


    draftSchedules =
      new Map();


    products.forEach(
      function (product) {

        savedSchedules.set(
          product.id,
          getEmptySavedSchedule()
        );


        draftSchedules.set(
          product.id,
          getEmptyDraftSchedule()
        );

      }
    );


    (data || []).forEach(
      function (item) {

        if (
          !savedSchedules.has(
            item.product_id
          )
        ) {
          return;
        }


        const saved =
          savedSchedules.get(
            item.product_id
          );


        const draft =
          draftSchedules.get(
            item.product_id
          );


        /*
          WEEKLY = воскресенье
        */

        if (
          item.list_type ===
          "weekly"
        ) {

          saved.weekly =
            item;


          draft.weekly =
            true;


          return;

        }


        /*
          DAILY
        */

        if (
          item.list_type !==
          "daily"
        ) {
          return;
        }


        /*
          weekday NULL
          = каждый день Пн-Сб
        */

        if (
          item.weekday === null ||
          item.weekday === undefined
        ) {

          saved.dailyAll =
            item;


          draft.dailyAll =
            true;


          return;

        }


        const day =
          Number(
            item.weekday
          );


        if (
          day < 1 ||
          day > 6
        ) {
          return;
        }


        saved.specificDays.set(
          day,
          item
        );


        draft.specificDays.add(
          day
        );

      }
    );


    /*
      Если в базе каким-то образом
      одновременно dailyAll и specific days,
      в UI приоритет получает dailyAll.

      При следующем сохранении лишние
      записи будут очищены.
    */

    draftSchedules.forEach(
      function (draft) {

        if (draft.dailyAll) {

          draft.specificDays.clear();

        }

      }
    );

  }


  /* =====================================================
     FILTER
  ===================================================== */

  function getFilteredProducts() {

    const query =
      normalizeSearch(
        searchQuery
      );


    return products.filter(
      function (product) {

        if (
          currentCategory !==
            "all" &&
          product.category !==
            currentCategory
        ) {

          return false;

        }


        if (!query) {
          return true;
        }


        const text =
          [
            product.name,
            product.iiko_code,
            getCategoryName(
              product.category
            )
          ]
            .join(" ")
            .toLowerCase();


        return text.includes(
          query
        );

      }
    );

  }


  /* =====================================================
     CATEGORIES
  ===================================================== */

  function getAvailableCategories() {

    const categorySet =
      new Set(
        products.map(
          function (product) {

            return product.category;

          }
        )
      );


    const known =
      CATEGORY_ORDER.filter(
        function (category) {

          return categorySet.has(
            category
          );

        }
      );


    const unknown =
      Array.from(
        categorySet
      )
        .filter(
          function (category) {

            return (
              !CATEGORY_ORDER.includes(
                category
              )
            );

          }
        );


    return [
      ...known,
      ...unknown
    ];

  }


  function renderCategories() {

    const container =
      root.querySelector(
        "#inventory-lists-categories"
      );


    if (!container) {
      return;
    }


    const categories =
      getAvailableCategories();


    container.innerHTML = `

      <button
        class="
          inventory-lists-category
          ${
            currentCategory === "all"
              ? "is-active"
              : ""
          }
        "
        type="button"
        data-inventory-category="all"
      >
        Все · ${products.length}
      </button>


      ${categories
        .map(
          function (category) {

            const count =
              products.filter(
                function (product) {

                  return (
                    product.category ===
                    category
                  );

                }
              ).length;


            return `
              <button
                class="
                  inventory-lists-category
                  ${
                    currentCategory ===
                      category
                      ? "is-active"
                      : ""
                  }
                "
                type="button"
                data-inventory-category="${escapeHTML(
                  category
                )}"
              >
                ${escapeHTML(
                  getCategoryName(
                    category
                  )
                )}
                · ${count}
              </button>
            `;

          }
        )
        .join("")}

    `;

  }


  /* =====================================================
     STATS
  ===================================================== */

  function renderStats() {

    let dailyCount =
      0;


    let weeklyCount =
      0;


    products.forEach(
      function (product) {

        const draft =
          getDraftSchedule(
            product.id
          );


        if (
          draft.dailyAll ||
          draft.specificDays.size > 0
        ) {

          dailyCount += 1;

        }


        if (draft.weekly) {

          weeklyCount += 1;

        }

      }
    );


    const totalElement =
      root.querySelector(
        "#inventory-lists-total-count"
      );


    const dailyElement =
      root.querySelector(
        "#inventory-lists-daily-count"
      );


    const weeklyElement =
      root.querySelector(
        "#inventory-lists-weekly-count"
      );


    if (totalElement) {

      totalElement.textContent =
        String(
          products.length
        );

    }


    if (dailyElement) {

      dailyElement.textContent =
        String(
          dailyCount
        );

    }


    if (weeklyElement) {

      weeklyElement.textContent =
        String(
          weeklyCount
        );

    }

  }


  /* =====================================================
     DAYS HTML
  ===================================================== */

  function getDaysButtonHTML(
    product
  ) {

    const draft =
      getDraftSchedule(
        product.id
      );


    const days =
      getSortedDays(
        draft.specificDays
      );


    /*
      Daily Пн-Сб включен.
      Дни отдельно не нужны,
      но кнопку оставляем доступной:
      пользователь может открыть
      и выбрать specific days.
    */

    if (draft.dailyAll) {

      return `
        <button
          class="inventory-days-button"
          type="button"
          data-inventory-days-open="${escapeHTML(
            product.id
          )}"
        >
          Настроить
        </button>
      `;

    }


    if (!days.length) {

      return `
        <button
          class="inventory-days-button"
          type="button"
          data-inventory-days-open="${escapeHTML(
            product.id
          )}"
        >
          Выбрать
        </button>
      `;

    }


    return `
      <button
        class="
          inventory-days-button
          has-days
        "
        type="button"
        data-inventory-days-open="${escapeHTML(
          product.id
        )}"
      >

        <span class="inventory-days-chips">

          ${days
            .map(
              function (day) {

                return `
                  <span class="inventory-day-chip">
                    ${DAY_NAMES[day]}
                  </span>
                `;

              }
            )
            .join("")}

        </span>

      </button>
    `;

  }


  /* =====================================================
     TABLE
  ===================================================== */

  function renderProducts() {

    const body =
      root.querySelector(
        "#inventory-lists-table-body"
      );


    const loading =
      root.querySelector(
        "#inventory-lists-loading"
      );


    const empty =
      root.querySelector(
        "#inventory-lists-empty"
      );


    const tableWrap =
      root.querySelector(
        "#inventory-lists-table-wrap"
      );


    if (
      !body ||
      !loading ||
      !empty ||
      !tableWrap
    ) {
      return;
    }


    loading.hidden =
      true;


    const filtered =
      getFilteredProducts();


    if (!filtered.length) {

      tableWrap.hidden =
        true;

      empty.hidden =
        false;


      updateSelectAllState();

      return;

    }


    empty.hidden =
      true;

    tableWrap.hidden =
      false;


    body.innerHTML =
      filtered
        .map(
          function (product) {

            const draft =
              getDraftSchedule(
                product.id
              );


            const selected =
              selectedProducts.has(
                product.id
              );


            const dirty =
              dirtyProducts.has(
                product.id
              );


            return `
              <tr
                class="${
                  dirty
                    ? "is-dirty"
                    : ""
                }"
                data-inventory-product-row="${escapeHTML(
                  product.id
                )}"
              >

                <td
                  class="inventory-lists-select-column"
                >

                  <input
                    class="inventory-lists-row-select"
                    type="checkbox"

                    data-inventory-row-select="${escapeHTML(
                      product.id
                    )}"

                    ${
                      selected
                        ? "checked"
                        : ""
                    }
                  >

                </td>


                <td>

                  <div class="inventory-lists-product">

                    <strong>
                      ${escapeHTML(
                        product.name
                      )}
                    </strong>


                    <div
                      class="inventory-lists-product-meta"
                    >

                      <span
                        class="inventory-lists-product-code"
                      >
                        IIKO:
                        ${escapeHTML(
                          product.iiko_code
                        )}
                      </span>


                      <span
                        class="inventory-lists-product-category"
                      >
                        ${escapeHTML(
                          getCategoryName(
                            product.category
                          )
                        )}
                      </span>

                    </div>

                  </div>

                </td>


                <td
                  class="inventory-lists-unit-column"
                >
                  ${escapeHTML(
                    product.iiko_unit ||
                    "—"
                  )}
                </td>


                <!-- DAILY ALL -->

                <td
                  class="inventory-lists-list-column"
                >

                  <label
                    class="inventory-list-toggle"
                  >

                    <input
                      type="checkbox"

                      data-inventory-list-toggle
                      data-product-id="${escapeHTML(
                        product.id
                      )}"

                      data-list-type="daily"

                      ${
                        draft.dailyAll
                          ? "checked"
                          : ""
                      }
                    >

                    <span
                      class="inventory-list-toggle-track"
                    ></span>

                  </label>

                </td>


                <!-- SPECIFIC DAYS -->

                <td
                  class="inventory-lists-days-column"
                >

                  ${getDaysButtonHTML(
                    product
                  )}

                </td>


                <!-- WEEKLY -->

                <td
                  class="inventory-lists-list-column"
                >

                  <label
                    class="inventory-list-toggle"
                  >

                    <input
                      type="checkbox"

                      data-inventory-list-toggle
                      data-product-id="${escapeHTML(
                        product.id
                      )}"

                      data-list-type="weekly"

                      ${
                        draft.weekly
                          ? "checked"
                          : ""
                      }
                    >

                    <span
                      class="inventory-list-toggle-track"
                    ></span>

                  </label>

                </td>

              </tr>
            `;

          }
        )
        .join("");


    updateSelectAllState();

  }


  /* =====================================================
     DIRTY
  ===================================================== */

  function markDirty(
    productId
  ) {

    const saved =
      getSavedSchedule(
        productId
      );


    const draft =
      getDraftSchedule(
        productId
      );


    const savedDays =
      new Set(
        saved.specificDays.keys()
      );


    const isDirty =
      (
        Boolean(
          saved.dailyAll
        ) !==
        draft.dailyAll
      )

      ||

      (
        Boolean(
          saved.weekly
        ) !==
        draft.weekly
      )

      ||

      (
        !setsEqual(
          savedDays,
          draft.specificDays
        )
      );


    if (isDirty) {

      dirtyProducts.add(
        productId
      );

    }

    else {

      dirtyProducts.delete(
        productId
      );

    }


    updateSaveButton();

  }


  function updateSaveButton() {

    const button =
      root.querySelector(
        "#inventory-lists-save-button"
      );


    if (!button) {
      return;
    }


    button.disabled =
      dirtyProducts.size ===
      0;

  }


  /* =====================================================
     SELECTION
  ===================================================== */

  function updateSelectionUI() {

    const countElement =
      root.querySelector(
        "#inventory-lists-selected-count"
      );


    if (countElement) {

      countElement.textContent =
        String(
          selectedProducts.size
        );

    }


    const disabled =
      selectedProducts.size ===
      0;


    [
      "#inventory-lists-add-daily",
      "#inventory-lists-add-weekly",
      "#inventory-lists-remove"
    ]
      .forEach(
        function (selector) {

          const button =
            root.querySelector(
              selector
            );


          if (button) {

            button.disabled =
              disabled;

          }

        }
      );


    updateSelectAllState();

  }


  function updateSelectAllState() {

    const checkbox =
      root?.querySelector(
        "#inventory-lists-select-all"
      );


    if (!checkbox) {
      return;
    }


    const visible =
      getFilteredProducts();


    if (!visible.length) {

      checkbox.checked =
        false;

      checkbox.indeterminate =
        false;

      return;

    }


    const selectedVisible =
      visible.filter(
        function (product) {

          return selectedProducts.has(
            product.id
          );

        }
      ).length;


    checkbox.checked =
      selectedVisible ===
      visible.length;


    checkbox.indeterminate =
      (
        selectedVisible > 0 &&
        selectedVisible <
          visible.length
      );

  }


  function toggleSelectAll(
    checked
  ) {

    const visible =
      getFilteredProducts();


    visible.forEach(
      function (product) {

        if (checked) {

          selectedProducts.add(
            product.id
          );

        }

        else {

          selectedProducts.delete(
            product.id
          );

        }

      }
    );


    renderProducts();

    updateSelectionUI();

  }


  /* =====================================================
     DAILY / WEEKLY
  ===================================================== */

  function changeProductList(
    productId,
    listType,
    checked
  ) {

    const draft =
      getDraftSchedule(
        productId
      );


    if (
      listType ===
      "daily"
    ) {

      draft.dailyAll =
        Boolean(
          checked
        );


      /*
        Daily Пн-Сб ON
        = specific days больше не нужны.
      */

      if (
        draft.dailyAll
      ) {

        draft.specificDays.clear();

      }

    }


    else if (
      listType ===
      "weekly"
    ) {

      draft.weekly =
        Boolean(
          checked
        );

    }


    else {

      return;

    }


    markDirty(
      productId
    );


    renderStats();

    renderProducts();

  }


  /* =====================================================
     SPECIFIC DAYS MODAL
  ===================================================== */

  function openDaysModal(
    productId
  ) {

    const product =
      getProductById(
        productId
      );


    if (!product) {
      return;
    }


    editingDaysProductId =
      productId;


    const draft =
      getDraftSchedule(
        productId
      );


    const modal =
      root.querySelector(
        "#inventory-days-modal"
      );


    if (!modal) {
      return;
    }


    const nameElement =
      root.querySelector(
        "#inventory-days-product-name"
      );


    const codeElement =
      root.querySelector(
        "#inventory-days-product-code"
      );


    if (nameElement) {

      nameElement.textContent =
        product.name;

    }


    if (codeElement) {

      codeElement.textContent =
        `IIKO: ${
          product.iiko_code ||
          "—"
        }`;

    }


    root
      .querySelectorAll(
        "[data-inventory-specific-day]"
      )
      .forEach(
        function (checkbox) {

          const day =
            Number(
              checkbox.value
            );


          checkbox.checked =
            draft.specificDays.has(
              day
            );

        }
      );


    modal.classList.add(
      "is-open"
    );


    modal.setAttribute(
      "aria-hidden",
      "false"
    );

  }


  function closeDaysModal() {

    const modal =
      root?.querySelector(
        "#inventory-days-modal"
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


    editingDaysProductId =
      null;

  }


  function clearDaysModal() {

    root
      .querySelectorAll(
        "[data-inventory-specific-day]"
      )
      .forEach(
        function (checkbox) {

          checkbox.checked =
            false;

        }
      );

  }


  function applyDaysModal() {

    if (
      !editingDaysProductId
    ) {
      return;
    }


    const selectedDays =
      Array.from(
        root.querySelectorAll(
          "[data-inventory-specific-day]:checked"
        )
      )
        .map(
          function (checkbox) {

            return Number(
              checkbox.value
            );

          }
        )
        .filter(
          function (day) {

            return (
              day >= 1 &&
              day <= 6
            );

          }
        );


    const draft =
      getDraftSchedule(
        editingDaysProductId
      );


    draft.specificDays =
      new Set(
        selectedDays
      );


    /*
      Егер нақты күндер таңдалса,
      Пн-Сб режимін автоматты өшіреміз.
    */

    if (
      selectedDays.length > 0
    ) {

      draft.dailyAll =
        false;

    }


    const productId =
      editingDaysProductId;


    markDirty(
      productId
    );


    closeDaysModal();


    renderStats();

    renderProducts();

  }


  /* =====================================================
     BULK
  ===================================================== */

  function applyBulk(
    mode
  ) {

    if (
      selectedProducts.size ===
      0
    ) {
      return;
    }


    selectedProducts.forEach(
      function (productId) {

        const draft =
          getDraftSchedule(
            productId
          );


        if (
          mode ===
          "daily"
        ) {

          draft.dailyAll =
            true;


          draft.specificDays.clear();

        }


        else if (
          mode ===
          "weekly"
        ) {

          draft.weekly =
            true;

        }


        else if (
          mode ===
          "remove"
        ) {

          draft.dailyAll =
            false;


          draft.specificDays.clear();


          draft.weekly =
            false;

        }


        markDirty(
          productId
        );

      }
    );


    renderStats();

    renderProducts();

  }


  /* =====================================================
     SAVE HELPERS
  ===================================================== */

  function rowKey(
    listType,
    weekday
  ) {

    return (
      `${listType}:` +
      (
        weekday === null ||
        weekday === undefined
          ? "all"
          : String(
              weekday
            )
      )
    );

  }


  function getExistingRows(
    saved
  ) {

    const rows =
      [];


    if (saved.dailyAll) {

      rows.push(
        saved.dailyAll
      );

    }


    saved.specificDays
      .forEach(
        function (row) {

          rows.push(
            row
          );

        }
      );


    if (saved.weekly) {

      rows.push(
        saved.weekly
      );

    }


    return rows;

  }


  function getDesiredRows(
    productId
  ) {

    const product =
      getProductById(
        productId
      );


    const draft =
      getDraftSchedule(
        productId
      );


    const rows =
      [];


    /*
      Daily Пн-Сб
    */

    if (
      draft.dailyAll
    ) {

      rows.push({

        restaurant_id:
          restaurantId,

        product_id:
          productId,

        list_type:
          "daily",

        weekday:
          null,

        sort_order:
          Number(
            product?.sort_order ||
            0
          )

      });

    }


    /*
      Specific days
    */

    else {

      getSortedDays(
        draft.specificDays
      )
        .forEach(
          function (day) {

            rows.push({

              restaurant_id:
                restaurantId,

              product_id:
                productId,

              list_type:
                "daily",

              weekday:
                day,

              sort_order:
                Number(
                  product?.sort_order ||
                  0
                )

            });

          }
        );

    }


    /*
      Weekly Sunday
    */

    if (
      draft.weekly
    ) {

      rows.push({

        restaurant_id:
          restaurantId,

        product_id:
          productId,

        list_type:
          "weekly",

        weekday:
          null,

        sort_order:
          Number(
            product?.sort_order ||
            0
          )

      });

    }


    return rows;

  }


  /* =====================================================
     SAVE
  ===================================================== */

  async function saveChanges() {

    if (
      dirtyProducts.size ===
      0
    ) {
      return;
    }


    const button =
      root.querySelector(
        "#inventory-lists-save-button"
      );


    const originalText =
      button?.textContent ||
      "Сохранить изменения";


    if (button) {

      button.disabled =
        true;


      button.textContent =
        "Сохранение...";

    }


    try {

      const deleteIds =
        [];


      const insertRows =
        [];


      for (
        const productId
        of dirtyProducts
      ) {

        const saved =
          getSavedSchedule(
            productId
          );


        const existingRows =
          getExistingRows(
            saved
          );


        const existingMap =
          new Map();


        existingRows.forEach(
          function (row) {

            existingMap.set(
              rowKey(
                row.list_type,
                row.weekday
              ),
              row
            );

          }
        );


        const desiredRows =
          getDesiredRows(
            productId
          );


        const desiredMap =
          new Map();


        desiredRows.forEach(
          function (row) {

            desiredMap.set(
              rowKey(
                row.list_type,
                row.weekday
              ),
              row
            );

          }
        );


        /*
          Удаляем записи,
          которых больше не должно быть.
        */

        existingMap.forEach(
          function (
            row,
            key
          ) {

            if (
              !desiredMap.has(
                key
              )
            ) {

              deleteIds.push(
                row.id
              );

            }

          }
        );


        /*
          Добавляем только новые записи.

          Upsert тут специально НЕ нужен,
          потому что weekday NULL участвует
          в уникальном expression index.
        */

        desiredMap.forEach(
          function (
            row,
            key
          ) {

            if (
              !existingMap.has(
                key
              )
            ) {

              insertRows.push(
                row
              );

            }

          }
        );

      }


      /*
        DELETE
      */

      if (
        deleteIds.length > 0
      ) {

        const {
          error: deleteError
        } =
          await supabaseClient
            .from(
              "inventory_list_items"
            )
            .delete()
            .eq(
              "restaurant_id",
              restaurantId
            )
            .in(
              "id",
              deleteIds
            );


        if (deleteError) {
          throw deleteError;
        }

      }


      /*
        INSERT
      */

      if (
        insertRows.length > 0
      ) {

        const {
          error: insertError
        } =
          await supabaseClient
            .from(
              "inventory_list_items"
            )
            .insert(
              insertRows
            );


        if (insertError) {
          throw insertError;
        }

      }


      dirtyProducts.clear();


      await loadListItems();


      renderAll();


      showMessage(
        "Списки инвентаризации сохранены."
      );


    } catch (error) {

      console.error(
        "Inventory lists save:",
        error
      );


      showMessage(
        error.message ||
        "Не удалось сохранить изменения.",
        "error"
      );


    } finally {

      if (button) {

        button.textContent =
          originalText;


        button.disabled =
          dirtyProducts.size ===
          0;

      }

    }

  }


  /* =====================================================
     EVENTS
  ===================================================== */

  function handleRootClick(
    event
  ) {

    /*
      CATEGORY
    */

    const categoryButton =
      event.target.closest(
        "[data-inventory-category]"
      );


    if (categoryButton) {

      currentCategory =
        categoryButton.dataset
          .inventoryCategory;


      renderCategories();

      renderProducts();

      return;

    }


    /*
      OPEN DAYS
    */

    const daysButton =
      event.target.closest(
        "[data-inventory-days-open]"
      );


    if (daysButton) {

      openDaysModal(
        daysButton.dataset
          .inventoryDaysOpen
      );

      return;

    }


    /*
      CLOSE MODAL
    */

    if (
      event.target.closest(
        "[data-inventory-days-close]"
      )
    ) {

      closeDaysModal();

      return;

    }


    /*
      CLEAR DAYS
    */

    if (
      event.target.closest(
        "[data-inventory-days-clear]"
      )
    ) {

      clearDaysModal();

      return;

    }

  }


  function handleRootChange(
    event
  ) {

    /*
      ROW SELECT
    */

    const rowSelect =
      event.target.closest(
        "[data-inventory-row-select]"
      );


    if (rowSelect) {

      const productId =
        rowSelect.dataset
          .inventoryRowSelect;


      if (
        rowSelect.checked
      ) {

        selectedProducts.add(
          productId
        );

      }

      else {

        selectedProducts.delete(
          productId
        );

      }


      updateSelectionUI();

      return;

    }


    /*
      DAILY / WEEKLY
    */

    const toggle =
      event.target.closest(
        "[data-inventory-list-toggle]"
      );


    if (!toggle) {
      return;
    }


    changeProductList(
      toggle.dataset
        .productId,

      toggle.dataset
        .listType,

      toggle.checked
    );

  }


  function handleDocumentKeydown(
    event
  ) {

    if (
      event.key ===
      "Escape"
    ) {

      closeDaysModal();

    }

  }


  function bindEvents() {

    root
      .querySelector(
        "#inventory-lists-search"
      )
      ?.addEventListener(
        "input",
        function (event) {

          searchQuery =
            event.target.value;


          renderProducts();

        }
      );


    root
      .querySelector(
        "#inventory-lists-save-button"
      )
      ?.addEventListener(
        "click",
        saveChanges
      );


    root
      .querySelector(
        "#inventory-lists-select-all"
      )
      ?.addEventListener(
        "change",
        function (event) {

          toggleSelectAll(
            event.target.checked
          );

        }
      );


    root
      .querySelector(
        "#inventory-lists-add-daily"
      )
      ?.addEventListener(
        "click",
        function () {

          applyBulk(
            "daily"
          );

        }
      );


    root
      .querySelector(
        "#inventory-lists-add-weekly"
      )
      ?.addEventListener(
        "click",
        function () {

          applyBulk(
            "weekly"
          );

        }
      );


    root
      .querySelector(
        "#inventory-lists-remove"
      )
      ?.addEventListener(
        "click",
        function () {

          applyBulk(
            "remove"
          );

        }
      );


    root
      .querySelector(
        "#inventory-days-apply"
      )
      ?.addEventListener(
        "click",
        applyDaysModal
      );


    root.addEventListener(
      "click",
      handleRootClick
    );


    root.addEventListener(
      "change",
      handleRootChange
    );


    document.removeEventListener(
      "keydown",
      handleDocumentKeydown
    );


    document.addEventListener(
      "keydown",
      handleDocumentKeydown
    );

  }


  /* =====================================================
     RENDER ALL
  ===================================================== */

  function renderAll() {

    renderStats();

    renderCategories();

    renderProducts();

    updateSelectionUI();

    updateSaveButton();

  }


  /* =====================================================
     INIT
  ===================================================== */

  async function init(
    container
  ) {

    root =
      container.querySelector(
        "#inventory-lists-page"
      );


    if (!root) {

      throw new Error(
        "Inventory Lists root не найден."
      );

    }


    userId =
      null;

    restaurantId =
      null;

    products =
      [];

    savedSchedules =
      new Map();

    draftSchedules =
      new Map();

    dirtyProducts =
      new Set();

    selectedProducts =
      new Set();

    currentCategory =
      "all";

    searchQuery =
      "";

    editingDaysProductId =
      null;


    bindEvents();


    try {

      await loadUserContext();


      await loadProducts();


      await loadListItems();


      renderAll();


      console.log(
        "[Inventory Lists] initialized",
        {
          restaurant_id:
            restaurantId,

          products:
            products.length
        }
      );


    } catch (error) {

      console.error(
        "Inventory Lists init:",
        error
      );


      const loading =
        root.querySelector(
          "#inventory-lists-loading"
        );


      if (loading) {

        loading.innerHTML = `
          <strong>
            Ошибка загрузки
          </strong>

          <br><br>

          ${escapeHTML(
            error.message ||
            String(error)
          )}
        `;

      }

    }

  }


  /* =====================================================
     PUBLIC API
  ===================================================== */

  window.InventoryLists = {

    init,


    reload:
      async function () {

        if (
          !root ||
          !restaurantId
        ) {
          return;
        }


        await loadProducts();

        await loadListItems();

        renderAll();

      }

  };

})();