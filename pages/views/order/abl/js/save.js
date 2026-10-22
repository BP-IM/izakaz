
/* ==========================================
   IZAKAZ v0.2.0
   ABL — CONFIRM ORDER

   RPC: confirm_abl_order
   Confirmation modal
   Read-only confirmed list
   Existing deliveries detection
========================================== */

(function () {
  "use strict";

  const ROOT_ID = "abl-order-page";
  const ROUTE = "order-abl";

  let root = null;
  let client = null;
  let saving = false;
  let checking = false;
  let checkVersion = 0;

  let confirmedOrderId = null;
  let confirmedDeliveries = [];

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(
      value + "T12:00:00Z"
    );

    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC"
    }).format(date);
  }

  function getClient() {
    const connection =
      window.supabaseClient ||
      (
        typeof supabaseClient !== "undefined"
          ? supabaseClient
          : null
      );

    if (!connection) {
      throw new Error("Supabase не подключён");
    }

    return connection;
  }

  function getStock() {
    return window.IzakazAblStock;
  }

  function getResult() {
    return window.IzakazAblResult?.getResult?.();
  }

  function currentOrder() {
    return getStock()?.getOrder?.();
  }

  function getButton() {
    return root?.querySelector(
      "#abl-confirm-order"
    );
  }

  function setButtonState() {
    const button = getButton();
    if (!button) return;

    const order = currentOrder();

    const confirmed =
      order?.id === confirmedOrderId;

    button.disabled =
      saving ||
      checking ||
      confirmed ||
      !getResult();

    button.textContent = saving
      ? "Сохранение..."
      : confirmed
        ? "✓ Заказ подтверждён"
        : "Подтвердить заказ";
  }

  function showError(message) {
    let element = root?.querySelector(
      "#abl-save-message"
    );

    if (!element) {
      element = document.createElement("div");
      element.id = "abl-save-message";
      element.className = "abl-stock-status";

      root?.querySelector(
        "#abl-result-content"
      )?.prepend(element);
    }

    element.dataset.status = "error";
    element.textContent = message;
  }

  /* ==========================================
     BUILD REQUEST
  ========================================== */

  function buildGroups(result) {
    if (
      !result?.plan?.deliveries?.length ||
      !Array.isArray(result.results)
    ) {
      throw new Error(
        "Расчёт заказа не готов"
      );
    }

    const groups = [];

    for (const delivery of result.plan.deliveries) {
      const items = [];

      for (const productResult of result.results) {
        const detail =
          productResult.deliveries.find(
            item => item.date === delivery.date
          );

        if (!detail) {
          throw new Error(
            "Нет расчёта: " +
            productResult.product.name
          );
        }

        const cases = Number(
          detail.recommendedCases
        );

        if (
          !Number.isInteger(cases) ||
          cases < 0
        ) {
          throw new Error(
            "Некорректный CASE: " +
            productResult.product.name
          );
        }

        if (cases > 0) {
          items.push({
            product_id:
              productResult.product.id,
            case_qty: cases
          });
        }
      }

      if (items.length) {
        groups.push({
          date: delivery.date,
          items
        });
      }
    }

    return groups;
  }

  function countCases(groups) {
    return groups.reduce(
      (total, group) =>
        total + group.items.reduce(
          (sum, item) =>
            sum + item.case_qty,
          0
        ),
      0
    );
  }

  /* ==========================================
     MODAL
  ========================================== */

  function closeModal() {
    root?.querySelector(
      "#abl-confirm-modal"
    )?.remove();
  }

  function openModal(groups, orderDate) {
    closeModal();

    return new Promise(resolve => {
      const modal =
        document.createElement("div");

      modal.id = "abl-confirm-modal";

      modal.style.cssText = `
        position:fixed;
        inset:0;
        z-index:9999;
        display:flex;
        justify-content:center;
        align-items:center;
        padding:18px;
        background:rgba(0,0,0,.55);
      `;

      modal.innerHTML = `
        <div style="
          width:100%;
          max-width:460px;
          padding:25px;
          border-radius:18px;
          background:var(--abl-surface,white);
          color:var(--abl-text,#17181a);
          box-shadow:0 15px 55px rgba(0,0,0,.25);
        ">
          <h2 style="margin:0 0 12px">
            Подтвердить заказ ABL?
          </h2>

          <p style="font-size:13px">
            Дата заказа:
            <strong>${formatDate(orderDate)}</strong>
          </p>

          <div style="
            padding:12px;
            margin:14px 0;
            border:1px solid var(--abl-line,#ddd);
            border-radius:11px;
          ">
            ${groups.map(group => `
              <div style="
                display:flex;
                justify-content:space-between;
                gap:12px;
                padding:7px 0;
              ">
                <span>
                  ${formatDate(group.date)}
                </span>
                <strong>
                  ${countCases([group])} CASE
                </strong>
              </div>
            `).join("")}
          </div>

          <p style="font-size:13px">
            Всего:
            <strong>${countCases(groups)} CASE</strong>
          </p>

          <p style="
            font-size:11px;
            color:var(--abl-muted,#777);
          ">
            После подтверждения поставки
            сохранятся в разделе «Поставки».
          </p>

          <div style="
            display:flex;
            justify-content:flex-end;
            gap:10px;
            margin-top:22px;
          ">
            <button
              type="button"
              class="abl-button is-secondary"
              data-abl-modal-cancel
            >
              Отмена
            </button>

            <button
              type="button"
              class="abl-button is-primary"
              data-abl-modal-confirm
            >
              Подтвердить
            </button>
          </div>
        </div>
      `;

      root.appendChild(modal);

      function finish(value) {
        modal.remove();
        resolve(value);
      }

      modal.addEventListener("click", event => {
        if (
          event.target === modal ||
          event.target.closest(
            "[data-abl-modal-cancel]"
          )
        ) {
          finish(false);
        }

        if (
          event.target.closest(
            "[data-abl-modal-confirm]"
          )
        ) {
          finish(true);
        }
      });
    });
  }

  /* ==========================================
     READ-ONLY DISPLAY
  ========================================== */

  function renderConfirmed() {
    if (!root || !confirmedOrderId) return;

    const order = currentOrder();

    if (order?.id !== confirmedOrderId) {
      return;
    }

    const stepper = root.querySelector(
      ".abl-stepper"
    );

    if (stepper) stepper.hidden = true;

    root.querySelectorAll(
      "[data-abl-panel]"
    ).forEach(panel => {
      panel.hidden = true;
    });

    const view = root.querySelector(
      "#abl-confirmed-view"
    );

    const content = root.querySelector(
      "#abl-confirmed-content"
    );

    if (!view || !content) return;

    view.hidden = false;

    root.dataset.ablMode = "confirmed";

    const status = root.querySelector(
      "#abl-date-status"
    );

    if (status) {
      status.textContent =
        "Заказ подтверждён · " +
        formatDate(order.order_date);

      status.dataset.status = "confirmed";
    }

    content.innerHTML = `
      <div class="abl-confirmed-placeholder">
        <span class="abl-confirmed-label">
          ПОДТВЕРЖДЁННЫЙ ЗАКАЗ
        </span>

        <h2>
          Заказ ABL — ${formatDate(order.order_date)}
        </h2>

        <p>
          Заказ подтверждён.
          Редактирование закрыто.
        </p>

        ${confirmedDeliveries.map(delivery => `
          <div style="
            padding:16px;
            margin:12px 0;
            border:1px solid var(--abl-line,#ddd);
            border-radius:12px;
          ">
            <strong>
              Поставка:
              ${formatDate(delivery.delivery_date)}
            </strong>

            <p style="margin:7px 0 0">
              ${delivery.items.length} позиций ·
              ${delivery.items.reduce(
                (sum, item) =>
                  sum + Number(item.case_qty || 0),
                0
              )} CASE
            </p>

            <div style="margin-top:12px">
              ${delivery.items.map(item => `
                <div style="
                  display:flex;
                  justify-content:space-between;
                  gap:12px;
                  padding:7px 0;
                  border-top:1px solid var(--abl-line,#ddd);
                  font-size:12px;
                ">
                  <span>
                    ${escapeHTML(
                      delivery.products.get(
                        String(item.product_id)
                      ) || item.product_id
                    )}
                  </span>
                  <strong>
                    ${Number(item.case_qty || 0)} CASE
                  </strong>
                </div>
              `).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  /* ==========================================
     LOAD CONFIRMED DELIVERIES
  ========================================== */

  async function loadConfirmed(orderId) {
    const response = await client
      .from("order_deliveries")
      .select(`
        id,
        delivery_date,
        source_weekly_order_id,
        delivery_group,
        source,
        status
      `)
      .eq(
        "source_weekly_order_id",
        orderId
      )
      .eq("source", "system")
      .eq("delivery_group", "general")
      .order("delivery_date");

    if (response.error) throw response.error;

    const deliveries = response.data || [];

    if (!deliveries.length) {
      return [];
    }

    const itemsResponse = await client
      .from("order_delivery_items")
      .select(`
        delivery_id,
        product_id,
        case_qty
      `)
      .in(
        "delivery_id",
        deliveries.map(d => d.id)
      );

    if (itemsResponse.error) {
      throw itemsResponse.error;
    }

    const products = new Map(
      (getStock()?.getProducts?.() || [])
        .map(product => [
          String(product.id),
          product.name
        ])
    );

    return deliveries.map(delivery => ({
      ...delivery,
      products,
      items: (itemsResponse.data || [])
        .filter(
          item =>
            item.delivery_id === delivery.id
        )
    }));
  }

  async function checkConfirmed() {
    const order = currentOrder();

    if (!root || !order?.id) return;

    const version = ++checkVersion;
    const expectedId = order.id;

    checking = true;
    setButtonState();

    try {
      const deliveries =
        await loadConfirmed(expectedId);

      if (
        version !== checkVersion ||
        currentOrder()?.id !== expectedId ||
        !root.isConnected
      ) {
        return;
      }

      confirmedOrderId =
        deliveries.length ? expectedId : null;

      confirmedDeliveries = deliveries;

      if (confirmedOrderId) {
        renderConfirmed();
      }

    } catch (error) {
      console.error(
        "[ABL Save] Check confirmed:",
        error
      );

      showError(
        error.message ||
        "Не удалось проверить заказ"
      );

    } finally {
      if (version === checkVersion) {
        checking = false;
        setButtonState();
      }
    }
  }

  /* ==========================================
     CONFIRM ORDER
  ========================================== */

  async function confirmOrder() {
    if (saving || checking) return;

    const stock = getStock();
    const order = stock?.getOrder?.();
    const result = getResult();

    if (!order?.id || !result) {
      showError("Сначала рассчитайте заказ");
      return;
    }

    if (confirmedOrderId === order.id) {
      showError("Заказ уже подтверждён");
      return;
    }

    if (
      result.orderDate !== order.order_date ||
      stock.getOrderDate() !== order.order_date
    ) {
      showError(
        "Дата заказа и расчёта не совпадает"
      );
      return;
    }

    let groups;

    try {
      groups = buildGroups(result);
    } catch (error) {
      showError(error.message);
      return;
    }

    if (!groups.length) {
      showError(
        "По расчёту заказ не требуется"
      );
      return;
    }

    const approved = await openModal(
      groups,
      order.order_date
    );

    if (!approved) return;

    saving = true;
    setButtonState();

    try {
      await stock.flushSaves();

      if (
        stock.getOrder()?.id !== order.id ||
        getResult() !== result
      ) {
        throw new Error(
          "Данные заказа изменились. " +
          "Пересчитайте заказ"
        );
      }

      const response = await client.rpc(
        "confirm_abl_order",
        {
          p_order_id: order.id,
          p_deliveries: groups
        }
      );

      if (response.error) {
        throw response.error;
      }

      if (response.data?.success !== true) {
        throw new Error(
          "Не получено подтверждение от сервера"
        );
      }

      confirmedDeliveries =
        await loadConfirmed(order.id);

      confirmedOrderId = order.id;

      renderConfirmed();

      root.dispatchEvent(
        new CustomEvent(
          "abl:order-confirmed",
          {
            detail: {
              orderId: order.id,
              orderDate: order.order_date,
              deliveries:
                confirmedDeliveries.length
            }
          }
        )
      );

    } catch (error) {
      console.error(
        "[ABL Save] Confirm:",
        error
      );

      showError(
        error.message ||
        "Ошибка подтверждения заказа"
      );

      // RPC might have completed even
      // if the client lost its response.
      await checkConfirmed();

    } finally {
      saving = false;
      setButtonState();
    }
  }

  /* ==========================================
     EVENTS
  ========================================== */

  function bindEvents() {
    root.addEventListener("click", event => {
      const button = event.target.closest(
        "#abl-confirm-order"
      );

      if (
        !button ||
        button.disabled
      ) {
        return;
      }

      confirmOrder();
    });

    root.addEventListener(
      "abl:result-ready",
      setButtonState
    );

    root.addEventListener(
      "abl:order-loaded",
      () => {
        ++checkVersion;
        confirmedOrderId = null;
        confirmedDeliveries = [];
        checkConfirmed();
      }
    );

    root.addEventListener(
      "abl:date-changed",
      () => {
        ++checkVersion;
        confirmedOrderId = null;
        confirmedDeliveries = [];
      }
    );
  }

  function init(container) {
    const nextRoot =
      container?.querySelector(
        "#" + ROOT_ID
      ) ||
      document.getElementById(ROOT_ID);

    if (!nextRoot) return;

    if (
      nextRoot.dataset.ablSaveInitialized ===
      "true"
    ) {
      return;
    }

    root = nextRoot;

    root.dataset.ablSaveInitialized = "true";
    client = getClient();

    bindEvents();
  }

  document.addEventListener(
    "app:page-loaded",
    event => {
      if (event.detail?.route !== ROUTE) {
        return;
      }

      init(
        document.getElementById(
          "page-container"
        )
      );
    }
  );

  window.IzakazAblSave = {
    init,
    confirmOrder,
    checkConfirmed
  };

})();
