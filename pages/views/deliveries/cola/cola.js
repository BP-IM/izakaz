/* IZAKAZ v0.2.0 — DELIVERIES / COLA */
(function () {
  "use strict";
  const ROUTE = "deliveries-cola";
  let page = null;

  async function init() {
    const root = document.getElementById("deliveries-cola-page");
    if (!root) return null;
    const service = window.IzakazDeliveryService;
    if (!service?.mountEditor) {
      console.error("[Cola Deliveries] delivery-service-final.js not loaded");
      return null;
    }
    window.IzakazPageLoading?.show(root, "Загрузка поставок Cola…");
    try {
      page = service.mountEditor({
        rootId: "deliveries-cola-page",
        prefix: "dcola",
        group: "cola",
        title: "Cola"
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

  window.IzakazColaDeliveries = {
    init,
    reload: () => page?.reload?.(),
    getDeliveries: () => page?.getDeliveries?.() || [],
    getCurrentDetail: () => page?.getCurrentDetail?.() || null
  };
})();
