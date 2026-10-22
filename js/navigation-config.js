/* =====================================================
   IZAKAZ v0.2.0
   NAVIGATION CONFIG

   Sidebar + Router үшін ортақ конфигурация.
   Жаңа меню немесе submenu қосу керек болса,
   негізгі өзгеріс осы файлда жасалады.
===================================================== */

(function () {
  "use strict";

  /* =====================================================
     SIDEBAR MENU
  ===================================================== */

  const menu = [
    {
      id: "home",
      title: "Главная",
      icon: "⌂",
      route: "home"
    },

    {
      id: "inventory",
      title: "Инвентаризация",
      icon: "▦",

      children: [

        {
          id: "inventory-count",
          title: "Проведение инвентаризации",
          route: "inventory-count"
        },

        {
          id: "inventory-lists",
          title: "Списки инвентаризации",
          route: "inventory-lists"
        }

      ]
    },

    {
      id: "orders",
      title: "Заказы",
      icon: "＋",

      children: [
        {
          id: "order-cola",
          title: "Заказ Cola",
          route: "order-cola"
        },

        {
          id: "order-abl",
          title: "Заказ ABL",
          route: "order-abl"
        }
      ]
    },

    {
      id: "deliveries",
      title: "Поставки",
      icon: "◷",

      children: [
        {
          id: "deliveries-cola",
          title: "Cola",
          route: "deliveries-cola"
        },

        {
          id: "deliveries-abl",
          title: "ABL",
          route: "deliveries-abl"
        }
      ]
    },

    {
      id: "settings",
      title: "Настройки",
      icon: "⚙",

      children: [
        {
          id: "settings-delivery",
          title: "График поставок",
          route: "settings-delivery"
        },

        {
          id: "settings-products",
          title: "Товары",
          route: "settings-products"
        },

        {
          id: "settings-sales",
          title: "Реализация",
          route: "settings-sales"
        },

        {
          id: "settings-profile",
          title: "Профиль",
          route: "settings-profile"
        }
      ]
    }
  ];


  /* =====================================================
     ROUTES

     implemented:
     true  = функция уже существует
     false = пока только пункт Sidebar,
             страницу сделаем позже
  ===================================================== */

  const routes = {
    home: {
      title: "Главная",
      file: "views/home.html",
      parent: null,
      implemented: true
    },


    /* =========================
       ИНВЕНТАРИЗАЦИЯ
    ========================= */
    
    "inventory-count": {

      title: "Проведение инвентаризации",

      file: "views/inventory.html",

      parent: "inventory",

      inventoryTab: "count",

      implemented: true

    },


    "inventory-lists": {

      title:
        "Списки инвентаризации",

      file:
        "views/inventory.html",

      parent:
        "inventory",

      inventoryTab:
        "lists",

      implemented:
        true

    },


    /* =========================
       ЗАКАЗЫ
    ========================= */

    "order-cola": {
      title: "Заказ Cola",
      file: "views/order/cola/cola.html",
      parent: "orders",
      orderType: "cola",
      implemented: true
    },

    "order-abl": {
      title: "Заказ ABL",
      file: "views/order/abl/abl.html",
      parent: "orders",
      orderType: "abl",
      implemented: true
    },


    /* =========================
       ПОСТАВКИ
    ========================= */

    "deliveries-cola": {
      title: "Поставки Cola",
      file: "views/deliveries/cola/cola.html",
      parent: "deliveries",
      deliveryType: "cola",
      implemented: true
    },

    "deliveries-abl": {
      title: "Поставки ABL",
      file: "views/deliveries/abl/abl.html",
      parent: "deliveries",
      deliveryType: "abl",
      implemented: true
    },

    "delivery-sheet": {
      title: "Лист поставки",
      file: "views/deliveries/shared/delivery-sheet.html",
      parent: "deliveries",
      implemented: true
    },



    /* =========================
       НАСТРОЙКИ
    ========================= */

    "settings-delivery": {
      title: "График поставок",
      file: "views/settings.html",
      parent: "settings",
      settingsTab: "delivery",
      implemented: true
    },

    "settings-products": {
      title: "Товары",
      file: "views/settings.html",
      parent: "settings",
      settingsTab: "products",
      implemented: true
    },

    "settings-sales": {
      title: "Реализация",
      file: "views/settings.html",
      parent: "settings",
      settingsTab: "sales",
      implemented: true
    },

    "settings-profile": {
      title: "Профиль",
      file: "views/settings.html",
      parent: "settings",
      settingsTab: "profile",
      implemented: true
    }
  };


  /* =====================================================
     PUBLIC CONFIG
  ===================================================== */

  window.IZAKAZ_NAVIGATION = {
    menu,
    routes
  };

})();
