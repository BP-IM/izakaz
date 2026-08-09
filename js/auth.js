const loginTab = document.getElementById("login-tab");
const registerTab = document.getElementById("register-tab");

const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");

const messageBox = document.getElementById("message");


/* =====================================================
   СООБЩЕНИЯ
===================================================== */

function showMessage(text, type = "error") {
  messageBox.textContent = text;
  messageBox.className = `message show ${type}`;
}

function clearMessage() {
  messageBox.textContent = "";
  messageBox.className = "message";
}


/* =====================================================
   ЗАГРУЗКА КНОПКИ
===================================================== */

function setLoading(form, isLoading) {
  const button = form.querySelector('button[type="submit"]');

  button.disabled = isLoading;
  button.classList.toggle("loading", isLoading);
}


/* =====================================================
   ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК
===================================================== */

function switchTab(tabName) {
  const isLogin = tabName === "login";

  loginTab.classList.toggle("active", isLogin);
  registerTab.classList.toggle("active", !isLogin);

  loginTab.setAttribute(
    "aria-selected",
    String(isLogin)
  );

  registerTab.setAttribute(
    "aria-selected",
    String(!isLogin)
  );

  loginForm.classList.toggle("active", isLogin);
  registerForm.classList.toggle("active", !isLogin);

  clearMessage();
}


loginTab.addEventListener("click", function () {
  switchTab("login");
});


registerTab.addEventListener("click", function () {
  switchTab("register");
});


/* =====================================================
   ПОКАЗАТЬ / СКРЫТЬ ПАРОЛЬ
===================================================== */

document
  .querySelectorAll(".password-toggle")
  .forEach(function (button) {

    button.addEventListener("click", function () {

      const inputId = button.dataset.target;
      const input = document.getElementById(inputId);

      const passwordHidden =
        input.type === "password";

      input.type =
        passwordHidden
          ? "text"
          : "password";

      button.textContent =
        passwordHidden
          ? "Скрыть"
          : "Показать";

      button.setAttribute(
        "aria-label",
        passwordHidden
          ? "Скрыть пароль"
          : "Показать пароль"
      );

    });

  });


/* =====================================================
   НОРМАЛИЗАЦИЯ КОДА РЕСТОРАНА
===================================================== */

function normalizeRestaurantCode(value) {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}


/* =====================================================
   РЕГИСТРАЦИЯ
===================================================== */

registerForm.addEventListener(
  "submit",
  async function (event) {

    event.preventDefault();

    clearMessage();


    const fullName =
      document
        .getElementById("full-name")
        .value
        .trim();


    const restaurantName =
      document
        .getElementById("restaurant-name")
        .value
        .trim();


    const restaurantCode =
      normalizeRestaurantCode(
        document
          .getElementById("restaurant-code")
          .value
      );


    const email =
      document
        .getElementById("register-email")
        .value
        .trim()
        .toLowerCase();


    const password =
      document
        .getElementById("register-password")
        .value;


    const confirmPassword =
      document
        .getElementById("confirm-password")
        .value;


    const agreement =
      document
        .getElementById("agreement")
        .checked;


    /* Проверка полей */

    if (
      !fullName ||
      !restaurantName ||
      !restaurantCode ||
      !email ||
      !password ||
      !confirmPassword
    ) {

      showMessage(
        "Заполните все обязательные поля."
      );

      return;
    }


    if (password.length < 6) {

      showMessage(
        "Пароль должен содержать минимум 6 символов."
      );

      return;
    }


    if (password !== confirmPassword) {

      showMessage(
        "Пароли не совпадают."
      );

      return;
    }


    if (!agreement) {

      showMessage(
        "Подтвердите правильность введенных данных."
      );

      return;
    }


    setLoading(registerForm, true);


    try {

      const { data, error } =
        await supabaseClient.auth.signUp({

          email: email,

          password: password,

          options: {

            data: {

              full_name: fullName,

              restaurant_name:
                restaurantName,

              restaurant_code:
                restaurantCode

            }

          }

        });


      if (error) {
        throw error;
      }


      /*
        Если подтверждение email выключено,
        Supabase сразу создаст session
      */

      if (data.session) {

        window.location.href =
        "pages/dashboard.html#home";

        return;
      }


      /*
        Если подтверждение email включено
      */

      registerForm.reset();

      showMessage(
        "Аккаунт создан. Проверьте электронную почту и подтвердите регистрацию.",
        "success"
      );

    } catch (error) {

      console.error(
        "Ошибка регистрации:",
        error
      );


      const errorMessage =
        String(
          error?.message || ""
        ).toLowerCase();


      if (
        errorMessage.includes(
          "already registered"
        ) ||
        errorMessage.includes(
          "user already registered"
        )
      ) {

        showMessage(
          "Пользователь с такой электронной почтой уже зарегистрирован."
        );

      } else if (
        errorMessage.includes(
          "database error"
        )
      ) {

        showMessage(
          "Не удалось создать аккаунт. Возможно, этот код ресторана уже зарегистрирован."
        );

      } else if (
        errorMessage.includes(
          "invalid email"
        )
      ) {

        showMessage(
          "Введите корректный адрес электронной почты."
        );

      } else {

        showMessage(
          error.message ||
          "Не удалось создать аккаунт."
        );

      }

    } finally {

      setLoading(
        registerForm,
        false
      );

    }

  }
);


/* =====================================================
   ВХОД
===================================================== */

loginForm.addEventListener(
  "submit",
  async function (event) {

    event.preventDefault();

    clearMessage();


    const email =
      document
        .getElementById("login-email")
        .value
        .trim()
        .toLowerCase();


    const password =
      document
        .getElementById("login-password")
        .value;


    if (!email || !password) {

      showMessage(
        "Введите электронную почту и пароль."
      );

      return;
    }


    setLoading(loginForm, true);


    try {

      const { data, error } =
        await supabaseClient.auth
          .signInWithPassword({

            email: email,

            password: password

          });


      if (error) {
        throw error;
      }


      if (data.session) {

        window.location.href =
        "pages/dashboard.html#home";

      }

    } catch (error) {

      console.error(
        "Ошибка входа:",
        error
      );


      const errorMessage =
        String(
          error?.message || ""
        ).toLowerCase();


      if (
        errorMessage.includes(
          "email not confirmed"
        )
      ) {

        showMessage(
          "Сначала подтвердите электронную почту."
        );

      } else {

        showMessage(
          "Неверная электронная почта или пароль."
        );

      }

    } finally {

      setLoading(
        loginForm,
        false
      );

    }

  }
);


/* =====================================================
   ПРОВЕРКА АКТИВНОЙ СЕССИИ
===================================================== */

async function redirectAuthenticatedUser() {

  try {

    const { data, error } =
      await supabaseClient.auth
        .getSession();


    if (error) {
      console.error(
        "Ошибка проверки сессии:",
        error
      );

      return;
    }


    if (data.session) {

      window.location.href =
      "pages/dashboard.html#home";

    }

  } catch (error) {

    console.error(
      "Ошибка подключения к Supabase:",
      error
    );

  }

}


redirectAuthenticatedUser();