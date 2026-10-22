/* =====================================================
   IZAKAZ v0.2.0
   INVENTORY COUNT — SESSION
===================================================== */

(function () {
  "use strict";


  /* =====================================================
     DATE HELPERS
  ===================================================== */

  function pad2(value) {

    return String(value)
      .padStart(2, "0");

  }


  function formatLocalDate(date) {

    return [
      date.getFullYear(),

      pad2(
        date.getMonth() + 1
      ),

      pad2(
        date.getDate()
      )

    ].join("-");

  }


  function getToday() {

    return formatLocalDate(
      new Date()
    );

  }


  function parseDate(dateString) {

    const [
      year,
      month,
      day
    ] =
      String(dateString)
        .split("-")
        .map(Number);


    return new Date(
      year,
      month - 1,
      day
    );

  }


  function addDays(
    dateString,
    amount
  ) {

    const date =
      parseDate(
        dateString
      );


    date.setDate(
      date.getDate() +
      amount
    );


    return formatLocalDate(
      date
    );

  }


  function compareDates(
    first,
    second
  ) {

    if (first < second) {
      return -1;
    }


    if (first > second) {
      return 1;
    }


    return 0;

  }


  /* =====================================================
     INVENTORY TYPE
  ===================================================== */

  function getInventoryType(
    dateString
  ) {

    const date =
      parseDate(
        dateString
      );


    const year =
      date.getFullYear();


    const month =
      date.getMonth();


    const day =
      date.getDate();


    const lastDayOfMonth =
      new Date(
        year,
        month + 1,
        0
      ).getDate();


    /*
      Последний день месяца
      = monthly
    */

    if (
      day ===
      lastDayOfMonth
    ) {

      return "monthly";

    }


    /*
      Воскресенье
      = weekly
    */

    if (
      date.getDay() === 0
    ) {

      return "weekly";

    }


    return "daily";

  }


  /* =====================================================
     USER CONTEXT
  ===================================================== */

  async function loadUserContext(
    state
  ) {

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


    state.userId =
      userData.user.id;


    const {
      data: profile,
      error: profileError
    } =
      await supabaseClient
        .from(
          "profiles"
        )
        .select(
          "restaurant_id"
        )
        .eq(
          "id",
          state.userId
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


    state.restaurantId =
      profile.restaurant_id;

  }


  /* =====================================================
     FIND SESSION BY DATE
  ===================================================== */

  async function findSessionByDate(
    restaurantId,
    inventoryDate
  ) {

    const {
      data,
      error
    } =
      await supabaseClient
        .from(
          "inventory_sessions"
        )
        .select("*")
        .eq(
          "restaurant_id",
          restaurantId
        )
        .eq(
          "inventory_date",
          inventoryDate
        )
        .maybeSingle();


    if (error) {

      throw error;

    }


    return data || null;

  }


  /* =====================================================
     CREATE SESSION
  ===================================================== */

  async function createSession(
    state,
    inventoryDate
  ) {

    const inventoryType =
      getInventoryType(
        inventoryDate
      );


    const {
      data,
      error
    } =
      await supabaseClient
        .from(
          "inventory_sessions"
        )
        .insert({

          restaurant_id:
            state.restaurantId,

          inventory_date:
            inventoryDate,

          inventory_type:
            inventoryType,

          status:
            "open",

          started_by:
            state.userId

        })
        .select()
        .single();


    /*
      Егер басқа құрылғы
      session-ды бірінші жасап үлгерсе.
    */

    if (
      error?.code === "23505"
    ) {

      const existing =
        await findSessionByDate(
          state.restaurantId,
          inventoryDate
        );


      if (!existing) {

        throw error;

      }


      return existing;

    }


    if (error) {

      throw error;

    }


    return data;

  }


  /* =====================================================
     APPLY SESSION
  ===================================================== */

  function applySession(
    state,
    session
  ) {

    state.session =
      session;


    state.inventoryDate =
      session.inventory_date;


    state.inventoryType =
      session.inventory_type;


    state.sessionStatus =
      session.status;


    state.isUpToDate =
      (
        session.inventory_date ===
          getToday() &&
        session.status ===
          "completed"
      );


    state.nextInventoryDate =
      null;

  }


  /* =====================================================
     OPEN DATE
  ===================================================== */

  async function openDate(
    state,
    inventoryDate
  ) {

    let session =
      await findSessionByDate(
        state.restaurantId,
        inventoryDate
      );


    if (!session) {

      session =
        await createSession(
          state,
          inventoryDate
        );

    }


    applySession(
      state,
      session
    );


    return session;

  }


  /* =====================================================
     SWITCH DATE MANUALLY
  ===================================================== */

  async function switchToDate(
    app,
    inventoryDate
  ) {

    const state =
      app.state;


    if (!inventoryDate) {

      throw new Error(
        "Дата не указана."
      );

    }


    const today =
      getToday();


    if (
      compareDates(
        inventoryDate,
        today
      ) > 0
    ) {

      throw new Error(
        "Нельзя открыть инвентаризацию на будущую дату."
      );

    }


    const session =
      await openDate(
        state,
        inventoryDate
      );


    console.log(
      "[Inventory Session] switched",
      {
        date:
          state.inventoryDate,

        type:
          state.inventoryType,

        status:
          state.sessionStatus,

        sessionId:
          session.id
      }
    );


    return session;

  }


  /* =====================================================
     INIT

     ВАЖНО:
     При открытии страницы всегда
     открываем СЕГОДНЯ.

     Старые дни автоматически
     больше не открываются.
  ===================================================== */

  async function init(app) {

    const state =
      app.state;


    await loadUserContext(
      state
    );


    const today =
      getToday();


    await openDate(
      state,
      today
    );


    console.log(
      "[Inventory Session] ready",
      {
        restaurantId:
          state.restaurantId,

        inventoryDate:
          state.inventoryDate,

        inventoryType:
          state.inventoryType,

        status:
          state.sessionStatus
      }
    );

  }


  /* =====================================================
     PUBLIC API
  ===================================================== */

  window.InventoryCountSession = {

    init,

    switchToDate,

    findSessionByDate,

    getInventoryType,

    getToday,

    addDays

  };

})();