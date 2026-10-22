/* =====================================================
   IZAKAZ v0.2.0
   SIDEBAR
===================================================== */

(function () {
  "use strict";

  const sidebarContainer =
    document.getElementById("sidebar-container");

  if (!sidebarContainer) {
    console.error(
      "Не найден элемент #sidebar-container"
    );
    return;
  }


  /* =====================================================
     NAVIGATION CONFIG
  ===================================================== */

  const navigation =
    window.IZAKAZ_NAVIGATION;

  if (
    !navigation ||
    !Array.isArray(navigation.menu)
  ) {
    console.error(
      "Не найден IZAKAZ_NAVIGATION"
    );
    return;
  }

  const menuItems =
    navigation.menu;

  const routes =
    navigation.routes || {};


  /* =====================================================
     MENU HTML
  ===================================================== */

  function createDirectItem(item) {
    return `
      <a
        href="#${item.route}"
        class="nav-link"
        data-route="${item.route}"
      >
        <span class="nav-icon">
          ${item.icon || ""}
        </span>

        <span class="nav-title">
          ${item.title}
        </span>
      </a>
    `;
  }


  function createSubmenuItem(item) {
    return `
      <a
        href="#${item.route}"
        class="nav-sublink"
        data-route="${item.route}"
      >
        <span class="nav-submenu-dot"></span>

        <span>
          ${item.title}
        </span>
      </a>
    `;
  }


  function createGroup(item) {
    const childrenHTML =
      item.children
        .map(createSubmenuItem)
        .join("");

    return `
      <div
        class="nav-group"
        data-nav-group="${item.id}"
      >

        <button
          type="button"
          class="nav-link nav-parent"
          data-parent="${item.id}"
          aria-expanded="false"
        >

          <span class="nav-icon">
            ${item.icon || ""}
          </span>

          <span class="nav-title">
            ${item.title}
          </span>

          <span class="nav-chevron">
            ›
          </span>

        </button>


        <div class="nav-submenu">
          ${childrenHTML}
        </div>

      </div>
    `;
  }


  const menuHTML =
    menuItems
      .map(function (item) {

        if (
          Array.isArray(item.children) &&
          item.children.length
        ) {
          return createGroup(item);
        }

        return createDirectItem(item);

      })
      .join("");


  /* =====================================================
     SIDEBAR HTML
  ===================================================== */

  sidebarContainer.innerHTML = `

    <div
      id="sidebar-overlay"
      class="sidebar-overlay"
    ></div>


    <aside
      id="sidebar"
      class="sidebar"
    >

      <!-- HEADER -->

      <div class="sidebar-header">

        <a
          href="#home"
          class="sidebar-logo"
          aria-label="izakaz — Главная"
        >
          <img
            src="../assets/images/izakaz-logo.png"
            alt="izakaz"
            class="sidebar-logo-image"
          >
        </a>


        <button
          id="sidebar-close"
          class="sidebar-close"
          type="button"
          aria-label="Закрыть меню"
        >
          ×
        </button>

      </div>


      <!-- RESTAURANT -->

      <div class="restaurant-card">

        <div
          id="sidebar-restaurant-icon"
          class="restaurant-icon"
        >
          Р
        </div>


        <div class="restaurant-info">

          <strong id="sidebar-restaurant-name">
            Загрузка...
          </strong>

          <span id="sidebar-restaurant-code">
            —
          </span>

        </div>

      </div>


      <!-- NAVIGATION -->

      <nav class="sidebar-nav">
        ${menuHTML}
      </nav>


      <!-- FOOTER -->

      <div class="sidebar-footer">

        <a
          href="#settings-profile"
          class="user-block user-block-link"
          data-route="settings-profile"
          title="Открыть профиль"
        >

          <div
            id="sidebar-user-avatar"
            class="user-avatar"
          >
            U
          </div>


          <div class="user-info">

            <strong id="sidebar-user-name">
              Пользователь
            </strong>

            <span id="sidebar-user-role">
              Администратор
            </span>

          </div>

          <span class="user-block-arrow">
            ›
          </span>

        </a>


        <button
          id="sidebar-logout-button"
          class="logout-button"
          type="button"
        >
          Выйти
        </button>


        <div
          class="sidebar-version"
          data-app-version
        ></div>

      </div>

    </aside>
  `;


  window.renderIzakazVersion?.(
    sidebarContainer
  );


  /* =====================================================
     ELEMENTS
  ===================================================== */

  const sidebar =
    document.getElementById("sidebar");

  const sidebarOverlay =
    document.getElementById(
      "sidebar-overlay"
    );

  const sidebarCloseButton =
    document.getElementById(
      "sidebar-close"
    );

  const logoutButton =
    document.getElementById(
      "sidebar-logout-button"
    );


  /* =====================================================
     MOBILE SIDEBAR
  ===================================================== */

  function openSidebar() {
    sidebar.classList.add("open");

    sidebarOverlay.classList.add(
      "show"
    );

    document.body.style.overflow =
      "hidden";
  }


  function closeSidebar() {
    sidebar.classList.remove("open");

    sidebarOverlay.classList.remove(
      "show"
    );

    document.body.style.overflow =
      "";
  }


  document.addEventListener(
    "click",
    function (event) {

      const openButton =
        event.target.closest(
          "#sidebar-open"
        );

      if (!openButton) {
        return;
      }

      openSidebar();
    }
  );


  sidebarCloseButton.addEventListener(
    "click",
    closeSidebar
  );


  sidebarOverlay.addEventListener(
    "click",
    closeSidebar
  );


  document.addEventListener(
    "keydown",
    function (event) {

      if (
        event.key === "Escape" &&
        sidebar.classList.contains("open")
      ) {
        closeSidebar();
      }

    }
  );


  /* =====================================================
     SUBMENU
  ===================================================== */

  function closeAllSubmenus(
    exceptGroup = null
  ) {

    sidebar
      .querySelectorAll(".nav-group")
      .forEach(function (group) {

        if (group === exceptGroup) {
          return;
        }

        group.classList.remove(
          "is-open"
        );

        const button =
          group.querySelector(
            ".nav-parent"
          );

        if (button) {
          button.setAttribute(
            "aria-expanded",
            "false"
          );
        }

      });
  }


  function openSubmenu(group) {
    if (!group) {
      return;
    }

    closeAllSubmenus(group);

    group.classList.add(
      "is-open"
    );

    const button =
      group.querySelector(
        ".nav-parent"
      );

    if (button) {
      button.setAttribute(
        "aria-expanded",
        "true"
      );
    }
  }


  function toggleSubmenu(group) {
    if (!group) {
      return;
    }

    const isOpen =
      group.classList.contains(
        "is-open"
      );

    if (isOpen) {

      group.classList.remove(
        "is-open"
      );

      const button =
        group.querySelector(
          ".nav-parent"
        );

      button?.setAttribute(
        "aria-expanded",
        "false"
      );

      return;
    }

    openSubmenu(group);
  }


  /* =====================================================
     CURRENT ROUTE
  ===================================================== */

  function getCurrentRoute() {
    const rawHash =
      window.location.hash
        .replace(/^#/, "")
        .trim();

    if (!rawHash) {
      return "home";
    }

    return (
      rawHash
        .split("/")
        .filter(Boolean)[0] ||
      "home"
    );
  }


  function findParentByRoute(route) {
    const routeConfig =
      routes[route];

    if (routeConfig?.parent) {
      return routeConfig.parent;
    }

    for (const item of menuItems) {

      if (!Array.isArray(item.children)) {
        continue;
      }

      const child =
        item.children.find(
          function (childItem) {
            return (
              childItem.route === route
            );
          }
        );

      if (child) {
        return item.id;
      }
    }

    return null;
  }


  /* =====================================================
     ACTIVE NAVIGATION
  ===================================================== */

  function updateActiveNavigation() {
    const route =
      getCurrentRoute();

    const parentId =
      findParentByRoute(route);


    /* Обычные ссылки */

    sidebar
      .querySelectorAll(
        "[data-route]"
      )
      .forEach(function (link) {

        link.classList.toggle(
          "active",
          link.dataset.route === route
        );

      });


    /* Parent */

    sidebar
      .querySelectorAll(
        ".nav-parent"
      )
      .forEach(function (button) {

        const isParentActive =
          button.dataset.parent ===
          parentId;

        button.classList.toggle(
          "has-active-child",
          isParentActive
        );

      });


    /* Автоматически открываем parent */

    if (parentId) {

      const group =
        sidebar.querySelector(
          `[data-nav-group="${parentId}"]`
        );

      openSubmenu(group);

    } else {

      closeAllSubmenus();

    }
  }


  /* =====================================================
     SIDEBAR CLICK
  ===================================================== */

  sidebar.addEventListener(
    "click",
    function (event) {

      /* Parent submenu */

      const parentButton =
        event.target.closest(
          ".nav-parent"
        );

      if (parentButton) {

        const group =
          parentButton.closest(
            ".nav-group"
          );

        toggleSubmenu(group);

        return;
      }


      /* Route */

      const routeLink =
        event.target.closest(
          "[data-route]"
        );

      if (!routeLink) {
        return;
      }


      if (
        window.innerWidth <= 820
      ) {
        closeSidebar();
      }

    }
  );


  /* =====================================================
     ROLE NAME
  ===================================================== */

  function getRoleName(role) {
    const roleNames = {
      admin: "Администратор",
      manager: "Менеджер",
      viewer: "Наблюдатель"
    };

    return (
      roleNames[role] ||
      "Пользователь"
    );
  }


  /* =====================================================
     INITIALS
  ===================================================== */

  function getInitials(fullName) {
    if (!fullName) {
      return "U";
    }

    return fullName
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(function (word) {
        return word
          .charAt(0)
          .toUpperCase();
      })
      .join("");
  }


  /* =====================================================
     RESTAURANT CODE
  ===================================================== */

  function formatRestaurantCode(code) {
    if (!code) {
      return "Код не указан";
    }

    const cleanCode =
      String(code)
        .replace(/\D/g, "");

    if (cleanCode.length === 5) {
      return (
        cleanCode.slice(0, 2) +
        "-" +
        cleanCode.slice(2)
      );
    }

    return String(code);
  }


  /* =====================================================
     TEXT
  ===================================================== */

  function setText(
    elementId,
    value
  ) {

    const element =
      document.getElementById(
        elementId
      );

    if (!element) {
      return;
    }

    element.textContent =
      value;
  }


  /* =====================================================
     LOAD SIDEBAR DATA
  ===================================================== */

  async function loadSidebarData() {
    try {

      const {
        data: userData,
        error: userError
      } =
        await supabaseClient
          .auth
          .getUser();


      if (
        userError ||
        !userData?.user
      ) {

        window.location.href =
          "../index.html";

        return;
      }


      const user =
        userData.user;


      const {
        data: profile,
        error: profileError
      } =
        await supabaseClient
          .from("profiles")
          .select(`
            full_name,
            role,
            restaurant:restaurants (
              id,
              name,
              code
            )
          `)
          .eq(
            "id",
            user.id
          )
          .single();


      if (profileError) {
        console.error(
          "Ошибка загрузки sidebar:",
          profileError
        );
      }


      const fullName =
        profile?.full_name ||
        user.user_metadata
          ?.full_name ||
        user.email ||
        "Пользователь";


      const restaurantName =
        profile?.restaurant?.name ||
        user.user_metadata
          ?.restaurant_name ||
        "Ресторан";


      const restaurantCode =
        formatRestaurantCode(
          profile?.restaurant?.code ||
          user.user_metadata
            ?.restaurant_code
        );


      const role =
        getRoleName(
          profile?.role ||
          "admin"
        );


      setText(
        "sidebar-user-name",
        fullName
      );

      setText(
        "sidebar-user-role",
        role
      );

      setText(
        "sidebar-user-avatar",
        getInitials(fullName)
      );

      setText(
        "sidebar-restaurant-name",
        restaurantName
      );

      setText(
        "sidebar-restaurant-code",
        restaurantCode
      );


      const firstRestaurantLetter =
        String(restaurantName)
          .trim()
          .charAt(0)
          .toUpperCase() ||
        "Р";


      setText(
        "sidebar-restaurant-icon",
        firstRestaurantLetter
      );


    } catch (error) {

      console.error(
        "Ошибка загрузки sidebar:",
        error
      );

    }
  }


  /* =====================================================
     LOGOUT
  ===================================================== */

  logoutButton.addEventListener(
    "click",
    async function () {

      logoutButton.disabled =
        true;

      logoutButton.textContent =
        "Выход...";


      try {

        const { error } =
          await supabaseClient
            .auth
            .signOut();


        if (error) {
          throw error;
        }


        window.location.href =
          "../index.html";


      } catch (error) {

        console.error(
          "Ошибка выхода:",
          error
        );


        logoutButton.disabled =
          false;

        logoutButton.textContent =
          "Выйти";
      }

    }
  );


  /* =====================================================
     ROUTE WATCH
  ===================================================== */

  window.addEventListener(
    "hashchange",
    updateActiveNavigation
  );


  /* =====================================================
     START
  ===================================================== */

  updateActiveNavigation();

  loadSidebarData();

})();