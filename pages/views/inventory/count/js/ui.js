/* =====================================================
   IZAKAZ v0.2.0
   INVENTORY COUNT — UI
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


  const TYPE_NAMES = {
    daily: "Ежедневная инвентаризация",
    weekly: "Еженедельная инвентаризация",
    monthly: "Ежемесячная инвентаризация"
  };


  /* =====================================================
     LOCAL STATE
  ===================================================== */

  let app = null;

  let searchQuery = "";

  let currentCategory = "all";


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


  function getCategoryName(category) {

    return (
      CATEGORY_NAMES[category] ||
      category ||
      "Другое"
    );

  }


  function parseDate(dateString) {

    const [
      year,
      month,
      day
    ] =
      String(dateString)
        .split("-")
        .map(Number);


    return new Date(
      year,
      month - 1,
      day
    );

  }


  function formatDate(dateString) {

    if (!dateString) {
      return "—";
    }


    return new Intl.DateTimeFormat(
      "ru-RU",
      {
        day: "2-digit",
        month: "long",
        year: "numeric"
      }
    ).format(
      parseDate(
        dateString
      )
    );

  }


  function formatWeekday(dateString) {

    if (!dateString) {
      return "—";
    }


    const text =
      new Intl.DateTimeFormat(
        "ru-RU",
        {
          weekday: "long"
        }
      ).format(
        parseDate(
          dateString
        )
      );


    return (
      text.charAt(0).toUpperCase()
      +
      text.slice(1)
    );

  }


  function formatQuantity(value) {

    const number =
      Number(value || 0);


    if (
      Number.isInteger(
        number
      )
    ) {

      return String(number);

    }


    return number
      .toFixed(3)
      .replace(
        /\.?0+$/,
        ""
      );

  }


  /* =====================================================
     PRODUCT TOTAL
  ===================================================== */

  function getProductTotalSummary(
    productId
  ) {

    const counting =
      window.InventoryCountCounting;


    if (
      !counting ||
      typeof counting.getProductTotals !==
        "function"
    ) {

      return "";

    }


    const totals =
      counting.getProductTotals(
        productId
      );


    if (
      !totals ||
      !totals.size
    ) {

      return "";

    }


    return Array.from(
      totals.entries()
    )
      .map(
        function (
          [
            unit,
            quantity
          ]
        ) {

          return (
            `${formatQuantity(
              quantity
            )} ${unit}`
          );

        }
      )
      .join(" · ");

  }


  /* =====================================================
     FILTER
  ===================================================== */

  function getFilteredProducts() {

    const query =
      searchQuery
        .trim()
        .toLowerCase();


    return app.state.products.filter(
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


        const searchText =
          [
            product.name,
            product.iiko_code,
            product.iiko_name,
            getCategoryName(
              product.category
            )
          ]
            .join(" ")
            .toLowerCase();


        return searchText.includes(
          query
        );

      }
    );

  }


  /* =====================================================
     SESSION
  ===================================================== */

  function renderSession() {

    const state =
      app.state;


    const dateElement =
      app.root.querySelector(
        "#inventory-session-date"
      );


    const weekdayElement =
      app.root.querySelector(
        "#inventory-session-weekday"
      );


    const typeElement =
      app.root.querySelector(
        "#inventory-session-type"
      );


    const statusElement =
      app.root.querySelector(
        "#inventory-session-status"
      );


    if (dateElement) {

      dateElement.textContent =
        formatDate(
          state.inventoryDate
        );

    }


    if (weekdayElement) {

      weekdayElement.textContent =
        formatWeekday(
          state.inventoryDate
        );

    }


    if (typeElement) {

      typeElement.textContent =
        TYPE_NAMES[
          state.inventoryType
        ]
        ||
        state.inventoryType
        ||
        "—";

    }


    if (statusElement) {

      const completed =
        state.sessionStatus ===
        "completed";


      statusElement.textContent =
        completed
          ? "Завершена"
          : "В процессе";


      statusElement.classList.toggle(
        "is-completed",
        completed
      );

    }

  }


  /* =====================================================
     STATS
  ===================================================== */

  function renderStats() {

    const total =
      app.state.products.length;


    const counting =
      window.InventoryCountCounting;


    const counted =
      (
        counting &&
        typeof counting.getCountedProductIds ===
          "function"
      )
        ? counting
            .getCountedProductIds()
            .size
        : 0;


    const remaining =
      Math.max(
        total - counted,
        0
      );


    const percentage =
      total > 0
        ? (
            counted /
            total
          ) * 100
        : 0;


    const totalElement =
      app.root.querySelector(
        "#inventory-products-count"
      );


    const countedElement =
      app.root.querySelector(
        "#inventory-counted-count"
      );


    const remainingElement =
      app.root.querySelector(
        "#inventory-remaining-count"
      );


    const progressText =
      app.root.querySelector(
        "#inventory-progress-text"
      );


    const progressBar =
      app.root.querySelector(
        "#inventory-progress-bar"
      );


    const footerProgress =
      app.root.querySelector(
        "#inventory-footer-progress"
      );

    const printButton =
      app.root.querySelector(
        "#inventory-print-button"
      );
    
    if (printButton) {

      printButton.disabled =
        (
          total === 0 ||
          counted < total
        );

    }
  

    const completeButton =
      app.root.querySelector(
        "#inventory-complete-button"
      );


    if (totalElement) {

      totalElement.textContent =
        String(total);

    }


    if (countedElement) {

      countedElement.textContent =
        String(counted);

    }


    if (remainingElement) {

      remainingElement.textContent =
        String(remaining);

    }


    if (progressText) {

      progressText.textContent =
        `${counted} / ${total}`;

    }


    if (progressBar) {

      progressBar.style.width =
        `${percentage}%`;

    }


    if (footerProgress) {

      footerProgress.textContent =
        `Посчитано ${counted} из ${total}`;

    }


    if (completeButton) {

      const completed =
        app.state.sessionStatus ===
        "completed";


      completeButton.disabled =
        (
          completed ||
          total === 0 ||
          counted < total
        );


      completeButton.textContent =
        completed
          ? "Инвентаризация завершена"
          : "Завершить инвентаризацию";

    }

  }


  /* =====================================================
     CATEGORIES
  ===================================================== */

  function getCategories() {

    const available =
      new Set(
        app.state.products.map(
          function (product) {

            return product.category;

          }
        )
      );


    const known =
      CATEGORY_ORDER.filter(
        function (category) {

          return available.has(
            category
          );

        }
      );


    const unknown =
      Array.from(
        available
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
      app.root.querySelector(
        "#inventory-count-categories"
      );


    if (!container) {
      return;
    }


    const categories =
      getCategories();


    container.innerHTML = `

      <button
        class="
          inventory-count-category
          ${
            currentCategory === "all"
              ? "is-active"
              : ""
          }
        "
        type="button"
        data-count-category="all"
      >
        Все · ${app.state.products.length}
      </button>


      ${categories
        .map(
          function (category) {

            const count =
              app.state.products.filter(
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
                  inventory-count-category
                  ${
                    currentCategory ===
                      category
                      ? "is-active"
                      : ""
                  }
                "
                type="button"
                data-count-category="${escapeHTML(
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
     GROUP PRODUCTS
  ===================================================== */

  function groupProducts(products) {

    const groups =
      new Map();


    products.forEach(
      function (product) {

        const category =
          product.category ||
          "other";


        if (
          !groups.has(
            category
          )
        ) {

          groups.set(
            category,
            []
          );

        }


        groups
          .get(category)
          .push(product);

      }
    );


    return groups;

  }


  /* =====================================================
     PRODUCT CARD
  ===================================================== */

  function renderProductCard(
    product
  ) {

    const counting =
      window.InventoryCountCounting;


    const counted =
      Boolean(
        counting &&
        typeof counting.isProductCounted ===
          "function" &&
        counting.isProductCounted(
          product.id
        )
      );


    const totalSummary =
      counted
        ? getProductTotalSummary(
            product.id
          )
        : "";


    return `

      <article
        class="
          inventory-product-card
          ${
            counted
              ? "is-counted"
              : ""
          }
        "
        data-product-id="${escapeHTML(
          product.id
        )}"
      >

        <div
          class="inventory-product-card-content"
        >

          <h4
            class="inventory-product-name"
          >
            ${escapeHTML(
              product.name
            )}
          </h4>


          <div
            class="inventory-product-meta"
          >

            <span>
              IIKO:
              ${escapeHTML(
                product.iiko_code ||
                "—"
              )}
            </span>


            <span
              class="
                inventory-product-category-chip
              "
            >
              ${escapeHTML(
                getCategoryName(
                  product.category
                )
              )}
            </span>

          </div>


          <div
            class="
              inventory-product-card-result
              ${
                counted
                  ? "is-counted"
                  : ""
              }
            "
          >

            ${
              counted
                ? escapeHTML(
                    totalSummary ||
                    "Посчитано"
                  )
                : "Не посчитано"
            }

          </div>

        </div>


        <button
          class="
            inventory-product-count-button
            ${
              counted
                ? "is-counted"
                : ""
            }
          "
          type="button"
          data-count-product="${escapeHTML(
            product.id
          )}"
        >

          ${
            counted
              ? "Продолжить"
              : "Начать подсчёт"
          }

        </button>

      </article>

    `;

  }


  /* =====================================================
     PRODUCTS
  ===================================================== */

  function renderProducts() {

    const loading =
      app.root.querySelector(
        "#inventory-products-loading"
      );


    const empty =
      app.root.querySelector(
        "#inventory-products-empty"
      );


    const list =
      app.root.querySelector(
        "#inventory-products-list"
      );


    const visibleCount =
      app.root.querySelector(
        "#inventory-visible-products-count"
      );


    if (
      !loading ||
      !empty ||
      !list
    ) {

      return;

    }


    loading.hidden =
      true;


    const products =
      getFilteredProducts();


    if (visibleCount) {

      visibleCount.textContent =
        `${products.length} товаров`;

    }


    if (!products.length) {

      list.hidden =
        true;


      empty.hidden =
        false;


      list.innerHTML =
        "";


      return;

    }


    empty.hidden =
      true;


    list.hidden =
      false;


    const groups =
      groupProducts(
        products
      );


    const orderedCategories =
      [
        ...CATEGORY_ORDER,

        ...Array.from(
          groups.keys()
        )
          .filter(
            function (category) {

              return (
                !CATEGORY_ORDER.includes(
                  category
                )
              );

            }
          )
      ];


    list.innerHTML =
      orderedCategories
        .filter(
          function (category) {

            return groups.has(
              category
            );

          }
        )
        .map(
          function (category) {

            const categoryProducts =
              groups.get(
                category
              );


            return `

              <section
                class="inventory-product-group"
              >

                <div
                  class="
                    inventory-product-group-header
                  "
                >

                  <div
                    class="
                      inventory-product-group-title
                    "
                  >

                    ${escapeHTML(
                      getCategoryName(
                        category
                      )
                    )}

                    <span>
                      ${categoryProducts.length}
                    </span>

                  </div>

                </div>


                <div
                  class="
                    inventory-product-grid
                  "
                >

                  ${categoryProducts
                    .map(
                      renderProductCard
                    )
                    .join("")}

                </div>

              </section>

            `;

          }
        )
        .join("");

  }


  /* =====================================================
     EVENTS
  ===================================================== */

  function bindEvents() {

    app.root
      .querySelector(
        "#inventory-count-search"
      )
      ?.addEventListener(
        "input",
        function (event) {

          searchQuery =
            event.target.value;


          renderProducts();

        }
      );


    app.root.addEventListener(
      "click",
      function (event) {

        const categoryButton =
          event.target.closest(
            "[data-count-category]"
          );


        if (categoryButton) {

          currentCategory =
            categoryButton
              .dataset
              .countCategory;


          renderCategories();

          renderProducts();


          return;

        }


        /*
          PRODUCT BUTTON
          count-modal.js арқылы ашылады.
        */


        

      }
    );

  }


  /* =====================================================
     INIT
  ===================================================== */

  async function init(application) {

    app =
      application;


    if (
      !app ||
      !app.root
    ) {

      throw new Error(
        "Inventory UI: root не найден."
      );

    }


    searchQuery =
      "";


    currentCategory =
      "all";


    renderSession();

    renderStats();

    renderCategories();

    renderProducts();

    bindEvents();


    console.log(
      "[Inventory UI] ready",
      {
        date:
          app.state.inventoryDate,

        type:
          app.state.inventoryType,

        products:
          app.state.products.length
      }
    );

  }


  /* =====================================================
     PUBLIC API
  ===================================================== */

  window.InventoryCountUI = {

    init,


    refresh:
      function () {

        if (!app) {
          return;
        }


        renderSession();

        renderStats();

        renderCategories();

        renderProducts();

      }

  };

})();