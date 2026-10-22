/* =====================================================
   I’M | ЗАКАЗ
   SETTINGS — DELIVERY SCHEDULE
   GENERAL + COLA
===================================================== */

(function () {
  "use strict";


  const DAY_NAMES = {
    1: "ПН",
    2: "ВТ",
    3: "СР",
    4: "ЧТ",
    5: "ПТ",
    6: "СБ",
    7: "ВС"
  };


  const DELIVERY_GROUPS = {
    general: {
      title: "Основные товары",

      description:
        "Общий график для Fresh, Freezer, Cooler, Сухой, Химии и Хоз. товаров"
    },

    cola: {
      title: "Cola",

      description:
        "Отдельный график поставок для категории Cola"
    }
  };


  let root = null;

  let restaurantId = null;

  let activeGroup =
    "general";

  let isDirty =
    false;

  let isSaving =
    false;


  /*
    Структура:

    scheduleByGroup = Map {
      general => Map {
        1 => {...},
        2 => {...}
      },

      cola => Map {
        ...
      }
    }
  */

  let scheduleByGroup =
    new Map();


  /* =====================================================
     RESTAURANT
  ===================================================== */

  async function getRestaurantId() {
    if (restaurantId) {
      return restaurantId;
    }


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
      throw new Error(
        "Не удалось определить пользователя."
      );
    }


    const {
      data: profile,
      error: profileError
    } =
      await supabaseClient
        .from("profiles")
        .select(
          "restaurant_id"
        )
        .eq(
          "id",
          userData.user.id
        )
        .single();


    if (profileError) {
      throw profileError;
    }


    if (
      !profile?.restaurant_id
    ) {
      throw new Error(
        "У пользователя не указан ресторан."
      );
    }


    restaurantId =
      profile.restaurant_id;


    return restaurantId;
  }


  /* =====================================================
     STATUS
  ===================================================== */

  function setStatus(
    text,
    type = ""
  ) {
    const element =
      root?.querySelector(
        "#delivery-save-status"
      );


    if (!element) {
      return;
    }


    element.className =
      "delivery-save-status";


    if (type) {
      element.classList.add(
        `is-${type}`
      );
    }


    element.textContent =
      text;
  }


  function markDirty() {
    isDirty =
      true;


    setStatus(
      "Есть несохраненные изменения"
    );
  }


  /* =====================================================
     DEFAULT STATE
  ===================================================== */

  function createDefaultItem(
    group,
    weekday
  ) {
    return {
      restaurant_id:
        restaurantId,

      delivery_group:
        group,

      weekday:
        weekday,

      source_order_day:
        "monday",

      is_active:
        false
    };
  }


  function createEmptyGroup(
    group
  ) {
    const map =
      new Map();


    for (
      let weekday = 1;
      weekday <= 7;
      weekday++
    ) {
      map.set(
        weekday,
        createDefaultItem(
          group,
          weekday
        )
      );
    }


    return map;
  }


  function resetScheduleState() {
    scheduleByGroup =
      new Map();


    scheduleByGroup.set(
      "general",
      createEmptyGroup(
        "general"
      )
    );


    scheduleByGroup.set(
      "cola",
      createEmptyGroup(
        "cola"
      )
    );
  }


  function getActiveGroupMap() {
    if (
      !scheduleByGroup.has(
        activeGroup
      )
    ) {
      scheduleByGroup.set(
        activeGroup,
        createEmptyGroup(
          activeGroup
        )
      );
    }


    return scheduleByGroup.get(
      activeGroup
    );
  }


  /* =====================================================
     ROW STATE
  ===================================================== */

  function updateRowState(
    row
  ) {
    const checkbox =
      row.querySelector(
        "[data-delivery-active]"
      );


    const select =
      row.querySelector(
        "[data-delivery-source]"
      );


    if (
      !checkbox ||
      !select
    ) {
      return;
    }


    const active =
      checkbox.checked;


    row.classList.toggle(
      "is-active",
      active
    );


    select.disabled =
      !active;
  }


  /* =====================================================
     UI → MEMORY
  ===================================================== */

  function syncCurrentUiToState() {
    const groupMap =
      getActiveGroupMap();


    root
      .querySelectorAll(
        "[data-delivery-day]"
      )
      .forEach(
        function (row) {
          const weekday =
            Number(
              row.dataset
                .deliveryDay
            );


          const checkbox =
            row.querySelector(
              "[data-delivery-active]"
            );


          const select =
            row.querySelector(
              "[data-delivery-source]"
            );


          if (
            !checkbox ||
            !select
          ) {
            return;
          }


          groupMap.set(
            weekday,
            {
              restaurant_id:
                restaurantId,

              delivery_group:
                activeGroup,

              weekday:
                weekday,

              source_order_day:
                select.value ||
                "monday",

              is_active:
                checkbox.checked
            }
          );
        }
      );
  }


  /* =====================================================
     MEMORY → UI
  ===================================================== */

  function renderGroup() {
    const config =
      DELIVERY_GROUPS[
        activeGroup
      ];


    const groupMap =
      getActiveGroupMap();


    /*
      Group tabs
    */

    root
      .querySelectorAll(
        "[data-delivery-group]"
      )
      .forEach(
        function (button) {
          button.classList.toggle(
            "is-active",

            button.dataset
              .deliveryGroup ===
              activeGroup
          );
        }
      );


    /*
      Header copy
    */

    const title =
      root.querySelector(
        "#delivery-current-group-title"
      );


    const description =
      root.querySelector(
        "#delivery-current-group-description"
      );


    const summaryGroup =
      root.querySelector(
        "#delivery-summary-group"
      );


    if (title) {
      title.textContent =
        config?.title ||
        activeGroup;
    }


    if (description) {
      description.textContent =
        config?.description ||
        "";
    }


    if (summaryGroup) {
      summaryGroup.textContent =
        config?.title ||
        activeGroup;
    }


    /*
      Days
    */

    root
      .querySelectorAll(
        "[data-delivery-day]"
      )
      .forEach(
        function (row) {
          const weekday =
            Number(
              row.dataset
                .deliveryDay
            );


          const item =
            groupMap.get(
              weekday
            ) ||
            createDefaultItem(
              activeGroup,
              weekday
            );


          const checkbox =
            row.querySelector(
              "[data-delivery-active]"
            );


          const select =
            row.querySelector(
              "[data-delivery-source]"
            );


          if (
            !checkbox ||
            !select
          ) {
            return;
          }


          checkbox.checked =
            Boolean(
              item.is_active
            );


          select.value =
            item.source_order_day ||
            "monday";


          updateRowState(
            row
          );
        }
      );


    updateSummary();
  }


  /* =====================================================
     SUMMARY
  ===================================================== */

  function updateSummary() {
    const monday = [];

    const thursday = [];


    root
      .querySelectorAll(
        "[data-delivery-day]"
      )
      .forEach(
        function (row) {
          const checkbox =
            row.querySelector(
              "[data-delivery-active]"
            );


          if (
            !checkbox?.checked
          ) {
            return;
          }


          const weekday =
            Number(
              row.dataset
                .deliveryDay
            );


          const select =
            row.querySelector(
              "[data-delivery-source]"
            );


          const source =
            select?.value;


          if (
            source ===
            "monday"
          ) {
            monday.push(
              DAY_NAMES[
                weekday
              ]
            );
          }


          if (
            source ===
            "thursday"
          ) {
            thursday.push(
              DAY_NAMES[
                weekday
              ]
            );
          }
        }
      );


    const mondayElement =
      root.querySelector(
        "#delivery-monday-summary"
      );


    const thursdayElement =
      root.querySelector(
        "#delivery-thursday-summary"
      );


    if (mondayElement) {
      mondayElement.textContent =
        monday.length
          ? monday.join(" → ")
          : "Нет поставок";
    }


    if (thursdayElement) {
      thursdayElement.textContent =
        thursday.length
          ? thursday.join(" → ")
          : "Нет поставок";
    }
  }


  /* =====================================================
     SWITCH GROUP
  ===================================================== */

  function switchGroup(
    group
  ) {
    if (
      !DELIVERY_GROUPS[group] ||
      group === activeGroup
    ) {
      return;
    }


    /*
      Сначала сохраняем текущие
      несохраненные изменения в memory.
    */

    syncCurrentUiToState();


    activeGroup =
      group;


    renderGroup();


    if (isDirty) {
      setStatus(
        "Есть несохраненные изменения"
      );
    } else {
      setStatus(
        "График загружен",
        "success"
      );
    }
  }


  /* =====================================================
     LOAD
  ===================================================== */

  async function loadSchedule() {
    setStatus(
      "Загрузка графиков..."
    );


    const id =
      await getRestaurantId();


    /*
      После получения restaurantId
      создаем blank-state.
    */

    resetScheduleState();


    const {
      data,
      error
    } =
      await supabaseClient
        .from(
          "restaurant_delivery_schedule"
        )
        .select(`
          delivery_group,
          weekday,
          source_order_day,
          is_active
        `)
        .eq(
          "restaurant_id",
          id
        )
        .order(
          "delivery_group"
        )
        .order(
          "weekday"
        );


    if (error) {
      throw error;
    }


    (
      data || []
    ).forEach(
      function (item) {
        const group =
          item.delivery_group ||
          "general";


        if (
          !DELIVERY_GROUPS[
            group
          ]
        ) {
          return;
        }


        if (
          !scheduleByGroup.has(
            group
          )
        ) {
          scheduleByGroup.set(
            group,
            createEmptyGroup(
              group
            )
          );
        }


        scheduleByGroup
          .get(group)
          .set(
            Number(
              item.weekday
            ),
            {
              restaurant_id:
                id,

              delivery_group:
                group,

              weekday:
                Number(
                  item.weekday
                ),

              source_order_day:
                item.source_order_day ||
                "monday",

              is_active:
                Boolean(
                  item.is_active
                )
            }
          );
      }
    );


    activeGroup =
      "general";


    isDirty =
      false;


    renderGroup();


    setStatus(
      "Графики загружены",
      "success"
    );
  }


  /* =====================================================
     BUILD PAYLOAD
  ===================================================== */

  function buildPayload() {
    /*
      Сохраняем текущий экран
      перед формированием payload.
    */

    syncCurrentUiToState();


    const payload = [];


    Object.keys(
      DELIVERY_GROUPS
    ).forEach(
      function (group) {
        const groupMap =
          scheduleByGroup.get(
            group
          ) ||
          createEmptyGroup(
            group
          );


        for (
          let weekday = 1;
          weekday <= 7;
          weekday++
        ) {
          const item =
            groupMap.get(
              weekday
            ) ||
            createDefaultItem(
              group,
              weekday
            );


          payload.push({
            restaurant_id:
              restaurantId,

            delivery_group:
              group,

            weekday:
              weekday,

            source_order_day:
              item.source_order_day ||
              "monday",

            is_active:
              Boolean(
                item.is_active
              )
          });
        }
      }
    );


    return payload;
  }


  /* =====================================================
     SAVE
  ===================================================== */

  async function saveSchedule() {
    if (isSaving) {
      return;
    }


    const button =
      root.querySelector(
        "#delivery-save-button"
      );


    isSaving =
      true;


    if (button) {
      button.disabled =
        true;

      button.textContent =
        "Сохранение...";
    }


    setStatus(
      "Сохранение графиков..."
    );


    try {
      await getRestaurantId();


      const payload =
        buildPayload();


      const {
        error
      } =
        await supabaseClient
          .from(
            "restaurant_delivery_schedule"
          )
          .upsert(
            payload,
            {
              onConflict:
                "restaurant_id,delivery_group,weekday"
            }
          );


      if (error) {
        throw error;
      }


      isDirty =
        false;


      setStatus(
        "Графики сохранены",
        "success"
      );

    } catch (error) {
      console.error(
        "Delivery schedule save:",
        error
      );


      setStatus(
        error.message ||
        "Ошибка сохранения",
        "error"
      );

    } finally {
      isSaving =
        false;


      if (button) {
        button.disabled =
          false;

        button.textContent =
          "Сохранить графики";
      }
    }
  }


  /* =====================================================
     EVENTS
  ===================================================== */

  function bindEvents() {

    /*
      Day settings
    */

    root.addEventListener(
      "change",
      function (event) {
        const row =
          event.target.closest(
            "[data-delivery-day]"
          );


        if (!row) {
          return;
        }


        updateRowState(
          row
        );


        syncCurrentUiToState();


        updateSummary();


        markDirty();
      }
    );


    /*
      Group + save buttons
    */

    root.addEventListener(
      "click",
      function (event) {

        const groupButton =
          event.target.closest(
            "[data-delivery-group]"
          );


        if (groupButton) {
          switchGroup(
            groupButton.dataset
              .deliveryGroup
          );

          return;
        }


        if (
          event.target.closest(
            "#delivery-save-button"
          )
        ) {
          saveSchedule();
        }
      }
    );
  }


  /* =====================================================
     INIT
  ===================================================== */

  async function init(
    container
  ) {
    root =
      container.querySelector(
        "#delivery-settings"
      );


    if (!root) {
      throw new Error(
        "delivery-settings root не найден."
      );
    }


    restaurantId =
      null;


    activeGroup =
      "general";


    isDirty =
      false;


    isSaving =
      false;


    scheduleByGroup =
      new Map();


    bindEvents();


    try {
      await loadSchedule();

    } catch (error) {
      console.error(
        "Delivery schedule load:",
        error
      );


      setStatus(
        error.message ||
        "Ошибка загрузки",
        "error"
      );
    }
  }


  /* =====================================================
     PUBLIC API
  ===================================================== */

  window.DeliveryScheduleSettings = {
    init
  };

})();