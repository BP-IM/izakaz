/* =====================================================
   I’M | ЗАКАЗ
   ГЛАВНАЯ
===================================================== */

(function () {
  "use strict";


  const WEEKDAYS = [
    "ПН",
    "ВТ",
    "СР",
    "ЧТ",
    "ПТ",
    "СБ",
    "ВС"
  ];


  let root = null;

  let restaurantId = null;

  let selectedInventoryDate =
    "";


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


  function parseLocalDate(value) {

    const match =
      String(value || "")
        .match(
          /^(\d{4})-(\d{2})-(\d{2})$/
        );


    if (!match) {
      return null;
    }


    const date =
      new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3])
      );


    if (
      date.getFullYear() !==
        Number(match[1]) ||
      date.getMonth() !==
        Number(match[2]) - 1 ||
      date.getDate() !==
        Number(match[3])
    ) {
      return null;
    }


    return date;

  }


  function addDays(
    value,
    amount
  ) {

    const date =
      value instanceof Date
        ? new Date(value)
        : parseLocalDate(value);


    if (!date) {
      return null;
    }


    date.setDate(
      date.getDate() +
      Number(amount || 0)
    );


    return date;

  }


  function formatDate(
    value,
    options = {}
  ) {

    const date =
      value instanceof Date
        ? value
        : parseLocalDate(value);


    if (!date) {
      return "—";
    }


    return new Intl.DateTimeFormat(
      "ru-RU",
      {
        day: "2-digit",
        month:
          options.short
            ? "2-digit"
            : "long",
        year:
          options.withYear === false
            ? undefined
            : "numeric"
      }
    ).format(date);

  }


  function formatNumber(value) {

    const number =
      Number(value || 0);


    if (!Number.isFinite(number)) {
      return "0";
    }


    return new Intl.NumberFormat(
      "ru-RU",
      {
        maximumFractionDigits: 2
      }
    ).format(number);

  }


  function getDateDifference(
    fromValue,
    toValue
  ) {

    const from =
      parseLocalDate(fromValue);


    const to =
      parseLocalDate(toValue);


    if (
      !from ||
      !to
    ) {
      return null;
    }


    return Math.round(
      (
        to.getTime() -
        from.getTime()
      ) /
      86400000
    );

  }


  function getExpiryLabel(
    expiryDate
  ) {

    const difference =
      getDateDifference(
        getLocalISODate(),
        expiryDate
      );


    if (difference === 0) {
      return "Сегодня";
    }


    if (difference === 1) {
      return "Завтра";
    }


    return `Через ${difference} дн.`;

  }


  function getCurrentWeekDates() {

    const today =
      new Date();


    const isoWeekday =
      today.getDay() === 0
        ? 7
        : today.getDay();


    const monday =
      new Date(today);


    monday.setHours(
      0,
      0,
      0,
      0
    );


    monday.setDate(
      monday.getDate() -
      (isoWeekday - 1)
    );


    return WEEKDAYS.map(
      function (weekday, index) {

        const date =
          addDays(
            monday,
            index
          );


        return {
          weekday,
          date,
          isoDate:
            getLocalISODate(
              date
            )
        };

      }
    );

  }


  /* =====================================================
     CONTEXT
  ===================================================== */

  async function loadContext() {

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


    const {
      data: profile,
      error: profileError
    } =
      await supabaseClient

        .from(
          "profiles"
        )

        .select(`
          restaurant_id,
          full_name
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
        "У пользователя не указан ресторан."
      );

    }


    restaurantId =
      profile.restaurant_id;


    const fullName =
      profile.full_name ||
      user.user_metadata
        ?.full_name ||
      "";


    const firstName =
      String(fullName)
        .trim()
        .split(/\s+/)
        .filter(Boolean)[0] ||
      "";


    const welcomeTitle =
      root.querySelector(
        "#home-welcome-title"
      );


    if (welcomeTitle) {

      welcomeTitle.textContent =
        firstName
          ? `Добрый день, ${firstName}!`
          : "Добрый день!";

    }

  }


  /* =====================================================
     EXPIRY DATA
  ===================================================== */

  async function loadExpiryItems() {

    const today =
      getLocalISODate();


    const endDate =
      getLocalISODate(
        addDays(
          new Date(),
          3
        )
      );


    const {
      data: weeklyOrder,
      error: orderError
    } =
      await supabaseClient

        .from(
          "weekly_orders"
        )

        .select(`
          id,
          updated_at
        `)

        .eq(
          "restaurant_id",
          restaurantId
        )

        .order(
          "updated_at",
          {
            ascending: false
          }
        )

        .limit(1)

        .maybeSingle();


    if (orderError) {
      throw orderError;
    }


    if (!weeklyOrder?.id) {
      return [];
    }


    const {
      data: lots,
      error: lotsError
    } =
      await supabaseClient

        .from(
          "weekly_order_stock_lots"
        )

        .select(`
          product_id,
          expiry_date,
          base_qty
        `)

        .eq(
          "weekly_order_id",
          weeklyOrder.id
        )

        .gte(
          "expiry_date",
          today
        )

        .lte(
          "expiry_date",
          endDate
        )

        .gt(
          "base_qty",
          0
        )

        .order(
          "expiry_date",
          {
            ascending: true
          }
        );


    if (lotsError) {
      throw lotsError;
    }


    if (!lots?.length) {
      return [];
    }


    const productIds =
      Array.from(
        new Set(
          lots.map(
            function (lot) {
              return lot.product_id;
            }
          )
        )
      );


    const {
      data: products,
      error: productsError
    } =
      await supabaseClient

        .from(
          "order_products"
        )

        .select(`
          id,
          name,
          iiko_code,
          iiko_unit
        `)

        .eq(
          "restaurant_id",
          restaurantId
        )

        .in(
          "id",
          productIds
        );


    if (productsError) {
      throw productsError;
    }


    const productsMap =
      new Map(
        (products || []).map(
          function (product) {
            return [
              product.id,
              product
            ];
          }
        )
      );


    const grouped =
      new Map();


    lots.forEach(
      function (lot) {

        const key =
          `${lot.product_id}:${lot.expiry_date}`;


        if (!grouped.has(key)) {

          grouped.set(
            key,
            {
              productId:
                lot.product_id,
              expiryDate:
                lot.expiry_date,
              qty: 0
            }
          );

        }


        grouped.get(key).qty +=
          Number(
            lot.base_qty || 0
          );

      }
    );


    return Array.from(
      grouped.values()
    )
      .map(
        function (item) {

          return {
            ...item,
            product:
              productsMap.get(
                item.productId
              ) || null
          };

        }
      )
      .sort(
        function (a, b) {

          return (
            a.expiryDate.localeCompare(
              b.expiryDate
            ) ||
            String(
              a.product?.name || ""
            ).localeCompare(
              String(
                b.product?.name || ""
              ),
              "ru"
            )
          );

        }
      );

  }


  function renderExpiryItems(items) {

    const list =
      root.querySelector(
        "#home-expiry-list"
      );


    const count =
      root.querySelector(
        "#home-expiry-count"
      );


    if (count) {

      count.textContent =
        `${items.length} поз.`;

    }


    if (!list) {
      return;
    }


    if (!items.length) {

      list.innerHTML = `
        <div class="home-empty">
          На ближайшие 3 дня сроков нет.
        </div>
      `;

      return;

    }


    list.innerHTML =
      items.map(
        function (item) {

          const product =
            item.product || {};


          const difference =
            getDateDifference(
              getLocalISODate(),
              item.expiryDate
            );


          return `
            <article class="home-expiry-item">

              <div class="home-expiry-indicator">
                !
              </div>


              <div class="home-expiry-product">

                <strong>
                  ${escapeHTML(
                    product.name ||
                    "Товар"
                  )}
                </strong>

                <span>
                  ${escapeHTML(
                    product.iiko_code ||
                    "Без кода"
                  )}
                </span>

              </div>


              <div class="home-expiry-qty">

                <strong>
                  ${escapeHTML(
                    formatNumber(
                      item.qty
                    )
                  )}
                  ${escapeHTML(
                    product.iiko_unit ||
                    "ед."
                  )}
                </strong>

                <span>
                  Остаток по сроку
                </span>

              </div>


              <div
                class="home-expiry-date ${
                  difference === 0
                    ? "is-today"
                    : ""
                }"
              >
                ${escapeHTML(
                  getExpiryLabel(
                    item.expiryDate
                  )
                )}
                ·
                ${escapeHTML(
                  formatDate(
                    item.expiryDate,
                    {
                      short: true,
                      withYear: false
                    }
                  )
                )}
              </div>

            </article>
          `;

        }
      ).join("");

  }


  function renderExpiryError(error) {

    const list =
      root.querySelector(
        "#home-expiry-list"
      );


    if (!list) {
      return;
    }


    list.innerHTML = `
      <div class="home-error">
        Не удалось загрузить сроки:
        ${escapeHTML(
          error.message ||
          String(error)
        )}
      </div>
    `;

  }


  /* =====================================================
     INVENTORY MODAL
  ===================================================== */

  function updateSelectedDate(
    isoDate
  ) {

    if (!parseLocalDate(isoDate)) {
      return;
    }


    selectedInventoryDate =
      isoDate;


    root
      .querySelectorAll(
        "[data-home-inventory-date]"
      )
      .forEach(
        function (button) {

          button.classList.toggle(
            "is-selected",
            button.dataset
              .homeInventoryDate ===
              isoDate
          );

        }
      );


    const selectedDateElement =
      root.querySelector(
        "#home-selected-date"
      );


    if (selectedDateElement) {

      selectedDateElement.textContent =
        new Intl.DateTimeFormat(
          "ru-RU",
          {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric"
          }
        ).format(
          parseLocalDate(
            isoDate
          )
        );

    }

  }


  function renderWeekdays() {

    const grid =
      root.querySelector(
        "#home-weekday-grid"
      );


    if (!grid) {
      return;
    }


    const weekDates =
      getCurrentWeekDates();


    grid.innerHTML =
      weekDates.map(
        function (item) {

          return `
            <button
              class="home-weekday-button"
              type="button"
              data-home-inventory-date="${escapeHTML(
                item.isoDate
              )}"
            >
              <strong>
                ${escapeHTML(
                  item.weekday
                )}
              </strong>

              <span>
                ${escapeHTML(
                  formatDate(
                    item.date,
                    {
                      short: true,
                      withYear: false
                    }
                  )
                )}
              </span>
            </button>
          `;

        }
      ).join("");


    const today =
      getLocalISODate();


    const initialDate =
      weekDates.some(
        function (item) {
          return item.isoDate === today;
        }
      )
        ? today
        : weekDates[0]?.isoDate;


    if (initialDate) {

      updateSelectedDate(
        initialDate
      );

    }

  }


  function openInventoryModal() {

    const modal =
      root.querySelector(
        "#home-inventory-modal"
      );


    if (!modal) {
      return;
    }


    const message =
      root.querySelector(
        "#home-inventory-message"
      );


    if (message) {
      message.textContent = "";
    }


    renderWeekdays();


    modal.classList.add(
      "is-open"
    );


    modal.setAttribute(
      "aria-hidden",
      "false"
    );

  }


  function closeInventoryModal() {

    const modal =
      root.querySelector(
        "#home-inventory-modal"
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

  }


  function printInventory() {

    const message =
      root.querySelector(
        "#home-inventory-message"
      );


    if (
      !selectedInventoryDate ||
      !parseLocalDate(
        selectedInventoryDate
      )
    ) {

      if (message) {
        message.textContent =
          "Выберите день недели.";
      }

      return;

    }


    closeInventoryModal();


    window.location.hash =
      `inventory/${
        selectedInventoryDate
      }/print`;

  }


  /* =====================================================
     EVENTS
  ===================================================== */

  function bindEvents() {

    root.addEventListener(
      "click",
      function (event) {

        if (
          event.target.closest(
            "[data-home-inventory-open]"
          )
        ) {

          openInventoryModal();

          return;

        }


        if (
          event.target.closest(
            "[data-home-inventory-close]"
          )
        ) {

          closeInventoryModal();

          return;

        }


        const weekdayButton =
          event.target.closest(
            "[data-home-inventory-date]"
          );


        if (weekdayButton) {

          updateSelectedDate(
            weekdayButton.dataset
              .homeInventoryDate
          );

          return;

        }


        if (
          event.target.closest(
            "#home-inventory-print"
          )
        ) {

          printInventory();

        }

      }
    );

  }


  /* =====================================================
     INIT
  ===================================================== */

  async function init() {

    root =
      document.getElementById(
        "home-page"
      );


    if (!root) {
      return;
    }


    restaurantId =
      null;


    selectedInventoryDate =
      "";


    const currentDateElement =
      root.querySelector(
        "#home-current-date"
      );


    if (currentDateElement) {

      currentDateElement.textContent =
        new Intl.DateTimeFormat(
          "ru-RU",
          {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric"
          }
        ).format(
          new Date()
        );

    }


    bindEvents();


    try {

      await loadContext();


      const expiryItems =
        await loadExpiryItems();


      renderExpiryItems(
        expiryItems
      );


    } catch (error) {

      console.error(
        "Home init:",
        error
      );


      renderExpiryError(
        error
      );

    }

  }


  document.addEventListener(
    "app:page-loaded",
    function (event) {

      if (
        event.detail?.route ===
        "home"
      ) {

        init();

      }

    }
  );

})();
