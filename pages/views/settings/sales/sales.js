/* =====================================================
   IZAKAZ v0.2.0
   SETTINGS — SALES
===================================================== */

(function () {
  "use strict";


  /* =====================================================
     CONSTANTS
  ===================================================== */

  const DAYS = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday"
  ];


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


  const REVIEW_INTERVAL_DAYS =
    14;


  /* =====================================================
     STATE
  ===================================================== */

  let root = null;

  let userId = null;

  let restaurantId = null;

  let products = [];

  let usages =
    new Map();

  let dirtyProducts =
    new Set();

  let searchQuery = "";

  let currentCategory =
    "all";


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


  function parseNumber(value) {

    const raw =
      String(value ?? "")
        .trim()
        .replace(",", ".");


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

    if (
      value === null ||
      value === undefined
    ) {
      return "—";
    }


    return new Intl.NumberFormat(
      "ru-RU",
      {
        maximumFractionDigits: 4
      }
    ).format(
      Number(value)
    );

  }


  function formatDate(value) {

    if (!value) {
      return "—";
    }


    const date =
      new Date(
        `${value}T00:00:00`
      );


    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "—";
    }


    return new Intl.DateTimeFormat(
      "ru-RU",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }
    ).format(date);

  }


  function dateToISO(date) {

    const year =
      date.getFullYear();


    const month =
      String(
        date.getMonth() + 1
      ).padStart(
        2,
        "0"
      );


    const day =
      String(
        date.getDate()
      ).padStart(
        2,
        "0"
      );


    return `${year}-${month}-${day}`;

  }


  function addDays(
    dateValue,
    days
  ) {

    const date =
      new Date(
        `${dateValue}T00:00:00`
      );


    date.setDate(
      date.getDate() +
      days
    );


    return date;

  }


  function average(values) {

    if (!values.length) {
      return null;
    }


    const total =
      values.reduce(
        function (
          sum,
          value
        ) {

          return sum + value;

        },
        0
      );


    return total /
      values.length;

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


  function isUsageComplete(
    usage
  ) {

    if (!usage) {
      return false;
    }


    return DAYS.every(
      function (day) {

        const value =
          usage[day];


        return (
          value !== null &&
          value !== undefined &&
          Number.isFinite(
            Number(value)
          )
        );

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
        "#sales-message"
      );


    if (!element) {
      return;
    }


    element.hidden =
      false;


    element.className =
      `sales-message is-${type}`;


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
     USER CONTEXT
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
     LOAD PRODUCTS
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
     LOAD USAGES
  ===================================================== */

  async function loadUsages() {

    const {
      data,
      error
    } =
      await supabaseClient
        .from(
          "product_weekly_usage"
        )
        .select(`
          id,
          product_id,
          monday,
          tuesday,
          wednesday,
          thursday,
          friday,
          saturday,
          sunday,
          review_interval_days,
          last_reviewed_at,
          updated_at
        `)
        .eq(
          "restaurant_id",
          restaurantId
        );


    if (error) {
      throw error;
    }


    usages =
      new Map();


    (data || []).forEach(
      function (item) {

        usages.set(
          item.product_id,
          item
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

            return !CATEGORY_ORDER.includes(
              category
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
        "#sales-categories"
      );


    if (!container) {
      return;
    }


    const categories =
      getAvailableCategories();


    container.innerHTML = `

      <button
        class="
          sales-category
          ${
            currentCategory === "all"
              ? "is-active"
              : ""
          }
        "
        type="button"
        data-sales-category="all"
      >
        Все · ${products.length}
      </button>


      ${categories
        .map(
          function (category) {

            const categoryProducts =
              products.filter(
                function (product) {

                  return (
                    product.category ===
                    category
                  );

                }
              );


            return `
              <button
                class="
                  sales-category
                  ${
                    currentCategory ===
                      category
                      ? "is-active"
                      : ""
                  }
                "
                type="button"
                data-sales-category="${escapeHTML(
                  category
                )}"
              >
                ${escapeHTML(
                  getCategoryName(
                    category
                  )
                )}
                ·
                ${categoryProducts.length}
              </button>
            `;

          }
        )
        .join("")}

    `;

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
     LOCAL USAGE STATE
  ===================================================== */

  function getOrCreateUsage(
    productId
  ) {

    let usage =
      usages.get(
        productId
      );


    if (usage) {
      return usage;
    }


    usage = {
      product_id:
        productId,

      monday: null,
      tuesday: null,
      wednesday: null,
      thursday: null,
      friday: null,
      saturday: null,
      sunday: null,

      review_interval_days:
        REVIEW_INTERVAL_DAYS,

      last_reviewed_at:
        null
    };


    usages.set(
      productId,
      usage
    );


    return usage;

  }


  function updateLocalUsage(
    productId,
    day,
    value
  ) {

    const usage =
      getOrCreateUsage(
        productId
      );


    usage[day] =
      parseNumber(
        value
      );

  }


  /* =====================================================
     AVERAGE
  ===================================================== */

  function getAverageForProduct(
    productId
  ) {

    const usage =
      usages.get(
        productId
      );


    if (!usage) {
      return null;
    }


    const values =
      DAYS
        .map(
          function (day) {

            const value =
              usage[day];


            if (
              value === null ||
              value === undefined
            ) {
              return null;
            }


            const number =
              Number(value);


            return Number.isFinite(
              number
            )
              ? number
              : null;

          }
        )
        .filter(
          function (value) {

            return value !== null;

          }
        );


    return average(
      values
    );

  }


  /* =====================================================
     TABLE
  ===================================================== */

  function renderProducts() {

    const body =
      root.querySelector(
        "#sales-table-body"
      );


    const loading =
      root.querySelector(
        "#sales-loading"
      );


    const empty =
      root.querySelector(
        "#sales-empty"
      );


    const tableWrap =
      root.querySelector(
        "#sales-table-wrap"
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

            const usage =
              usages.get(
                product.id
              );


            const rowValues =
              DAYS.map(
                function (day) {

                  const value =
                    usage?.[day];


                  const hasValue =
                    value !== null &&
                    value !== undefined;


                  return `
                    <td>

                      <input
                        class="
                          sales-day-input
                          ${
                            hasValue
                              ? ""
                              : "is-empty"
                          }
                        "
                        type="number"
                        min="0"
                        step="0.0001"
                        inputmode="decimal"

                        value="${
                          hasValue
                            ? escapeHTML(
                                String(value)
                              )
                            : ""
                        }"

                        data-sales-product="${escapeHTML(
                          product.id
                        )}"

                        data-sales-day="${escapeHTML(
                          day
                        )}"
                      >

                    </td>
                  `;

                }
              )
              .join("");


            const averageValue =
              getAverageForProduct(
                product.id
              );


            const dirtyClass =
              dirtyProducts.has(
                product.id
              )
                ? "is-dirty"
                : "";


            return `
              <tr
                class="${dirtyClass}"

                data-sales-row="${escapeHTML(
                  product.id
                )}"
              >

                <td>

                  <div class="sales-product">

                    <strong>
                      ${escapeHTML(
                        product.name
                      )}
                    </strong>

                    <span>
                      IIKO:
                      ${escapeHTML(
                        product.iiko_code
                      )}
                    </span>

                  </div>

                </td>


                <td>
                  ${escapeHTML(
                    product.iiko_unit ||
                    "—"
                  )}
                </td>


                ${rowValues}


                <td
                  class="sales-average"

                  data-sales-average="${escapeHTML(
                    product.id
                  )}"
                >
                  ${
                    averageValue === null
                      ? "—"
                      : escapeHTML(
                          formatNumber(
                            averageValue
                          )
                        )
                  }
                </td>


                <td class="sales-reviewed">

                  ${
                    usage?.last_reviewed_at
                      ? escapeHTML(
                          formatDate(
                            usage.last_reviewed_at
                          )
                        )
                      : "Не настроено"
                  }

                </td>

              </tr>
            `;

          }
        )
        .join("");

  }


  /* =====================================================
     UPDATE AVERAGE
  ===================================================== */

  function updateAverage(
    productId
  ) {

    const averageValue =
      getAverageForProduct(
        productId
      );


    const output =
      root.querySelector(
        `[data-sales-average="${productId}"]`
      );


    if (!output) {
      return;
    }


    output.textContent =
      averageValue === null
        ? "—"
        : formatNumber(
            averageValue
          );

  }


  /* =====================================================
     DIRTY
  ===================================================== */

  function markDirty(
    productId
  ) {

    dirtyProducts.add(
      productId
    );


    const row =
      root.querySelector(
        `[data-sales-row="${productId}"]`
      );


    row?.classList.add(
      "is-dirty"
    );


    const button =
      root.querySelector(
        "#sales-save-button"
      );


    if (button) {
      button.disabled = false;
    }

  }


  /* =====================================================
     REVIEW STATUS
  ===================================================== */

  function renderReviewStatus() {

    const lastElement =
      root.querySelector(
        "#sales-last-review"
      );


    const nextElement =
      root.querySelector(
        "#sales-next-review"
      );


    const statusElement =
      root.querySelector(
        "#sales-review-status"
      );


    if (
      !lastElement ||
      !nextElement ||
      !statusElement
    ) {
      return;
    }


    const configured =
      products
        .map(
          function (product) {

            return usages.get(
              product.id
            );

          }
        )
        .filter(
          function (usage) {

            return (
              isUsageComplete(
                usage
              ) &&
              usage.last_reviewed_at
            );

          }
        );


    if (
      configured.length <
      products.length
    ) {

      lastElement.textContent =
        configured.length
          ? "Частично"
          : "—";


      nextElement.textContent =
        "После заполнения";


      statusElement.className =
        "sales-review-status is-warning";


      statusElement.textContent =
        `Не настроено: ${
          products.length -
          configured.length
        }`;


      return;

    }


    if (!configured.length) {

      lastElement.textContent =
        "—";

      nextElement.textContent =
        "—";

      statusElement.className =
        "sales-review-status is-warning";

      statusElement.textContent =
        "Нет данных";

      return;

    }


    const reviewDates =
      configured
        .map(
          function (item) {

            return item.last_reviewed_at;

          }
        )
        .filter(Boolean)
        .sort();


    const oldestReview =
      reviewDates[0];


    const interval =
      Math.min(
        ...configured.map(
          function (item) {

            return Number(
              item.review_interval_days ||
              REVIEW_INTERVAL_DAYS
            );

          }
        )
      );


    const nextDate =
      addDays(
        oldestReview,
        interval
      );


    const today =
      new Date();


    today.setHours(
      0,
      0,
      0,
      0
    );


    const daysRemaining =
      Math.ceil(
        (
          nextDate.getTime() -
          today.getTime()
        )
        /
        86400000
      );


    lastElement.textContent =
      formatDate(
        oldestReview
      );


    nextElement.textContent =
      new Intl.DateTimeFormat(
        "ru-RU",
        {
          day: "2-digit",
          month: "2-digit",
          year: "numeric"
        }
      ).format(
        nextDate
      );


    if (daysRemaining < 0) {

      statusElement.className =
        "sales-review-status is-overdue";


      statusElement.textContent =
        `Требуется проверка · просрочено на ${Math.abs(
          daysRemaining
        )} дн.`;

    }

    else if (daysRemaining <= 3) {

      statusElement.className =
        "sales-review-status is-warning";


      statusElement.textContent =
        `Скоро проверка · через ${daysRemaining} дн.`;

    }

    else {

      statusElement.className =
        "sales-review-status is-current";


      statusElement.textContent =
        `Актуально · проверка через ${daysRemaining} дн.`;

    }

  }


  /* =====================================================
     COLLECT VALUES FROM STATE
  ===================================================== */

  function collectProductValues(
    productId
  ) {

    const usage =
      usages.get(
        productId
      );


    if (!usage) {
      return null;
    }


    const result = {};


    for (const day of DAYS) {

      const value =
        usage[day];


      if (
        value === null ||
        value === undefined ||
        !Number.isFinite(
          Number(value)
        ) ||
        Number(value) < 0
      ) {

        return null;

      }


      result[day] =
        Number(value);

    }


    return result;

  }


  /* =====================================================
     SAVE
  ===================================================== */

  async function saveChanges() {

    if (!dirtyProducts.size) {
      return;
    }


    const button =
      root.querySelector(
        "#sales-save-button"
      );


    const payload = [];


    for (
      const productId
      of dirtyProducts
    ) {

      const values =
        collectProductValues(
          productId
        );


      if (!values) {

        const product =
          products.find(
            function (item) {

              return (
                item.id ===
                productId
              );

            }
          );


        showMessage(
          `Заполните ПН–ВС: ${
            product?.name ||
            "товар"
          }.`,
          "error"
        );


        return;

      }


      payload.push({

        restaurant_id:
          restaurantId,

        product_id:
          productId,

        ...values,

        review_interval_days:
          REVIEW_INTERVAL_DAYS,

        last_reviewed_at:
          dateToISO(
            new Date()
          )

      });

    }


    button.disabled =
      true;


    const originalText =
      button.textContent;


    button.textContent =
      "Сохранение...";


    try {

      const {
        error
      } =
        await supabaseClient
          .from(
            "product_weekly_usage"
          )
          .upsert(
            payload,
            {
              onConflict:
                "restaurant_id,product_id"
            }
          );


      if (error) {
        throw error;
      }


      dirtyProducts.clear();


      await loadUsages();


      renderCategories();

      renderProducts();

      renderReviewStatus();


      showMessage(
        "Реализация сохранена. Следующая проверка через 14 дней."
      );


    } catch (error) {

      console.error(
        "Sales save:",
        error
      );


      showMessage(
        error.message ||
        "Не удалось сохранить реализацию.",
        "error"
      );


    } finally {

      button.textContent =
        originalText;


      button.disabled =
        dirtyProducts.size ===
        0;

    }

  }


  /* =====================================================
     EVENTS
  ===================================================== */

  function bindEvents() {

    root
      .querySelector(
        "#sales-search"
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
        "#sales-save-button"
      )
      ?.addEventListener(
        "click",
        saveChanges
      );


    root.addEventListener(
      "click",
      function (event) {

        const categoryButton =
          event.target.closest(
            "[data-sales-category]"
          );


        if (!categoryButton) {
          return;
        }


        currentCategory =
          categoryButton.dataset
            .salesCategory;


        renderCategories();

        renderProducts();

      }
    );


    root.addEventListener(
      "input",
      function (event) {

        const input =
          event.target.closest(
            "[data-sales-product]"
          );


        if (!input) {
          return;
        }


        const productId =
          input.dataset
            .salesProduct;


        const day =
          input.dataset
            .salesDay;


        updateLocalUsage(
          productId,
          day,
          input.value
        );


        if (
          input.value.trim() === ""
        ) {

          input.classList.add(
            "is-empty"
          );

        }

        else {

          input.classList.remove(
            "is-empty"
          );

        }


        markDirty(
          productId
        );


        updateAverage(
          productId
        );

      }
    );

  }


  /* =====================================================
     INIT
  ===================================================== */

  async function init(
    container
  ) {

    root =
      container.querySelector(
        "#sales-settings"
      );


    if (!root) {

      throw new Error(
        "Sales settings root не найден."
      );

    }


    userId =
      null;

    restaurantId =
      null;

    products =
      [];

    usages =
      new Map();

    dirtyProducts =
      new Set();

    searchQuery =
      "";

    currentCategory =
      "all";


    bindEvents();


    try {

      await loadUserContext();


      await Promise.all([
        loadProducts(),
        loadUsages()
      ]);


      renderCategories();

      renderProducts();

      renderReviewStatus();


      console.log(
        "[Sales Settings] initialized",
        {
          restaurant_id:
            restaurantId,

          products:
            products.length,

          configured:
            usages.size
        }
      );


    } catch (error) {

      console.error(
        "Sales Settings init:",
        error
      );


      const loading =
        root.querySelector(
          "#sales-loading"
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

  window.SalesSettings = {
    init
  };

})();