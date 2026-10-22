
/* ==========================================
   IZAKAZ v0.2.0
   ORDER COLA — 2 STEP CONTROLLER
========================================== */

(function () {
  "use strict";

  const STEPS = {
    1: "Остаток",
    2: "Заказ"
  };

  let root = null;
  let currentStep = 1;

  /* ========================================
     NAVIGATION
  ======================================== */

  function goToStep(step) {
    const nextStep = Number(step);

    if (
      !STEPS[nextStep] ||
      !root ||
      root.dataset.colaMode === "confirmed"
    ) {
      return;
    }

    currentStep = nextStep;

    root.querySelectorAll(
      "[data-cola-step]"
    ).forEach(function (button) {
      const active =
        Number(button.dataset.colaStep) ===
        currentStep;

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
    });

    root.querySelectorAll(
      "[data-cola-panel]"
    ).forEach(function (panel) {
      panel.hidden =
        Number(panel.dataset.colaPanel) !==
        currentStep;
    });

    const label = root.querySelector(
      "#cola-current-step-label"
    );

    if (label) {
      label.textContent = STEPS[currentStep];
    }

    root.dispatchEvent(
      new CustomEvent("cola:step-changed", {
        detail: {
          step: currentStep,
          name: STEPS[currentStep]
        }
      })
    );
  }

  /* ========================================
     ORDER MODE + CONFIRMED ITEMS
  ======================================== */

  let modeGeneration = 0;

  function esc(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char])
    );
  }

  function formatDate(value) {
    if (!value) return "—";

    const [y, m, d] = value.split("-");

    return `${d}.${m}.${y}`;
  }

  function getClient() {
    const db =
      window.supabaseClient ||
      (
        typeof supabaseClient !== "undefined"
          ? supabaseClient
          : null
      );

    if (!db) {
      throw new Error("Supabase не подключен");
    }

    return db;
  }

  /* ========================================
     CONFIRMED ORDER — LOAD
  ======================================== */

  async function renderConfirmed(
    orderData,
    ticket
  ) {
    const content = root.querySelector(
      "#cola-confirmed-content"
    );

    const db = getClient();

    const orderId = orderData.id;

    const restaurantId =
      orderData.restaurant_id;

    const {
      data: delivery,
      error: deliveryError
    } = await db
      .from("order_deliveries")
      .select("id,delivery_date,status")
      .eq("restaurant_id", restaurantId)
      .eq("source_cola_order_id", orderId)
      .maybeSingle();

    if (deliveryError) {
      throw deliveryError;
    }

    if (!delivery) {
      throw new Error(
        "Подтверждённый заказ не связан с поставкой"
      );
    }

    const {
      data: items,
      error: itemsError
    } = await db
      .from("order_delivery_items")
      .select("product_id,case_qty,base_qty")
      .eq("delivery_id", delivery.id);

    if (itemsError) {
      throw itemsError;
    }

    const productIds = (items || []).map(
      item => item.product_id
    );

    let productData = [];

    if (productIds.length) {
      const { data, error } = await db
        .from("order_products")
        .select(
          "id,name,iiko_code,iiko_unit,sort_order"
        )
        .eq("restaurant_id", restaurantId)
        .in("id", productIds);

      if (error) {
        throw error;
      }

      productData = data || [];
    }

    // Prevent showing results for an old date.
    if (
      ticket !== modeGeneration ||
      !root?.isConnected
    ) {
      return;
    }

    const byId = new Map(
      productData.map(product => [
        String(product.id),
        product
      ])
    );

    const rows = (items || [])
      .map(item => ({
        ...item,
        product: byId.get(
          String(item.product_id)
        )
      }))
      .sort((a, b) =>
        Number(
          a.product?.sort_order ?? 99999
        ) -
        Number(
          b.product?.sort_order ?? 99999
        ) ||
        String(
          a.product?.name || ""
        ).localeCompare(
          String(b.product?.name || ""),
          "ru"
        )
      );

    const totalCases = rows.reduce(
      (sum, item) =>
        sum + Number(item.case_qty || 0),
      0
    );

    /* ======================================
       RENDER CONFIRMED LIST
    ====================================== */

    content.innerHTML = `
      <div class="cola-confirmed-heading">

        <div>
          <span class="cola-confirmed-tag">
            ПОДТВЕРЖДЁН
          </span>

          <h2>Список заказа Cola</h2>

          <p>
            Заказ:
            ${esc(formatDate(orderData.order_date))}

            · Поставка:
            ${esc(formatDate(delivery.delivery_date))}
          </p>
        </div>

        <div class="cola-confirmed-total">
          <span>Всего CASE</span>
          <strong>${esc(totalCases)}</strong>
        </div>

      </div>

      <div class="cola-confirmed-table-scroll">

        <table class="cola-confirmed-table">

          <thead>
            <tr>
              <th>№</th>
              <th>Наименование</th>
              <th>Код IIKO</th>
              <th>CASE</th>
              <th>Итого</th>
            </tr>
          </thead>

          <tbody>

            ${
              rows.length
                ? rows.map((item, index) => `
                    <tr>

                      <td>${index + 1}</td>

                      <td>
                        <strong>
                          ${esc(
                            item.product?.name ||
                            "Товар не найден"
                          )}
                        </strong>
                      </td>

                      <td>
                        ${esc(
                          item.product?.iiko_code ||
                          "—"
                        )}
                      </td>

                      <td>
                        <strong>
                          ${esc(item.case_qty || 0)}
                        </strong>
                      </td>

                      <td>
                        ${esc(item.base_qty ?? "—")}
                        ${esc(
                          item.product?.iiko_unit || ""
                        )}
                      </td>

                    </tr>
                  `).join("")

                : `
                    <tr>
                      <td colspan="5">
                        В поставке нет товаров
                      </td>
                    </tr>
                  `
            }

          </tbody>

        </table>

      </div>

      <div class="cola-confirmed-footer">

        <span>
          Заказ закрыт для редактирования.
          Данные загружены из Supabase.
        </span>

        <span>
          Excel экспорт подключим
          следующим этапом
        </span>

      </div>
    `;
  }

  /* ========================================
     SWITCH ORDER MODE
  ======================================== */

  async function setOrderMode(orderData) {
    if (!root?.isConnected) {
      return;
    }

    const ticket = ++modeGeneration;

    const confirmed =
      String(
        orderData?.status || ""
      ).toLowerCase() === "confirmed";

    root.dataset.colaMode =
      confirmed ? "confirmed" : "draft";

    const confirmedView = root.querySelector(
      "#cola-confirmed-view"
    );

    const stepper = root.querySelector(
      ".cola-stepper"
    );

    const indicator = root.querySelector(
      "#cola-date-indicator"
    );

    if (stepper) {
      stepper.hidden = confirmed;
    }

    if (confirmedView) {
      confirmedView.hidden = !confirmed;
    }

    if (confirmed) {
      root.querySelectorAll(
        "[data-cola-panel]"
      ).forEach(panel => {
        panel.hidden = true;
      });

      if (indicator) {
        indicator.textContent =
          "Заказ подтверждён · " + formatDate(orderData?.order_date);
      }

      const content = confirmedView?.querySelector(
        "#cola-confirmed-content"
      );

      if (content) {
        content.textContent =
          "Загрузка списка заказа...";
      }

      try {
        await renderConfirmed(
          orderData,
          ticket
        );

      } catch (error) {
        if (ticket !== modeGeneration) {
          return;
        }

        console.error(
          "[Cola confirmed]",
          error
        );

        if (content) {
          content.textContent =
            "Не удалось загрузить список: " +
            (error.message || error);
        }
      }

    } else {
      if (indicator) {
        indicator.textContent =
          "Подсчёт остатков / заказ";
      }

      goToStep(1);
    }
  }

  /* ========================================
     EVENTS
  ======================================== */

  function bindEvents() {
    root.addEventListener(
      "click",
      function (event) {
        const stepButton =
          event.target.closest(
            "[data-cola-step]"
          );

        if (stepButton) {
          goToStep(
            stepButton.dataset.colaStep
          );
          return;
        }

        if (
          event.target.closest(
            "[data-cola-next]"
          )
        ) {
          goToStep(2);
          return;
        }

        if (
          event.target.closest(
            "[data-cola-back]"
          )
        ) {
          goToStep(1);
        }
      }
    );
  }

  /* ========================================
     INIT
  ======================================== */

  function init(container = document) {
    const element = container.querySelector(
      "#cola-order-page"
    );

    if (!element) {
      return;
    }

    root = element;

    if (
      root.dataset.colaInitialized === "true"
    ) {
      return;
    }

    root.dataset.colaInitialized = "true";

    bindEvents();

    root.addEventListener(
      "cola:order-loaded",
      event => {
        setOrderMode(event.detail.order);
      }
    );

    root.dataset.colaMode = "loading";

    goToStep(1);

    root.dataset.colaMode = "loading";
  }

  /* ========================================
     SPA ROUTER
  ======================================== */

  document.addEventListener(
    "app:page-loaded",
    function (event) {
      if (
        event.detail?.route !== "order-cola"
      ) {
        return;
      }

      init(document);
    }
  );

  /* ========================================
     PUBLIC API
  ======================================== */

  window.ColaOrder = {
    init,
    goToStep,

    getCurrentStep: function () {
      return currentStep;
    }
  };

})();
