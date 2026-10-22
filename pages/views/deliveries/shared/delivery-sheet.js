
/* =====================================================
   IZAKAZ v0.2.0
   DELIVERY SHEET — ABL / COLA
===================================================== */

(function () {
  "use strict";

  const ROUTE = "delivery-sheet";

  let activeRoot = null;
  let loadVersion = 0;
  let delivery = null;

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function fmt(value) {
    return new Intl.NumberFormat("ru-RU", {
      maximumFractionDigits: 4
    }).format(Number(value || 0));
  }

  function qty(value) {
    return value == null || Number(value) === 0
      ? "—"
      : fmt(value);
  }

  function formatCode(value) {
    if (!value) return "—";

    const code = String(value);
    const digits = code.replace(/\D/g, "");

    return digits.length === 5
      ? `${digits.slice(0, 2)}-${digits.slice(2)}`
      : code;
  }

  function $(selector, root = activeRoot) {
    return root?.querySelector(selector) || null;
  }

  function setText(selector, value, root = activeRoot) {
    const element = $(selector, root);
    if (element) element.textContent = String(value ?? "");
  }

  function getClient() {
    const client =
      window.IzakazDeliveryService?.getClient?.() ||
      window.supabaseClient ||
      (typeof supabaseClient !== "undefined"
        ? supabaseClient
        : null);

    if (!client) {
      throw new Error("Supabase не подключён");
    }

    return client;
  }

  function getService() {
    const service = window.IzakazDeliveryService;

    if (!service) {
      throw new Error("delivery-service.js не загружен");
    }

    return service;
  }

  function showError(error, root = activeRoot) {
    const loading = $("#delivery-sheet-loading", root);
    const paper = $("#delivery-sheet-paper", root);
    const message = $("#delivery-sheet-error", root);

    if (loading) loading.hidden = true;
    if (paper) paper.hidden = true;

    if (message) {
      message.hidden = false;
      message.textContent =
        error?.message || String(error);
    }

    console.error("[Delivery Sheet]", error);
  }

  async function loadRestaurant(client) {
    const { data: auth, error: authError } =
      await client.auth.getUser();

    if (authError) throw authError;

    const userId = auth?.user?.id;

    if (!userId) {
      throw new Error("Пользователь не авторизован");
    }

    const { data, error } = await client
      .from("profiles")
      .select(`
        restaurant_id,
        restaurant:restaurants (
          id,
          name,
          code
        )
      `)
      .eq("id", userId)
      .single();

    if (error) throw error;

    if (!data?.restaurant_id) {
      throw new Error("Ресторан не найден");
    }

    return {
      id: data.restaurant_id,
      name: data.restaurant?.name || "Ресторан",
      code: data.restaurant?.code || null
    };
  }

  function renderHeader(detail, restaurant, service, root) {
    setText(
      "#sheet-delivery-date",
      service.formatDate(detail.delivery_date),
      root
    );

    setText(
      "#sheet-delivery-weekday",
      service.formatWeekday(detail.delivery_date),
      root
    );

    setText("#sheet-restaurant-name", restaurant.name, root);
    setText(
      "#sheet-restaurant-code",
      formatCode(restaurant.code),
      root
    );

    setText(
      "#sheet-delivery-group",
      detail.delivery_group === "cola"
        ? "Cola"
        : "Основные товары",
      root
    );

    setText(
      "#sheet-delivery-status",
      detail.statusLabel,
      root
    );

    setText(
      "#sheet-delivery-source",
      detail.source === "system"
        ? "Создано системой"
        : "Введено вручную",
      root
    );

    setText(
      "#sheet-position-count",
      detail.items.length,
      root
    );

    const noteBlock = $("#sheet-note-block", root);

    if (noteBlock) {
      noteBlock.hidden = !detail.note;
    }

    setText("#sheet-note", detail.note || "", root);
  }

  function renderItems(detail, root) {
    const body = $("#delivery-sheet-body", root);
    if (!body) return;

    if (!detail.items.length) {
      body.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center;padding:20px">
            В поставке нет товаров
          </td>
        </tr>
      `;
      return;
    }

    const items = [...detail.items].sort((a, b) => {
      const categoryCompare =
        String(a.category || "").localeCompare(
          String(b.category || ""),
          "ru"
        );

      if (categoryCompare !== 0) {
        return categoryCompare;
      }

      return String(a.name || "").localeCompare(
        String(b.name || ""),
        "ru",
        { numeric: true }
      );
    });

    body.innerHTML = items.map((item, index) => `
      <tr>
        <td>${index + 1}</td>

        <td>${esc(item.iikoCode || "—")}</td>

        <td>
          <strong class="delivery-sheet-product-name">
            ${esc(item.name)}
          </strong>
          <span class="delivery-sheet-product-category">
            ${esc(item.category)}
          </span>
        </td>

        <td>${esc(qty(item.caseQty))}</td>
        <td>${esc(qty(item.slvQty))}</td>
        <td>${esc(qty(item.pcsQty))}</td>

        <td class="delivery-sheet-item-total">
          ${esc(fmt(item.baseQty))}
          ${esc(item.unit)}
        </td>
      </tr>
    `).join("");
  }

  async function init(deliveryId) {
    const root = document.getElementById(
      "delivery-sheet-page"
    );

    if (!root) return;

    activeRoot = root;

    const version = ++loadVersion;
    delivery = null;

    const loading = $("#delivery-sheet-loading", root);
    const paper = $("#delivery-sheet-paper", root);
    const errorBox = $("#delivery-sheet-error", root);

    const loadingHost = root.querySelector(
      ".delivery-sheet-content"
    );

    window.IzakazPageLoading?.show(
      loadingHost,
      "Загрузка листа поставки…"
    );

    if (loading) loading.hidden = false;
    if (paper) paper.hidden = true;
    if (errorBox) errorBox.hidden = true;

    if (root.dataset.sheetBound !== "true") {
      root.dataset.sheetBound = "true";

      root.addEventListener("click", event => {
        if (event.target.closest("#delivery-sheet-print")) {
          if (delivery && root === activeRoot) {
            window.print();
          }
        }

        if (event.target.closest("#delivery-sheet-back")) {
          window.location.hash =
            delivery?.delivery_group === "cola"
              ? "deliveries-cola"
              : "deliveries-abl";
        }
      });
    }

    try {
      if (!deliveryId) {
        throw new Error("ID поставки не указан");
      }

      const client = getClient();
      const service = getService();

      const restaurant = await loadRestaurant(client);

      const detail = await service.loadDeliveryDetail(
        deliveryId,
        {
          restaurantId: restaurant.id
        }
      );

      if (
        version !== loadVersion ||
        !root.isConnected
      ) {
        return;
      }

      delivery = detail;

      renderHeader(detail, restaurant, service, root);
      renderItems(detail, root);

      if (loading) loading.hidden = true;
      if (paper) paper.hidden = false;

    } catch (error) {
      if (version === loadVersion) {
        showError(error, root);
      }
    } finally {
      window.IzakazPageLoading?.hide(loadingHost);
    }
  }

  document.addEventListener(
    "app:page-loaded",
    event => {
      if (event.detail?.route !== ROUTE) return;

      init(event.detail?.params?.[0]);
    }
  );

  window.IzakazDeliverySheet = { init };

})();
