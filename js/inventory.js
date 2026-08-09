/* =====================================================
   СТРАНИЦА ИНВЕНТАРИЗАЦИИ
===================================================== */

(function () {
  "use strict";


  /* =====================================================
     ДНИ НЕДЕЛИ В ФОРМАТЕ БАЗЫ

     1 — Понедельник
     2 — Вторник
     3 — Среда
     4 — Четверг
     5 — Пятница
     6 — Суббота
     7 — Воскресенье
  ===================================================== */

  const WEEKDAYS = {
    1: "Понедельник",
    2: "Вторник",
    3: "Среда",
    4: "Четверг",
    5: "Пятница",
    6: "Суббота",
    7: "Воскресенье"
  };


  const MONTHS = [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря"
  ];


  const state = {
    userId: null,
    restaurantId: null,

    restaurantName: "Ресторан",
    restaurantCode: "—",

    selectedWeekday: null,

    categories: [],
    products: [],
    dayItems: [],

    requestVersion: 0
  };


  /* =====================================================
     ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
  ===================================================== */

  function getElement(id) {
    return document.getElementById(id);
  }


  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }


  function setText(
    elementIds,
    value
  ) {
    elementIds.forEach(
      function (elementId) {
        const element =
          getElement(elementId);

        if (element) {
          element.textContent =
            value;
        }
      }
    );
  }


  /* =====================================================
     ЛОКАЛЬНАЯ ДАТА YYYY-MM-DD
  ===================================================== */

  function getLocalISODate(
    date = new Date()
  ) {
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


  /* =====================================================
     ПАРСИНГ ДАТЫ БЕЗ СДВИГА ЧАСОВОГО ПОЯСА
  ===================================================== */

  function parseDate(dateString) {
    if (!dateString) {
      return null;
    }

    const parts =
      dateString
        .split("-")
        .map(Number);

    if (parts.length !== 3) {
      return null;
    }

    const [
      year,
      month,
      day
    ] = parts;

    const date =
      new Date(
        year,
        month - 1,
        day
      );

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return null;
    }

    return date;
  }


  /* =====================================================
     ПЕРЕВОД ДНЯ JAVASCRIPT В ДЕНЬ БАЗЫ

     JavaScript:
     0 — воскресенье
     1 — понедельник
     ...
     6 — суббота

     База:
     1 — понедельник
     ...
     7 — воскресенье
  ===================================================== */

  function getDatabaseWeekday(date) {
    const jsWeekday =
      date.getDay();

    return jsWeekday === 0
      ? 7
      : jsWeekday;
  }


  /* =====================================================
     ФОРМАТИРОВАНИЕ ДАТЫ
  ===================================================== */

  function formatDate(date) {
    if (!date) {
      return "Дата не выбрана";
    }

    const day =
      String(
        date.getDate()
      ).padStart(2, "0");

    const month =
      MONTHS[
        date.getMonth()
      ];

    const year =
      date.getFullYear();

    return `${day} ${month} ${year} г.`;
  }


  /* =====================================================
     ФОРМАТ КОДА РЕСТОРАНА
  ===================================================== */

  function formatRestaurantCode(code) {
    if (!code) {
      return "—";
    }

    const cleanCode =
      String(code)
        .replace(/\D/g, "");

    if (
      cleanCode.length === 5
    ) {
      return (
        cleanCode.slice(0, 2) +
        "-" +
        cleanCode.slice(2)
      );
    }

    return String(code);
  }


  /* =====================================================
     ЗАГРУЗКА ПРОФИЛЯ И РЕСТОРАНА
  ===================================================== */

  async function loadCurrentContext() {
    const {
      data: userData,
      error: userError
    } =
      await supabaseClient
        .auth
        .getUser();

    if (
      userError ||
      !userData.user
    ) {
      throw new Error(
        "Пользователь не авторизован."
      );
    }

    const user =
      userData.user;

    state.userId =
      user.id;


    const {
      data: profile,
      error: profileError
    } =
      await supabaseClient
        .from("profiles")
        .select(`
          restaurant_id,
          restaurant:restaurants (
            id,
            name,
            code
          )
        `)
        .eq(
          "id",
          user.id
        )
        .single();


    if (profileError) {
      throw profileError;
    }


    if (!profile?.restaurant_id) {
      throw new Error(
        "Ресторан пользователя не найден."
      );
    }


    state.restaurantId =
      profile.restaurant_id;


    state.restaurantName =
      profile.restaurant?.name ||
      user.user_metadata
        ?.restaurant_name ||
      "Ресторан";


    state.restaurantCode =
      formatRestaurantCode(
        profile.restaurant?.code ||
        user.user_metadata
          ?.restaurant_code
      );
  }


  /* =====================================================
     ЗАГРУЗКА КАТЕГОРИЙ
  ===================================================== */

  async function loadCategories() {
    const {
      data,
      error
    } =
      await supabaseClient
        .from(
          "inventory_categories"
        )
        .select(`
          id,
          name,
          sort_order,
          is_active
        `)
        .eq(
          "restaurant_id",
          state.restaurantId
        )
        .eq(
          "is_active",
          true
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


    state.categories =
      Array.isArray(data)
        ? data
        : [];
  }


  /* =====================================================
     ЗАГРУЗКА ТОВАРОВ
  ===================================================== */

  async function loadProducts() {
    const {
      data,
      error
    } =
      await supabaseClient
        .from(
          "inventory_products"
        )
        .select(`
          id,
          category_id,
          code,
          name,
          is_active
        `)
        .eq(
          "restaurant_id",
          state.restaurantId
        )
        .eq(
          "is_active",
          true
        );


    if (error) {
      throw error;
    }


    state.products =
      Array.isArray(data)
        ? data
        : [];
  }


  /* =====================================================
     ЗАГРУЗКА ПОЗИЦИЙ ВЫБРАННОГО ДНЯ
  ===================================================== */

  async function loadDayItems(
    weekday
  ) {
    const {
      data,
      error
    } =
      await supabaseClient
        .from(
          "inventory_day_items"
        )
        .select(`
          id,
          product_id,
          weekday,
          sort_order,
          is_active
        `)
        .eq(
          "restaurant_id",
          state.restaurantId
        )
        .eq(
          "weekday",
          weekday
        )
        .eq(
          "is_active",
          true
        )
        .order(
          "sort_order",
          {
            ascending: true
          }
        );


    if (error) {
      throw error;
    }


    state.dayItems =
      Array.isArray(data)
        ? data
        : [];
  }


  /* =====================================================
     ОБЪЕДИНЕНИЕ ДАННЫХ
  ===================================================== */

  function getSelectedProducts() {
    const productsMap =
      new Map(
        state.products.map(
          function (product) {
            return [
              product.id,
              product
            ];
          }
        )
      );


    const categoriesMap =
      new Map(
        state.categories.map(
          function (category) {
            return [
              category.id,
              category
            ];
          }
        )
      );


    return state.dayItems
      .map(
        function (dayItem) {
          const product =
            productsMap.get(
              dayItem.product_id
            );

          if (!product) {
            return null;
          }

          const category =
            categoriesMap.get(
              product.category_id
            );

          if (!category) {
            return null;
          }

          return {
            id:
              product.id,

            code:
              product.code,

            name:
              product.name,

            categoryId:
              category.id,

            categoryName:
              category.name,

            categorySortOrder:
              Number(
                category.sort_order
              ) || 0,

            itemSortOrder:
              Number(
                dayItem.sort_order
              ) || 0
          };
        }
      )
      .filter(Boolean)
      .sort(
        function (a, b) {
          if (
            a.categorySortOrder !==
            b.categorySortOrder
          ) {
            return (
              a.categorySortOrder -
              b.categorySortOrder
            );
          }

          return (
            a.itemSortOrder -
            b.itemSortOrder
          );
        }
      );
  }


  /* =====================================================
     СОСТОЯНИЕ ЗАГРУЗКИ
  ===================================================== */

  function renderLoadingState() {
    const tableBody =
      getElement(
        "inventory-table-body"
      );

    const countElement =
      getElement(
        "inventory-items-count"
      );

    if (countElement) {
      countElement.textContent =
        "—";
    }

    if (!tableBody) {
      return;
    }

    tableBody.innerHTML = `
      <tr class="inventory-empty-row">
        <td colspan="5">

          <div class="inventory-empty-state">
            <div>

              <strong>
                Загрузка списка...
              </strong>

              <span>
                Получаем позиции для выбранного дня.
              </span>

            </div>
          </div>

        </td>
      </tr>
    `;
  }


  /* =====================================================
     СОСТОЯНИЕ ОШИБКИ
  ===================================================== */

  function renderErrorState(
    message
  ) {
    const tableBody =
      getElement(
        "inventory-table-body"
      );

    const countElement =
      getElement(
        "inventory-items-count"
      );

    if (countElement) {
      countElement.textContent =
        "0";
    }

    if (!tableBody) {
      return;
    }

    tableBody.innerHTML = `
      <tr class="inventory-empty-row">
        <td colspan="5">

          <div class="inventory-empty-state">
            <div>

              <strong>
                Не удалось загрузить список
              </strong>

              <span>
                ${escapeHTML(
                  message ||
                  "Попробуйте обновить страницу."
                )}
              </span>

            </div>
          </div>

        </td>
      </tr>
    `;
  }


  /* =====================================================
     ПУСТОЙ СПИСОК
  ===================================================== */

  function renderEmptyState() {
    const tableBody =
      getElement(
        "inventory-table-body"
      );

    const countElement =
      getElement(
        "inventory-items-count"
      );

    if (countElement) {
      countElement.textContent =
        "0";
    }

    if (!tableBody) {
      return;
    }

    tableBody.innerHTML = `
      <tr class="inventory-empty-row">
        <td colspan="5">

          <div class="inventory-empty-state">
            <div>

              <strong>
                На выбранный день список пуст
              </strong>

              <span>
                Добавьте позиции в разделе
                «Списки инвентаризации».
              </span>

            </div>
          </div>

        </td>
      </tr>
    `;
  }


  /* =====================================================
     ОТОБРАЖЕНИЕ СПИСКА
  ===================================================== */

  function renderInventoryItems() {
    const tableBody =
      getElement(
        "inventory-table-body"
      );

    const countElement =
      getElement(
        "inventory-items-count"
      );

    if (
      !tableBody ||
      !countElement
    ) {
      return;
    }


    const items =
      getSelectedProducts();


    countElement.textContent =
      String(items.length);


    if (
      items.length === 0
    ) {
      renderEmptyState();
      return;
    }


    let currentCategoryId =
      null;

    let visibleRowIndex =
      0;

    const rows =
      [];


    items.forEach(
      function (item) {
        if (
          item.categoryId !==
          currentCategoryId
        ) {
          currentCategoryId =
            item.categoryId;

          rows.push(`
            <tr class="inventory-category-row">
              <td colspan="5">
                ${escapeHTML(
                  item.categoryName
                )}
              </td>
            </tr>
          `);
        }


        visibleRowIndex += 1;


        const rowClass =
          visibleRowIndex % 2 === 1
            ? "inventory-row-blue"
            : "inventory-row-white";


        const number =
          item.itemSortOrder > 0
            ? item.itemSortOrder
            : visibleRowIndex;


        const productTitle =
          item.code
            ? (
                escapeHTML(item.code) +
                "." +
                escapeHTML(item.name)
              )
            : escapeHTML(item.name);


        rows.push(`
          <tr
            class="inventory-product-row ${rowClass}"
          >

            <td class="inventory-number-cell">
              ${escapeHTML(number)}
            </td>

            <td class="inventory-name-cell">
              ${productTitle}
            </td>

            <td class="inventory-value-cell"></td>

            <td class="inventory-value-cell"></td>

            <td class="inventory-value-cell"></td>

          </tr>
        `);
      }
    );


    tableBody.innerHTML =
      rows.join("");
  }


  /* =====================================================
     ОТОБРАЖЕНИЕ ДАННЫХ РЕСТОРАНА
  ===================================================== */

  function renderRestaurantData() {
    setText(
      [
        "inventory-info-restaurant",
        "inventory-sheet-restaurant"
      ],
      state.restaurantName
    );


    setText(
      [
        "inventory-info-code",
        "inventory-sheet-code"
      ],
      state.restaurantCode
    );
  }


  /* =====================================================
     ОБНОВЛЕНИЕ ВЫБРАННОЙ ДАТЫ
  ===================================================== */

  async function updateInventoryDate() {
    const dateInput =
      getElement(
        "inventory-date"
      );


    if (!dateInput) {
      return;
    }


    const selectedDate =
      parseDate(
        dateInput.value
      );


    if (!selectedDate) {
      renderEmptyState();
      return;
    }


    const weekday =
      getDatabaseWeekday(
        selectedDate
      );


    const weekdayName =
      WEEKDAYS[weekday];


    const formattedDate =
      formatDate(
        selectedDate
      );


    state.selectedWeekday =
      weekday;


    setText(
      [
        "inventory-weekday",
        "topbar-weekday",
        "inventory-info-list-day",
        "inventory-sheet-weekday"
      ],
      weekdayName
    );


    setText(
      [
        "inventory-date-formatted",
        "inventory-sheet-date"
      ],
      formattedDate
    );


    renderLoadingState();


    const currentRequestVersion =
      ++state.requestVersion;


    try {
      await Promise.all([
        loadCategories(),
        loadProducts(),
        loadDayItems(weekday)
      ]);


      /*
        Если пользователь успел выбрать
        другую дату до завершения запроса.
      */

      if (
        currentRequestVersion !==
        state.requestVersion
      ) {
        return;
      }


      renderInventoryItems();

    } catch (error) {
      console.error(
        "Ошибка загрузки инвентаризации:",
        error
      );


      if (
        currentRequestVersion !==
        state.requestVersion
      ) {
        return;
      }


      renderErrorState(
        error.message
      );
    }
  }


  /* =====================================================
     ИНИЦИАЛИЗАЦИЯ СТРАНИЦЫ
  ===================================================== */

  async function initInventoryPage() {
    const page =
      document.querySelector(
        '[data-page="inventory"]'
      );


    if (!page) {
      return;
    }


    if (
      page.dataset.initialized ===
      "true"
    ) {
      return;
    }


    page.dataset.initialized =
      "true";


    const dateInput =
      getElement(
        "inventory-date"
      );


    const printButton =
      getElement(
        "inventory-print-button"
      );


    if (!dateInput) {
      console.error(
        "Не найден элемент #inventory-date"
      );

      return;
    }


    dateInput.value =
      getLocalISODate();


    dateInput.addEventListener(
      "change",
      updateInventoryDate
    );


    if (printButton) {
      printButton.addEventListener(
        "click",
        function () {
          window.print();
        }
      );
    }


    renderLoadingState();


    try {
      await loadCurrentContext();

      renderRestaurantData();

      await updateInventoryDate();

    } catch (error) {
      console.error(
        "Ошибка запуска страницы инвентаризации:",
        error
      );

      renderErrorState(
        error.message
      );
    }
  }


  /* =====================================================
     ДИНАМИЧЕСКАЯ ЗАГРУЗКА
  ===================================================== */

  document.addEventListener(
    "app:page-loaded",
    function (event) {
      if (
        event.detail?.route ===
        "inventory"
      ) {
        initInventoryPage();
      }
    }
  );


  /*
    Резервный запуск на случай,
    если страница уже вставлена.
  */

  window.setTimeout(
    initInventoryPage,
    0
  );

})();