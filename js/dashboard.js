/* =====================================================
   ТЕКУЩАЯ ДАТА
===================================================== */

function showCurrentDate() {
  const dateElement =
    document.getElementById("current-date");

  if (!dateElement) {
    return;
  }

  const currentDate =
    new Intl.DateTimeFormat(
      "ru-RU",
      {
        day: "2-digit",
        month: "long",
        year: "numeric"
      }
    ).format(new Date());

  dateElement.textContent =
    currentDate;
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
   ДАННЫЕ ГЛАВНОЙ СТРАНИЦЫ
===================================================== */

async function loadDashboard() {
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
        "Ошибка загрузки профиля:",
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


    document
      .getElementById("welcome-title")
      .textContent =
        `Здравствуйте, ${fullName}!`;


    document
      .getElementById(
        "detail-restaurant-name"
      )
      .textContent =
        restaurantName;


    document
      .getElementById(
        "detail-restaurant-code"
      )
      .textContent =
        restaurantCode;


    document
      .getElementById(
        "detail-user-name"
      )
      .textContent =
        fullName;


    document
      .getElementById(
        "detail-user-email"
      )
      .textContent =
        user.email || "Не указана";

  } catch (error) {
    console.error(
      "Ошибка загрузки dashboard:",
      error
    );
  }
}


/* =====================================================
   ЗАПУСК
===================================================== */

showCurrentDate();
loadDashboard();