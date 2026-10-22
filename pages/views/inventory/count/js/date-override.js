/* =====================================================
   IZAKAZ v0.2.0
   INVENTORY — DATE OVERRIDE
===================================================== */

(function () {
  "use strict";


  let app = null;


  /* =====================================================
     ELEMENTS
  ===================================================== */

  function getModal() {

    return app.root.querySelector(
      "#inventory-date-modal"
    );

  }


  function getMessage() {

    return app.root.querySelector(
      "#date-modal-message"
    );

  }


  /* =====================================================
     MESSAGE
  ===================================================== */

  function clearMessage() {

    const message =
      getMessage();


    if (!message) {
      return;
    }


    message.hidden =
      true;


    message.textContent =
      "";

  }


  function showMessage(
    text
  ) {

    const message =
      getMessage();


    if (!message) {
      return;
    }


    message.textContent =
      text;


    message.hidden =
      false;

  }


  /* =====================================================
     OPEN
  ===================================================== */

  function open() {

    const modal =
      getModal();


    if (!modal) {

      console.error(
        "Date modal not found."
      );

      return;

    }


    const currentDate =
      app.state.inventoryDate;


    const current =
      app.root.querySelector(
        "#date-modal-current-date"
      );


    const newDate =
      app.root.querySelector(
        "#date-modal-new-date"
      );


    const pin =
      app.root.querySelector(
        "#date-modal-pin"
      );


    if (current) {

      current.textContent =
        currentDate ||
        "—";

    }


    if (newDate) {

      newDate.value =
        currentDate ||
        "";


      /*
        Будущую дату выбрать нельзя.
      */

      newDate.max =
        window
          .InventoryCountSession
          ?.getToday?.()
        ||
        "";

    }


    if (pin) {

      pin.value =
        "";

    }


    clearMessage();


    modal.classList.add(
      "is-open"
    );


    modal.setAttribute(
      "aria-hidden",
      "false"
    );


    window.setTimeout(
      function () {

        newDate?.focus();

      },
      0
    );

  }


  /* =====================================================
     CLOSE
  ===================================================== */

  function close() {

    const modal =
      getModal();


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


    clearMessage();

  }


  /* =====================================================
     BUTTON STATE
  ===================================================== */

  function setLoading(
    loading
  ) {

    const button =
      app.root.querySelector(
        "#date-modal-confirm"
      );


    if (!button) {
      return;
    }


    button.disabled =
      loading;


    button.textContent =
      loading
        ? "Проверка..."
        : "Подтвердить";

  }


  /* =====================================================
     VERIFY PIN
  ===================================================== */

  async function verifyPin(
    pin
  ) {

    const {
      data,
      error
    } =
      await supabaseClient
        .rpc(
          "verify_inventory_pin",
          {
            p_pin:
              pin
          }
        );


    if (error) {

      throw error;

    }


    return (
      data === true
    );

  }


  /* =====================================================
     CONFIRM
  ===================================================== */

  async function confirm() {

    const dateInput =
      app.root.querySelector(
        "#date-modal-new-date"
      );


    const pinInput =
      app.root.querySelector(
        "#date-modal-pin"
      );


    const newDate =
      dateInput?.value;


    const pin =
      pinInput?.value
        ?.trim();


    clearMessage();


    /* -----------------------------
       DATE
    ----------------------------- */

    if (!newDate) {

      showMessage(
        "Выберите новую дату."
      );


      dateInput?.focus();


      return;

    }


    /* -----------------------------
       SAME DATE
    ----------------------------- */

    if (
      newDate ===
      app.state.inventoryDate
    ) {

      showMessage(
        "Эта дата уже открыта."
      );


      return;

    }


    /* -----------------------------
       FUTURE DATE
    ----------------------------- */

    const today =
      window
        .InventoryCountSession
        ?.getToday?.();


    if (
      today &&
      newDate > today
    ) {

      showMessage(
        "Нельзя открыть будущую дату."
      );


      return;

    }


    /* -----------------------------
       PIN
    ----------------------------- */

    if (!pin) {

      showMessage(
        "Введите код доступа."
      );


      pinInput?.focus();


      return;

    }


    try {

      setLoading(
        true
      );


      /* =================================================
         1. VERIFY PIN
      ================================================= */

      const valid =
        await verifyPin(
          pin
        );


      if (!valid) {

        showMessage(
          "Неверный код доступа."
        );


        if (pinInput) {

          pinInput.value =
            "";


          pinInput.focus();

        }


        return;

      }


      /* =================================================
         2. CLOSE PRODUCT MODAL
      ================================================= */

      window
        .InventoryCountModal
        ?.close?.();


      /* =================================================
         3. SWITCH SESSION

         Ключевой момент:

         старая session НЕ меняется.
         Открываем session выбранной даты.
      ================================================= */

      await window
        .InventoryCountSession
        .switchToDate(
          app,
          newDate
        );


      /* =================================================
         4. LOAD PRODUCTS

         Для новой даты заново определяем
         daily / weekly / monthly товары.
      ================================================= */

      await window
        .InventoryCountProducts
        .init(
          app
        );


      /* =================================================
         5. LOAD COUNTS

         Entries загружаются именно
         по новому session_id.
      ================================================= */

      await window
        .InventoryCountCounting
        .reload();


      /* =================================================
         6. UI REFRESH
      ================================================= */

      window
        .InventoryCountUI
        .refresh();


      /* =================================================
         7. CLOSE
      ================================================= */

      close();


      console.log(
        "[Inventory Date Override] switched",
        {
          date:
            app.state.inventoryDate,

          type:
            app.state.inventoryType,

          sessionId:
            app.state.session?.id,

          products:
            app.state.products.length,

          entries:
            app.state.entries.length
        }
      );


    } catch (error) {

      console.error(
        "Inventory date override:",
        error
      );


      showMessage(
        error?.message ||
        "Не удалось изменить дату."
      );


    } finally {

      setLoading(
        false
      );

    }

  }


  /* =====================================================
     EVENTS
  ===================================================== */

  function bindEvents() {

    app.root.addEventListener(
      "click",
      function (event) {

        /*
          OPEN
        */

        if (
          event.target.closest(
            "#inventory-date-change-button"
          )
        ) {

          open();

          return;

        }


        /*
          CLOSE
        */

        if (
          event.target.closest(
            "[data-date-modal-close]"
          )
        ) {

          close();

          return;

        }


        /*
          CONFIRM
        */

        if (
          event.target.closest(
            "#date-modal-confirm"
          )
        ) {

          confirm();

        }

      }
    );


    /*
      ENTER -> CONFIRM
    */

    app.root.addEventListener(
      "keydown",
      function (event) {

        const modal =
          getModal();


        if (
          !modal ||
          !modal.classList.contains(
            "is-open"
          )
        ) {

          return;

        }


        if (
          event.key ===
          "Enter"
        ) {

          event.preventDefault();


          confirm();

        }

      }
    );


    /*
      ESC -> CLOSE
    */

    document.addEventListener(
      "keydown",
      function (event) {

        if (
          event.key ===
          "Escape"
        ) {

          close();

        }

      }
    );

  }


  /* =====================================================
     INIT
  ===================================================== */

  async function init(
    application
  ) {

    app =
      application;


    if (
      !app ||
      !app.root
    ) {

      throw new Error(
        "Inventory Date Override: app не найден."
      );

    }


    bindEvents();


    console.log(
      "[Inventory Date Override] ready"
    );

  }


  /* =====================================================
     PUBLIC API
  ===================================================== */

  window.InventoryDateOverride = {

    init,

    open,

    close

  };

})();