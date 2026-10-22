/* IZAKAZ v0.2.0 — DELIVERIES / ABL */
(function () {
  "use strict";
  const ROUTE = "deliveries-abl";
  let page = null;

  async function init() {
    const root = document.getElementById("deliveries-abl-page");
    if (!root) return null;
    const service = window.IzakazDeliveryService;
    if (!service?.mountEditor) {
      console.error("[ABL Deliveries] delivery-service-final.js not loaded");
      return null;
    }
    window.IzakazPageLoading?.show(root, "Загрузка поставок ABL…");
    try {
      page = service.mountEditor({
        rootId: "deliveries-abl-page",
        prefix: "dabl",
        group: "general",
        title: "ABL"
      });
      await page?.ready;
    } finally {
      window.IzakazPageLoading?.hide(root);
    }
    return page;
  }

  document.addEventListener("app:page-loaded", event => {
    if (event.detail?.route === ROUTE) init();
  });

  window.IzakazAblDeliveries = {
    init,
    reload: () => page?.reload?.(),
    getDeliveries: () => page?.getDeliveries?.() || [],
    getCurrentDetail: () => page?.getCurrentDetail?.() || null
  };
})();
