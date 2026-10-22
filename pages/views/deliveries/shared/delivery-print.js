
/* ==========================================================
   IZAKAZ v0.2.0
   DELIVERY PRINT / PDF NAVIGATION

   ABL + COLA
   Shared module

   - Opens delivery sheet route
   - Checks selected delivery
   - Validates delivery group
   - No about:blank
   - No duplicate click handlers
========================================================== */

(function () {
  "use strict";

  const CONFIG = {
    "dabl-print": {
      group: "general",
      module: "IzakazAblDeliveries",
      rootId: "deliveries-abl-page"
    },

    "dcola-print": {
      group: "cola",
      module: "IzakazColaDeliveries",
      rootId: "deliveries-cola-page"
    }
  };

  /* ========================================================
     HELPERS
  ======================================================== */

  function getConfig(buttonId) {
    return CONFIG[buttonId] || null;
  }

  function getDelivery(config) {
    const deliveryModule =
      window[config.module];

    if (
      !deliveryModule ||
      typeof deliveryModule.getCurrentDetail !==
        "function"
    ) {
      throw new Error(
        "Модуль поставки ещё не загружен"
      );
    }

    const detail =
      deliveryModule.getCurrentDetail();

    if (!detail?.id) {
      throw new Error(
        "Сначала откройте поставку " +
        "и дождитесь загрузки товаров"
      );
    }

    if (
      detail.delivery_group !== config.group
    ) {
      throw new Error(
        "Группа поставки не совпадает"
      );
    }

    return detail;
  }

  function openSheet(deliveryId) {
    if (!deliveryId) {
      throw new Error(
        "Не указан ID поставки"
      );
    }

    const id = String(deliveryId).trim();

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidPattern.test(id)) {
      throw new Error(
        "Некорректный ID поставки"
      );
    }

    window.location.hash =
      "delivery-sheet/" +
      encodeURIComponent(id);
  }

  /* ========================================================
     PRINT BUTTON CLICK
  ======================================================== */

  function handleClick(event) {
    const button = event.target.closest(
      "#dabl-print, #dcola-print"
    );

    if (!button) return;

    const config = getConfig(button.id);

    if (!config) return;

    const root =
      document.getElementById(config.rootId);

    if (!root || !root.contains(button)) {
      return;
    }

    event.preventDefault();

    if (button.disabled) {
      return;
    }

    try {
      const detail = getDelivery(config);

      openSheet(detail.id);

    } catch (error) {
      console.error(
        "[IZAKAZ Delivery Print]",
        error
      );

      alert(
        error.message ||
        "Не удалось открыть лист поставки"
      );
    }
  }

  /* ========================================================
     INITIALIZE ONCE
  ======================================================== */

  if (!window.__izakazDeliveryPrintBound) {
    document.addEventListener(
      "click",
      handleClick
    );

    window.__izakazDeliveryPrintBound = true;
  }

  /* ========================================================
     PUBLIC API
  ======================================================== */

  window.IzakazDeliveryPrint = {
    open: openSheet,

    openABL() {
      const detail = getDelivery(
        CONFIG["dabl-print"]
      );

      openSheet(detail.id);
    },

    openCola() {
      const detail = getDelivery(
        CONFIG["dcola-print"]
      );

      openSheet(detail.id);
    }
  };

})();
