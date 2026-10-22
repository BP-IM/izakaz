
/* ==========================================
   IZAKAZ v0.2.0
   HOME PAGE
========================================== */

(function () {
  "use strict";

  let root = null;

  /* ==========================================
     CURRENT DATE
  ========================================== */

  function updateCurrentDate(page) {
    const dateElement = page.querySelector(
      "#home-current-date"
    );

    if (!dateElement) return;

    const today = new Date();

    dateElement.textContent =
      new Intl.DateTimeFormat("ru-RU", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric"
      }).format(today);
  }

  /* ==========================================
     USER GREETING
  ========================================== */

  async function loadUserGreeting(page) {
    const title = page.querySelector(
      "#home-welcome-title"
    );

    if (!title) return;

    title.textContent = "Добрый день!";

    if (
      typeof supabaseClient === "undefined" ||
      !supabaseClient?.auth
    ) {
      console.warn(
        "[Home] Supabase client is unavailable"
      );
      return;
    }

    try {
      const {
        data: userData,
        error: userError
      } = await supabaseClient.auth.getUser();

      if (userError) {
        throw userError;
      }

      const user = userData?.user;

      if (!user) return;

      const {
        data: profile,
        error: profileError
      } = await supabaseClient
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        throw profileError;
      }

      const fullName =
        profile?.full_name ||
        user.user_metadata?.full_name ||
        "";

      const firstName = String(fullName)
        .trim()
        .split(/\s+/)
        .filter(Boolean)[0] || "";

      // SPA navigation may have removed the page
      // while the request was running.
      if (!page.isConnected) return;

      if (
        document.getElementById("home-page") !== page
      ) {
        return;
      }

      title.textContent = firstName
        ? `Добрый день, ${firstName}!`
        : "Добрый день!";

    } catch (error) {
      console.error(
        "[Home] Failed to load user greeting:",
        error
      );
    }
  }

  /* ==========================================
     PAGE INIT
  ========================================== */

  async function init() {
    root = document.getElementById("home-page");

    if (!root) return;

    updateCurrentDate(root);

    const content = root.querySelector(".home-content");

    window.IzakazPageLoading?.show(
      content,
      "Загрузка главной страницы…"
    );

    try {
      await loadUserGreeting(root);
    } finally {
      window.IzakazPageLoading?.hide(content);
    }
  }

  /* ==========================================
     SPA ROUTER
  ========================================== */

  document.addEventListener(
    "app:page-loaded",
    function (event) {
      if (event.detail?.route === "home") {
        init();
      }
    }
  );

})();
