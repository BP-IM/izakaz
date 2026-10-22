/* =====================================================
   IZAKAZ v0.2.0
   INVENTORY COUNT — COMPLETION
===================================================== */

(function () {
  "use strict";


  let app = null;

  let isCompleting = false;


  /* =====================================================
     HELPERS
  ===================================================== */

  function getModal() {

    return app.root.querySelector(
      "#inventory-complete-modal"
    );

  }


  function getProgress() {

    const total =
      app.state.products.length;


    const counted =
      window
        .InventoryCountCounting
        ?.getCountedProductIds?.()
        ?.size || 0;


    return {
      total,
      counted,
      remaining:
        Math.max(
          total - counted,
          0
        )
    };

  }


  function parseDate(
    dateString
  ) {

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


  function formatDate(
    dateString
  ) {

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


  /* =====================================================
     MESSAGE
  ===================================================== */

  function clearMessage() {

    const message =
      app.root.querySelector(
        "#complete-modal-message"
      );


    if (!message) {
      return;
    }


    message.hidden = true;

    message.textContent = "";

  }


  function showMessage(
    text
  ) {

    const message =
      app.root.querySelector(
        "#complete-modal-message"
      );


    if (!message) {
      return;
    }


    message.textContent =
      text;


    message.hidden =
      false;

  }


  /* =====================================================
     LOADING
  ===================================================== */

  function setLoading(
    loading
  ) {

    const button =
      app.root.querySelector(
        "#complete-modal-confirm"
      );


    if (!button) {
      return;
    }


    button.disabled =
      loading;


    button.textContent =
      loading
        ? "Завершение..."
        : "Завершить";

  }


  /* =====================================================
     OPEN MODAL
  ===================================================== */

  async function open() {

    if (
      app.state.sessionStatus ===
      "completed"
    ) {

      return;

    }


    /*
      Перед открытием обновляем
      entries из базы.
    */

    await window
      .InventoryCountCounting
      .reload();


    const {
      total,
      counted,
      remaining
    } =
      getProgress();


    window
      .InventoryCountUI
      .refresh();


    if (
      total === 0
    ) {

      return;

    }


    if (
      remaining > 0
    ) {

      alert(
        `Не посчитано товаров: ${remaining}.`
      );


      return;

    }


    const modal =
      getModal();


    if (!modal) {

      console.error(
        "Complete modal not found."
      );


      return;

    }


    const dateElement =
      app.root.querySelector(
        "#complete-modal-date"
      );


    const progressElement =
      app.root.querySelector(
        "#complete-modal-progress"
      );


    if (dateElement) {

      dateElement.textContent =
        formatDate(
          app.state.inventoryDate
        );

    }


    if (progressElement) {

      progressElement.textContent =
        `${counted} из ${total}`;

    }


    clearMessage();


    modal.classList.add(
      "is-open"
    );


    modal.setAttribute(
      "aria-hidden",
      "false"
    );

  }


  /* =====================================================
     CLOSE MODAL
  ===================================================== */

  function close() {

    if (isCompleting) {
      return;
    }


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
     COMPLETE SESSION
  ===================================================== */

  async function confirmCompletion() {

    if (isCompleting) {
      return;
    }


    const state =
      app.state;


    if (
      !state.session?.id
    ) {

      showMessage(
        "Сессия инвентаризации не найдена."
      );


      return;

    }


    try {

      isCompleting = true;


      setLoading(
        true
      );


      clearMessage();


      /*
        Ещё раз берём актуальные entries.
      */

      await window
        .InventoryCountCounting
        .reload();


      const {
        total,
        counted,
        remaining
      } =
        getProgress();


      if (
        total === 0
      ) {

        showMessage(
          "В инвентаризации нет товаров."
        );


        return;

      }


      if (
        remaining > 0
      ) {

        showMessage(
          `Не посчитано товаров: ${remaining}.`
        );


        window
          .InventoryCountUI
          .refresh();


        return;

      }


      /*
        Завершаем ТОЛЬКО
        текущую session.

        Дату не меняем.
      */

      const {
        data: session,
        error
      } =
        await supabaseClient
          .from(
            "inventory_sessions"
          )
          .update({

            status:
              "completed",

            completed_at:
              new Date()
                .toISOString(),

            completed_by:
              state.userId

          })
          .eq(
            "id",
            state.session.id
          )
          .eq(
            "restaurant_id",
            state.restaurantId
          )
          .select("*")
          .single();


      if (error) {

        throw error;

      }


      /* =================================================
         UPDATE STATE
      ================================================= */

      state.session =
        session;


      state.inventoryDate =
        session.inventory_date;


      state.inventoryType =
        session.inventory_type;


      state.sessionStatus =
        session.status;


      state.isUpToDate =
        (
          session.inventory_date ===
          window
            .InventoryCountSession
            .getToday()
        );


      state.nextInventoryDate =
        null;


      /* =================================================
         REFRESH
      ================================================= */

      window
        .InventoryCountUI
        .refresh();


      /*
        Modal жабамыз.
      */

      const modal =
        getModal();


      modal?.classList.remove(
        "is-open"
      );


      modal?.setAttribute(
        "aria-hidden",
        "true"
      );


      console.log(
        "[Inventory Completion] completed",
        {
          date:
            state.inventoryDate,

          sessionId:
            session.id,

          counted:
            counted,

          total:
            total
        }
      );


    } catch (error) {

      console.error(
        "Inventory completion:",
        error
      );


      showMessage(
        error?.message ||
        "Не удалось завершить инвентаризацию."
      );


    } finally {

      isCompleting =
        false;


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
            "#inventory-complete-button"
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
            "[data-complete-modal-close]"
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
            "#complete-modal-confirm"
          )
        ) {

          confirmCompletion();

        }

      }
    );


    /*
      ESC
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
        "Inventory Completion: app не найден."
      );

    }


    bindEvents();


    console.log(
      "[Inventory Completion] ready"
    );

  }


  /* =====================================================
     PUBLIC API
  ===================================================== */

  window.InventoryCountCompletion = {

    init,

    open,

    close,

    complete:
      confirmCompletion

  };

})();