/* =====================================================
   ОБЩИЙ SIDEBAR ДЛЯ ВСЕХ СТРАНИЦ
===================================================== */

(function () {

  const sidebarContainer =
    document.getElementById("sidebar-container");


  /* =====================================================
     ПРОВЕРКА SIDEBAR CONTAINER
  ===================================================== */

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


      <!-- HEADER -->

      <div class="sidebar-header">

        <a
          href="dashboard.html"
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
     ЭЛЕМЕНТЫ SIDEBAR
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
     МОБИЛЬНОЕ МЕНЮ
  ===================================================== */

  function openSidebar() {

    sidebar.classList.add("open");

    sidebarOverlay.classList.add("show");

    document.body.style.overflow =
      "hidden";
  }


  function closeSidebar() {

    sidebar.classList.remove("open");

    sidebarOverlay.classList.remove("show");

    document.body.style.overflow =
      "";
  }


  /* =====================================================
     ОТКРЫТИЕ SIDEBAR
  ===================================================== */

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


  /* =====================================================
     ЗАКРЫТИЕ SIDEBAR
  ===================================================== */

  sidebarCloseButton.addEventListener(
    "click",
    closeSidebar
  );


  sidebarOverlay.addEventListener(
    "click",
    closeSidebar
  );


  /* =====================================================
     ESC ДЛЯ ЗАКРЫТИЯ SIDEBAR
  ===================================================== */

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
     ЗАКРЫТИЕ ПОСЛЕ ВЫБОРА ПУНКТА
     ТОЛЬКО НА МОБИЛЬНОЙ ВЕРСИИ
  ===================================================== */

  sidebar.addEventListener(
    "click",
    function (event) {

      const navLink =
        event.target.closest(
          ".nav-link"
        );

      if (!navLink) {
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
     НАЗВАНИЕ РОЛИ
  ===================================================== */

  function getRoleName(role) {

    const roleNames = {

      admin:
        "Администратор",

      manager:
        "Менеджер",

      viewer:
        "Наблюдатель"

    };

    return (
      roleNames[role] ||
      "Пользователь"
    );
  }


  /* =====================================================
     ИНИЦИАЛЫ
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


    return String(code);
  }


  /* =====================================================
     БЕЗОПАСНОЕ ИЗМЕНЕНИЕ TEXTCONTENT
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
     ЗАГРУЗКА ДАННЫХ SIDEBAR
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


      /* Проверяем пользователя */

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


      /* Загружаем профиль */

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


      /* =====================================================
         ДАННЫЕ
      ===================================================== */

      const fullName =

        profile?.full_name ||

        user.user_metadata
          ?.full_name ||

        user.email ||

        "Пользователь";


      const restaurantName =

        profile
          ?.restaurant
          ?.name ||

        user.user_metadata
          ?.restaurant_name ||

        "Ресторан";


      const restaurantCode =
        formatRestaurantCode(

          profile
            ?.restaurant
            ?.code ||

          user.user_metadata
            ?.restaurant_code

        );


      const role =
        getRoleName(

          profile?.role ||
          "admin"

        );


      /* =====================================================
         ВЫВОД ДАННЫХ
      ===================================================== */

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
     ВЫХОД
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
     ЗАПУСК
  ===================================================== */

  loadSidebarData();

})();