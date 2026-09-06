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
  let userId = null;

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
    userId = user.id;


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


      if (root?.isConnected && document.getElementById('home-page') === root) {
        await window.OrderNotes?.loadHome({userId, restaurantId});
      }


    } catch (error) {

      console.error(
        "Home init:",
        error
      );


      const host = root?.querySelector('#home-notes-host');
      if (host) host.textContent = 'Не удалось загрузить заметки. Обновите страницу и проверьте вход в аккаунт.';

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
