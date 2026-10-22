
/* ==========================================
   IZAKAZ v0.2.0
   ABL — ORDER CONTROLLER

   STEP 1: Остаток
   STEP 2: Заказ

   Date synchronization
   Draft / read-only modes
========================================== */

(function () {
  "use strict";

  const ROUTE = "order-abl";
  const ROOT_ID = "abl-order-page";

  let root = null;
  let currentStep = 1;
  let currentOrder = null;
  let orderDate = null;
  let loading = true;
  let readyForNext = false;

  /* ==========================================
     DATE HELPERS
  ========================================== */

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

  function formatDate(value) {
    const date = parseDate(value);

    if (!date) return "—";

    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC"
    }).format(date);
  }

  function getDateInput() {
    return root?.querySelector(
      "#abl-order-date"
    );
  }

  function isReadOnly() {
    if (!currentOrder) return false;

    return !["counting", "draft"].includes(
      String(currentOrder.status || "")
        .toLowerCase()
    );
  }

  function isConfirmed() {
    return isReadOnly();
  }

  /* ==========================================
     STATUS
  ========================================== */

  function setDateStatus(
    message,
    status = "info"
  ) {
    const element = root?.querySelector(
      "#abl-date-status"
    );

    if (!element) return;

    element.textContent = message;
    element.dataset.status = status;
  }

  /* ==========================================
     NAVIGATION
  ========================================== */

  function updateStepper() {
    if (!root) return;

    root.querySelectorAll(
      "[data-abl-step]"
    ).forEach(button => {
      const step = Number(
        button.dataset.ablStep
      );

      const active =
        step === currentStep;

      button.classList.toggle(
        "is-active",
        active
      );

      if (active) {
        button.setAttribute(
          "aria-current",
          "step"
        );
      } else {
        button.removeAttribute(
          "aria-current"
        );
      }

      button.disabled =
        loading ||
        isReadOnly() ||
        (step === 2 && !readyForNext);
    });

    const nextButton = root.querySelector(
      "[data-abl-next]"
    );

    if (nextButton) {
      nextButton.disabled =
        loading ||
        isReadOnly() ||
        !readyForNext;
    }
  }

  function showStep(step) {
    if (!root || !root.isConnected) {
      return;
    }

    if (loading || isReadOnly()) {
      return;
    }

    const nextStep = Number(step);

    if (
      nextStep !== 1 &&
      nextStep !== 2
    ) {
      return;
    }

    if (
      nextStep === 2 &&
      !readyForNext
    ) {
      return;
    }

    currentStep = nextStep;

    renderMode();

    root.dispatchEvent(
      new CustomEvent(
        "abl:step-changed",
        {
          detail: {
            step: currentStep,
            order: currentOrder,
            orderDate
          }
        }
      )
    );
  }

  /* ==========================================
     MODES
  ========================================== */

  function renderMode() {
    if (!root) return;

    const readonly = isReadOnly();

    const mode = loading
      ? "loading"
      : readonly
        ? "confirmed"
        : "draft";

    root.dataset.ablMode = mode;

    const stepper = root.querySelector(
      ".abl-stepper"
    );

    const confirmed = root.querySelector(
      "#abl-confirmed-view"
    );

    if (stepper) {
      stepper.hidden =
        loading || readonly;
    }

    if (confirmed) {
      confirmed.hidden =
        loading || !readonly;
    }

    root.querySelectorAll(
      "[data-abl-panel]"
    ).forEach(panel => {
      const step = Number(
        panel.dataset.ablPanel
      );

      panel.hidden =
        loading ||
        readonly ||
        step !== currentStep;
    });

    updateStepper();
  }

  /* ==========================================
     READ-ONLY VIEW
  ========================================== */

  function renderReadOnly() {
    const container = root?.querySelector(
      "#abl-confirmed-content"
    );

    if (!container) return;

    const status =
      currentOrder?.status || "—";

    const confirmed =
      String(status).toLowerCase() ===
      "confirmed";

    container.innerHTML = `
      <div class="abl-confirmed-placeholder">

        <span class="abl-confirmed-label">
          ЗАКАЗ ЗАКРЫТ ДЛЯ РЕДАКТИРОВАНИЯ
        </span>

        <h2>
          Заказ ABL
        </h2>

        <p>
          Дата заказа:
          <strong>${formatDate(orderDate)}</strong>
        </p>

        <p>
          Статус: <strong
          >${escapeHTML(status)}</strong>
        </p>

        <p>
          ${confirmed
            ? "Заказ подтверждён."
            : "Заказ находится на следующем этапе."}
          Редактирование остатков недоступно.
        </p>

        <div
          id="abl-confirmed-items"
          class="abl-confirmed-items"
        ></div>

      </div>
    `;

    root.dispatchEvent(
      new CustomEvent(
        "abl:confirmed-view",
        {
          detail: {
            order: currentOrder,
            orderDate
          }
        }
      )
    );
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /* ==========================================
     DATE CHANGE
  ========================================== */

  function changeDate(value) {
    if (!root) return;

    if (!parseDate(value)) {
      setDateStatus(
        "Некорректная дата",
        "error"
      );

      getDateInput().value =
        orderDate || "";

      return;
    }

    const weekday =
      parseDate(value).getUTCDay();

    if (
      weekday !== 1 &&
      weekday !== 4
    ) {
      setDateStatus(
        "Выберите понедельник или четверг",
        "error"
      );

      getDateInput().value =
        orderDate || "";

      return;
    }

    if (
      value === orderDate &&
      !loading
    ) {
      return;
    }

    orderDate = value;
    currentOrder = null;
    readyForNext = false;
    currentStep = 1;
    loading = true;

    setDateStatus(
      "Загрузка заказа...",
      "loading"
    );

    const deliveryPlan = root.querySelector(
      "#abl-delivery-plan"
    );

    if (deliveryPlan) {
      deliveryPlan.textContent =
        "Загрузка графика поставок...";
    }

    renderMode();

    root.dispatchEvent(
      new CustomEvent(
        "abl:date-changed",
        {
          detail: {
            orderDate: value
          }
        }
      )
    );
  }

  /* ==========================================
     STOCK EVENTS
  ========================================== */

  function onOrderLoaded(event) {
    if (
      !root ||
      event.target !== root
    ) {
      return;
    }

    const detail = event.detail || {};

    const selectedDate =
      getDateInput()?.value;

    if (
      !detail.orderDate ||
      detail.orderDate !== selectedDate
    ) {
      return;
    }

    orderDate = detail.orderDate;
    currentOrder = detail.order || null;

    currentStep = 1;
    readyForNext = false;
    loading = false;

    renderMode();

    if (isReadOnly()) {
      setDateStatus(
        "Заказ закрыт · " +
        formatDate(orderDate),
        "confirmed"
      );

      renderReadOnly();
    } else {
      setDateStatus(
        "Заказ открыт · " +
        formatDate(orderDate),
        "draft"
      );
    }
  }

  function onOrderError(event) {
    if (
      !root ||
      event.target !== root
    ) {
      return;
    }

    const detail = event.detail || {};

    if (
      detail.orderDate !==
      getDateInput()?.value
    ) {
      return;
    }

    loading = false;
    currentOrder = null;
    readyForNext = false;
    currentStep = 1;

    renderMode();

    setDateStatus(
      detail.message ||
      "Ошибка загрузки заказа",
      "error"
    );
  }

  function onStockProgress(event) {
    if (
      !root ||
      event.target !== root
    ) {
      return;
    }

    if (loading || isReadOnly()) {
      return;
    }

    readyForNext =
      event.detail?.complete === true;

    updateStepper();
  }

  /* ==========================================
     EVENTS
  ========================================== */

  function bindEvents() {
    const dateField = getDateInput();

    dateField?.addEventListener(
      "change",
      event => {
        changeDate(event.target.value);
      }
    );

    root.addEventListener(
      "click",
      event => {
        const stepButton =
          event.target.closest(
            "[data-abl-step]"
          );

        if (stepButton) {
          showStep(
            stepButton.dataset.ablStep
          );
          return;
        }

        if (
          event.target.closest(
            "[data-abl-next]"
          )
        ) {
          showStep(2);
          return;
        }

        if (
          event.target.closest(
            "[data-abl-back]"
          )
        ) {
          showStep(1);
        }
      }
    );

    root.addEventListener(
      "abl:order-loaded",
      onOrderLoaded
    );

    root.addEventListener(
      "abl:order-error",
      onOrderError
    );

    root.addEventListener(
      "abl:stock-progress",
      onStockProgress
    );
  }

  /* ==========================================
     INIT
  ========================================== */

  function init(container) {
    const nextRoot =
      container?.querySelector(
        "#" + ROOT_ID
      ) ||
      document.getElementById(ROOT_ID);

    if (!nextRoot) return;

    if (
      nextRoot.dataset
        .ablInitialized === "true"
    ) {
      root = nextRoot;
      return;
    }

    root = nextRoot;

    root.dataset.ablInitialized = "true";

    currentStep = 1;
    currentOrder = null;
    readyForNext = false;
    loading = true;

    const input = getDateInput();

    orderDate =
      input?.value ||
      getDefaultDate();

    if (input) {
      input.value = orderDate;
    }

    bindEvents();
    renderMode();

    setDateStatus(
      "Загрузка заказа...",
      "loading"
    );

    root.dispatchEvent(
      new CustomEvent(
        "abl:initialized",
        {
          detail: {
            orderDate
          }
        }
      )
    );

    console.log(
      "[ABL] Controller ready:",
      orderDate
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

  window.AblOrder = {
    init,

    goToStep: showStep,

    getCurrentStep() {
      return currentStep;
    },

    getOrder() {
      return currentOrder;
    },

    getOrderDate() {
      return orderDate;
    },

    isConfirmed,

    isReadOnly,

    setStockComplete(value) {
      if (
        loading ||
        isReadOnly()
      ) {
        return;
      }

      readyForNext = value === true;
      updateStepper();
    }
  };

})();
