
/* ==========================================
   IZAKAZ v0.2.0
   COLA — CONFIRM ORDER

   Requires:
   result.js
   confirm_cola_order RPC
========================================== */

(function () {
  "use strict";

  const PAGE = "#cola-order-page";
  const CONTENT = "#cola-result-content";

  let root = null;
  let observer = null;
  let busy = false;

  function escapeHTML(value) {
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

  function getClient() {
    const client =
      window.supabaseClient ||
      (
        typeof supabaseClient !== "undefined"
          ? supabaseClient
          : null
      );

    if (!client) {
      throw new Error("Supabase не подключен");
    }

    return client;
  }

  function getResultContent() {
    return root?.querySelector(CONTENT);
  }

  function getOrderDate() {
    return root?.querySelector(
      "#cola-stock-date"
    )?.value || "";
  }

  function getCurrentItems() {
    const content = getResultContent();

    if (!content) {
      throw new Error(
        "Результат заказа не найден"
      );
    }

    const cards = [
      ...content.querySelectorAll(
        "[data-cola-result-product]"
      )
    ];

    if (!cards.length) {
      throw new Error(
        "Нет рассчитанных товаров Cola"
      );
    }

    return cards.map(card => {
      const productId =
        card.dataset.colaResultProduct;

      const input = card.querySelector(
        "[data-cola-case-input]"
      );

      if (!productId || !input) {
        throw new Error(
          "Некорректная карточка товара"
        );
      }

      const raw = input.value.trim();
      const cases = Number(raw);

      if (
        raw === "" ||
        !Number.isSafeInteger(cases) ||
        cases < 0 ||
        cases > 99999
      ) {
        throw new Error(
          "Проверьте количество CASE"
        );
      }

      return {
        product_id: productId,
        case_qty: cases
      };
    });
  }

  function getDeliveryDate() {
    const stock =
      window.IzakazColaStock;

    const date = getOrderDate();

    if (!date) {
      throw new Error("Дата заказа не найдена");
    }

    return loadDeliveryDate(date, stock);
  }

  async function loadDeliveryDate(
    orderDate,
    stock
  ) {
    const db = getClient();

    const { data: auth, error: authError } =
      await db.auth.getUser();

    if (authError) throw authError;

    if (!auth?.user?.id) {
      throw new Error("Нет авторизации");
    }

    const { data: profile, error } =
      await db
        .from("profiles")
        .select("restaurant_id")
        .eq("id", auth.user.id)
        .single();

    if (error) throw error;

    const restaurantId =
      profile?.restaurant_id;

    if (!restaurantId) {
      throw new Error("Ресторан не найден");
    }

    const schedule =
      await window.IzakazOrderSchedule
        .loadColaSchedule(restaurantId);

    const plan =
      window.IzakazOrderSchedule
        .buildColaPlan({
          orderDate,
          schedule
        });

    if (plan.deliveries.length !== 1) {
      throw new Error(
        "Подтверждение поддерживает " +
        "одну поставку на заказ"
      );
    }

    const deliveryDate =
      plan.deliveries[0].date;

    const { data: order, error: orderError } =
      await db
        .from("cola_orders")
        .select("id,status")
        .eq("restaurant_id", restaurantId)
        .eq("order_date", orderDate)
        .single();

    if (orderError) {
      throw orderError;
    }

    return {
      restaurantId,
      order,
      deliveryDate
    };
  }

  /* ========================================
     MODAL
  ======================================== */

  function ensureModal() {
    if (root.querySelector("#cola-confirm-dialog")) {
      return;
    }

    const modal = document.createElement("dialog");

    modal.id = "cola-confirm-dialog";
    modal.className = "cola-confirm-dialog";

    modal.innerHTML = `
      <div class="cola-confirm-header">
        <div>
          <small>ЗАКАЗЫ / COLA</small>
          <h3>Подтвердить заказ?</h3>
        </div>

        <button
          type="button"
          data-cola-confirm-close
          aria-label="Закрыть"
        >×</button>
      </div>

      <div class="cola-confirm-body">
        <div class="cola-confirm-row">
          <span>Дата заказа</span>
          <strong id="cola-confirm-order-date">—</strong>
        </div>

        <div class="cola-confirm-row">
          <span>Дата поставки</span>
          <strong id="cola-confirm-delivery-date">—</strong>
        </div>

        <div class="cola-confirm-row">
          <span>Позиций к заказу</span>
          <strong id="cola-confirm-positions">0</strong>
        </div>

        <div class="cola-confirm-row">
          <span>Всего CASE</span>
          <strong id="cola-confirm-total-cases">0</strong>
        </div>

        <p class="cola-confirm-note">
          После подтверждения заказ будет сохранён.
          Поставка Cola автоматически появится
          в разделе «Поставки» со статусом
          «Ожидается».
        </p>

        <p class="cola-confirm-warning">
          Расчёт пока не учитывает ранее
          ожидаемые поставки. Проверьте
          количество CASE перед подтверждением.
        </p>

        <div
          id="cola-confirm-error"
          class="cola-confirm-error"
          hidden
        ></div>
      </div>

      <div class="cola-confirm-footer">
        <button
          type="button"
          data-cola-confirm-close
        >Отмена</button>

        <button
          type="button"
          class="is-primary"
          id="cola-confirm-submit"
        >
          Подтвердить
        </button>
      </div>
    `;

    root.appendChild(modal);
  }

  function closeModal() {
    if (busy) return;

    const dialog =
      root?.querySelector("#cola-confirm-dialog");

    if (dialog?.open) {
      dialog.close();
    }
  }

  function showError(message) {
    const error = root?.querySelector(
      "#cola-confirm-error"
    );

    if (error) {
      error.hidden = false;
      error.textContent = message;
    }
  }

  async function openModal() {
    if (busy) return;

    const items = getCurrentItems();

    const selected = items.filter(
      item => item.case_qty > 0
    );

    if (!selected.length) {
      throw new Error(
        "Нельзя подтвердить пустой заказ"
      );
    }

    const data = await getDeliveryDate();

    if (data.order.status === "confirmed") {
      throw new Error(
        "Этот заказ уже подтверждён"
      );
    }

    ensureModal();

    const dialog = root.querySelector(
      "#cola-confirm-dialog"
    );

    dialog.dataset.orderId = data.order.id;
    dialog.dataset.deliveryDate =
      data.deliveryDate;

    dialog.querySelector(
      "#cola-confirm-order-date"
    ).textContent = getOrderDate();

    dialog.querySelector(
      "#cola-confirm-delivery-date"
    ).textContent = data.deliveryDate;

    dialog.querySelector(
      "#cola-confirm-positions"
    ).textContent = selected.length;

    dialog.querySelector(
      "#cola-confirm-total-cases"
    ).textContent = selected.reduce(
      (sum, item) => sum + item.case_qty,
      0
    );

    const error = dialog.querySelector(
      "#cola-confirm-error"
    );

    error.hidden = true;
    error.textContent = "";

    dialog.showModal();
  }

  /* ========================================
     CONFIRM VIA RPC
  ======================================== */

  async function confirmOrder() {
    if (busy) return;

    const dialog = root.querySelector(
      "#cola-confirm-dialog"
    );

    if (!dialog?.open) return;

    const items = getCurrentItems();

    const orderId = dialog.dataset.orderId;
    const deliveryDate =
      dialog.dataset.deliveryDate;

    if (!orderId || !deliveryDate) {
      showError("Не найдены данные заказа");
      return;
    }

    const button = dialog.querySelector(
      "#cola-confirm-submit"
    );

    busy = true;
    button.disabled = true;
    button.textContent = "Сохранение...";

    try {
      const { data, error } = await getClient()
        .rpc("confirm_cola_order", {
          p_order_id: orderId,
          p_delivery_date: deliveryDate,
          p_items: items
        });

      if (error) {
        throw error;
      }

      console.log(
        "[Cola] Confirmed delivery:",
        data
      );

      dialog.close();

      // Переходим к списку поставок.
      window.location.hash = "deliveries";

    } catch (error) {
      console.error(
        "[Cola Confirm]",
        error
      );

      showError(
        error.message ||
        "Не удалось подтвердить заказ"
      );

    } finally {
      busy = false;

      button.disabled = false;
      button.textContent = "Подтвердить";
    }
  }

  /* ========================================
     ACTIONS
  ======================================== */

  function ensureActions() {
    const content = getResultContent();

    if (!content) return;

    if (
      !content.querySelector(
        ".cola-product-results"
      )
    ) {
      return;
    }

    if (
      content.querySelector(
        "[data-cola-confirm-order]"
      )
    ) {
      return;
    }

    const actions = document.createElement("div");

    actions.className = "cola-confirm-actions";

    actions.innerHTML = `
      <button
        type="button"
        class="cola-confirm-main-button"
        data-cola-confirm-order
      >
        Подтвердить заказ
      </button>
    `;

    content.appendChild(actions);
  }

  /* ========================================
     STYLES
  ======================================== */

  function ensureStyles() {
    if (
      document.getElementById(
        "cola-confirm-styles"
      )
    ) {
      return;
    }

    const style = document.createElement("style");

    style.id = "cola-confirm-styles";

    style.textContent = `
      #cola-order-page .cola-confirm-actions {
        display: flex;
        justify-content: flex-end;
        margin-top: 20px;
        padding-top: 18px;
        border-top: 1px solid var(--line, #e5e7eb);
      }

      #cola-order-page .cola-confirm-main-button {
        min-height: 45px;
        padding: 0 23px;
        border: 0;
        border-radius: 11px;
        background: #ffc400;
        color: #171717;
        font: inherit;
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
      }

      .cola-confirm-dialog {
        width: min(440px, calc(100vw - 30px));
        max-height: 90vh;
        padding: 0;
        border: 1px solid var(--line, #e5e7eb);
        border-radius: 18px;
        background: var(--surface, #fff);
        color: var(--text, #171717);
        box-shadow: 0 18px 55px rgba(0,0,0,.20);
      }

      .cola-confirm-dialog::backdrop {
        background: rgba(0,0,0,.48);
      }

      .cola-confirm-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        padding: 22px;
        border-bottom: 1px solid var(--line, #e5e7eb);
      }

      .cola-confirm-header small {
        color: #a47a00;
        font-size: 10px;
        font-weight: 800;
      }

      .cola-confirm-header h3 {
        margin: 6px 0 0;
        font-size: 20px;
      }

      .cola-confirm-header button {
        border: 0;
        background: transparent;
        color: inherit;
        font-size: 24px;
        cursor: pointer;
      }

      .cola-confirm-body {
        padding: 20px 22px;
      }

      .cola-confirm-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 0;
        border-bottom: 1px solid var(--line, #e5e7eb);
        font-size: 12px;
      }

      .cola-confirm-row span {
        color: var(--muted, #777);
      }

      .cola-confirm-note,
      .cola-confirm-warning {
        margin: 15px 0 0;
        padding: 12px;
        border-radius: 9px;
        font-size: 11px;
        line-height: 1.6;
      }

      .cola-confirm-note {
        background: var(--background, #f3f4f5);
      }

      .cola-confirm-warning {
        background: #fff8df;
        color: #785a00;
      }

      .cola-confirm-error {
        margin-top: 12px;
        padding: 11px;
        border-radius: 9px;
        background: #fff0ef;
        color: #b42318;
        font-size: 11px;
      }

      .cola-confirm-error[hidden] {
        display: none;
      }

      .cola-confirm-footer {
        display: flex;
        justify-content: flex-end;
        gap: 9px;
        padding: 17px 22px;
        border-top: 1px solid var(--line, #e5e7eb);
      }

      .cola-confirm-footer button {
        padding: 11px 16px;
        border: 1px solid var(--line, #e5e7eb);
        border-radius: 10px;
        background: var(--surface, #fff);
        color: var(--text, #222);
        font: inherit;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
      }

      .cola-confirm-footer button.is-primary {
        border-color: #ffc400;
        background: #ffc400;
        color: #171717;
      }

      .cola-confirm-footer button:disabled {
        opacity: .55;
        cursor: wait;
      }

      @media (max-width: 600px) {
        #cola-order-page .cola-confirm-actions {
          display: block;
        }

        #cola-order-page .cola-confirm-main-button {
          width: 100%;
        }
      }
    `;

    document.head.appendChild(style);
  }

  /* ========================================
     EVENTS
  ======================================== */

  function bindEvents() {
    root.addEventListener("click", async event => {
      if (
        event.target.closest(
          "[data-cola-confirm-order]"
        )
      ) {
        try {
          await openModal();
        } catch (error) {
          console.error(error);
          alert(error.message);
        }

        return;
      }

      if (
        event.target.closest(
          "[data-cola-confirm-close]"
        )
      ) {
        closeModal();
        return;
      }

      if (
        event.target.closest(
          "#cola-confirm-submit"
        )
      ) {
        await confirmOrder();
      }
    });

    root.addEventListener("cancel", event => {
      if (busy) {
        event.preventDefault();
      }
    });
  }

  /* ========================================
     INIT
  ======================================== */

  function init(container = document) {
    const element = container.querySelector(PAGE);

    if (!element || element === root) {
      return;
    }

    observer?.disconnect();

    root = element;
    busy = false;

    ensureStyles();
    bindEvents();

    const content = getResultContent();

    if (!content) return;

    observer = new MutationObserver(() => {
      ensureActions();
    });

    observer.observe(content, {
      childList: true
    });

    ensureActions();
  }

  document.addEventListener(
    "app:page-loaded",
    event => {
      if (event.detail?.route === "order-cola") {
        init(document);
      }
    }
  );

  window.IzakazColaSave = {
    init
  };

  if (document.querySelector(PAGE)) {
    init(document);
  }

})();
