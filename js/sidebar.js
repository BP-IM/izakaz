/* =====================================================
   ОБЩИЙ SIDEBAR ДЛЯ ВСЕХ СТРАНИЦ
===================================================== */

(function () {
  const sidebarContainer =
    document.getElementById("sidebar-container");

  if (!sidebarContainer) {
    console.error(
      "Не найден элемент #sidebar-container"
    );

    return;
  }


  /* =====================================================
     СПИСОК МЕНЮ
  ===================================================== */

  const menuItems = [
    {
        route: "home",
        icon: "⌂",
        title: "Главная"
    },
    {
        route: "inventory",
        icon: "▦",
        title: "Инвентаризация"
    },
    {
        route: "inventory-lists",
        icon: "≡",
        title: "Списки инвентаризации"
    },
    {
        route: "order",
        icon: "＋",
        title: "Еженедельный заказ"
    },
    {
        route: "deliveries",
        icon: "◷",
        title: "Поставки"
    },
    {
        route: "settings",
        icon: "⚙",
        title: "Настройки"
    }
  ];

  /* =====================================================
     СОЗДАЕМ ССЫЛКИ МЕНЮ
  ===================================================== */

  const menuHTML = menuItems
        .map(function (item) {
        return `
        <a
            href="#${item.route}"
            class="nav-link"
            data-route="${item.route}"
        >
            <span class="nav-icon">
            ${item.icon}
            </span>

            <span>
            ${item.title}
            </span>
        </a>
        `;
    })
   .join("");


  /* =====================================================
     ВСТАВЛЯЕМ SIDEBAR
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
      <div class="sidebar-header">

        <a
          href="dashboard.html"
          class="sidebar-logo"
        >
          I’M <span>Заказ</span>
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


      <nav class="sidebar-nav">
        ${menuHTML}
      </nav>


      <div class="sidebar-footer">

        <div class="user-block">

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

        </div>

        <button
          id="sidebar-logout-button"
          class="logout-button"
          type="button"
        >
          Выйти
        </button>

      </div>

    </aside>
  `;


  /* =====================================================
     ЭЛЕМЕНТЫ SIDEBAR
  ===================================================== */

  const sidebar =
    document.getElementById("sidebar");

  const sidebarOverlay =
    document.getElementById("sidebar-overlay");

  const sidebarCloseButton =
    document.getElementById("sidebar-close");

  const sidebarOpenButton =
    document.getElementById("sidebar-open");

  const logoutButton =
    document.getElementById(
      "sidebar-logout-button"
    );


  /* =====================================================
     МОБИЛЬНОЕ МЕНЮ
  ===================================================== */

  function openSidebar() {
    sidebar.classList.add("open");
    sidebarOverlay.classList.add("show");

    document.body.style.overflow = "hidden";
  }


  function closeSidebar() {
    sidebar.classList.remove("open");
    sidebarOverlay.classList.remove("show");

    document.body.style.overflow = "";
  }


  document.addEventListener(
    "click",
    function (event) {

      const openButton =
        event.target.closest(
          "#sidebar-open"
        );


      if (openButton) {

        openSidebar();

      }

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


  /* =====================================================
     НАЗВАНИЕ РОЛИ
  ===================================================== */

  function getRoleName(role) {
    const roleNames = {
      admin: "Администратор",
      manager: "Менеджер",
      viewer: "Наблюдатель"
    };

    return roleNames[role] || "Пользователь";
  }


  /* =====================================================
     ИНИЦИАЛЫ
  ===================================================== */

  function getInitials(fullName) {
    if (!fullName) {
      return "U";
    }

    return fullName
      .split(" ")
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
     ФОРМАТ КОДА РЕСТОРАНА
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

    return code;
  }


  /* =====================================================
     ЗАГРУЗКА ДАННЫХ SIDEBAR
  ===================================================== */

  async function loadSidebarData() {
    try {
      const {
        data: userData,
        error: userError
      } =
        await supabaseClient.auth.getUser();


      if (
        userError ||
        !userData.user
      ) {
        window.location.href =
          "../index.html";

        return;
      }


      const user = userData.user;


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
          .eq("id", user.id)
          .single();


      if (profileError) {
        console.error(
          "Ошибка загрузки sidebar:",
          profileError
        );
      }


      const fullName =
        profile?.full_name ||
        user.user_metadata?.full_name ||
        user.email ||
        "Пользователь";


      const restaurantName =
        profile?.restaurant?.name ||
        user.user_metadata?.restaurant_name ||
        "Ресторан";


      const restaurantCode =
        formatRestaurantCode(
          profile?.restaurant?.code ||
          user.user_metadata?.restaurant_code
        );


      const role =
        getRoleName(
          profile?.role || "admin"
        );


      document
        .getElementById(
          "sidebar-user-name"
        )
        .textContent = fullName;


      document
        .getElementById(
          "sidebar-user-role"
        )
        .textContent = role;


      document
        .getElementById(
          "sidebar-user-avatar"
        )
        .textContent =
          getInitials(fullName);


      document
        .getElementById(
          "sidebar-restaurant-name"
        )
        .textContent =
          restaurantName;


      document
        .getElementById(
          "sidebar-restaurant-code"
        )
        .textContent =
          restaurantCode;


      document
        .getElementById(
          "sidebar-restaurant-icon"
        )
        .textContent =
          restaurantName
            .charAt(0)
            .toUpperCase() || "Р";

    } catch (error) {
      console.error(
        "Ошибка загрузки sidebar:",
        error
      );
    }
  }


  /* =====================================================
     ВЫХОД
  ===================================================== */

  logoutButton.addEventListener(
    "click",
    async function () {
      logoutButton.disabled = true;
      logoutButton.textContent =
        "Выход...";

      try {
        const { error } =
          await supabaseClient.auth.signOut();

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

        logoutButton.disabled = false;
        logoutButton.textContent =
          "Выйти";
      }
    }
  );


  /* =====================================================
     ЗАПУСК
  ===================================================== */

  loadSidebarData();
})();