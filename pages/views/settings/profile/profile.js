/* =====================================================
   IZAKAZ v0.2.0
   PROFILE SETTINGS
===================================================== */

(function () {
  "use strict";


  let currentUser = null;

  let currentProfile = null;

  let currentRestaurant = null;


  /* =====================================================
     ROLE LABELS
  ===================================================== */

  const ROLE_LABELS = {
    admin: "Администратор",
    manager: "Менеджер",
    viewer: "Просмотр"
  };


  /* =====================================================
     HELPERS
  ===================================================== */

  function getElement(
    container,
    selector
  ) {

    return container.querySelector(
      selector
    );

  }


  function setText(
    element,
    value
  ) {

    if (!element) {
      return;
    }


    element.textContent =
      value ||
      "—";

  }


  function showMessage(
    container,
    text,
    type = "info"
  ) {

    const message =
      getElement(
        container,
        "#profile-message"
      );


    if (!message) {
      return;
    }


    message.textContent =
      text;


    message.className =
      `profile-message is-visible is-${type}`;


    window.clearTimeout(
      showMessage.timeout
    );


    showMessage.timeout =
      window.setTimeout(
        function () {

          message.className =
            "profile-message";

          message.textContent =
            "";

        },
        5000
      );

  }


  function setButtonLoading(
    button,
    loading,
    loadingText
  ) {

    if (!button) {
      return;
    }


    if (loading) {

      button.dataset.originalText =
        button.textContent;

      button.textContent =
        loadingText;

      button.disabled =
        true;

      return;

    }


    button.textContent =
      button.dataset.originalText ||
      button.textContent;

    button.disabled =
      false;

  }


  function setPageLoading(
    container,
    loading
  ) {

    const loader =
      getElement(
        container,
        "#profile-loading"
      );


    if (!loader) {
      return;
    }


    loader.classList.toggle(
      "is-hidden",
      !loading
    );

  }


  /* =====================================================
     LOAD AUTH USER
  ===================================================== */

  async function loadAuthUser() {

    const {
      data,
      error
    } =
      await supabaseClient.auth
        .getUser();


    if (error) {
      throw error;
    }


    if (!data?.user) {
      throw new Error(
        "Пользователь не авторизован."
      );
    }


    currentUser =
      data.user;


    return currentUser;

  }


  /* =====================================================
     LOAD PROFILE
  ===================================================== */

  async function loadProfile(
    userId
  ) {

    const {
      data,
      error
    } =
      await supabaseClient
        .from("profiles")
        .select(
          `
            id,
            full_name,
            phone,
            role,
            restaurant_id
          `
        )
        .eq(
          "id",
          userId
        )
        .single();


    if (error) {
      throw error;
    }


    currentProfile =
      data;


    return data;

  }


  /* =====================================================
     LOAD RESTAURANT
  ===================================================== */

  async function loadRestaurant(
    restaurantId
  ) {

    if (!restaurantId) {
      return null;
    }


    const {
      data,
      error
    } =
      await supabaseClient
        .from("restaurants")
        .select(
          `
            id,
            name,
            code
          `
        )
        .eq(
          "id",
          restaurantId
        )
        .single();


    if (error) {
      throw error;
    }


    currentRestaurant =
      data;


    return data;

  }


  /* =====================================================
     RENDER
  ===================================================== */

  function renderProfile(
    container
  ) {

    const fullNameInput =
      getElement(
        container,
        "#profile-full-name"
      );


    const phoneInput =
      getElement(
        container,
        "#profile-phone"
      );


    const emailInput =
      getElement(
        container,
        "#profile-email"
      );


    if (fullNameInput) {

      fullNameInput.value =
        currentProfile?.full_name ||
        "";

    }


    if (phoneInput) {

      phoneInput.value =
        currentProfile?.phone ||
        "";

    }


    if (emailInput) {

      emailInput.value =
        currentUser?.email ||
        "";

    }


    setText(
      getElement(
        container,
        "#profile-restaurant-name"
      ),
      currentRestaurant?.name
    );


    setText(
      getElement(
        container,
        "#profile-restaurant-code"
      ),
      currentRestaurant?.code
    );


    setText(
      getElement(
        container,
        "#profile-role"
      ),

      ROLE_LABELS[
        currentProfile?.role
      ] ||
      currentProfile?.role ||
      "—"
    );

  }


  /* =====================================================
     SAVE PERSONAL DATA
  ===================================================== */

  async function savePersonalData(
    container,
    event
  ) {

    event.preventDefault();


    const button =
      getElement(
        container,
        "#profile-save-button"
      );


    const fullName =
      getElement(
        container,
        "#profile-full-name"
      )
        ?.value
        .trim();


    const phone =
      getElement(
        container,
        "#profile-phone"
      )
        ?.value
        .trim();


    const email =
      getElement(
        container,
        "#profile-email"
      )
        ?.value
        .trim()
        .toLowerCase();


    if (!fullName) {

      showMessage(
        container,
        "Введите имя и фамилию.",
        "error"
      );

      return;

    }


    if (!email) {

      showMessage(
        container,
        "Введите электронную почту.",
        "error"
      );

      return;

    }


    setButtonLoading(
      button,
      true,
      "Сохранение..."
    );


    try {

      /*
        1. PROFILE
      */

      const {
        data: profileData,
        error: profileError
      } =
        await supabaseClient
          .from("profiles")
          .update({

            full_name:
              fullName,

            phone:
              phone || null

          })
          .eq(
            "id",
            currentUser.id
          )
          .select(
            `
              id,
              full_name,
              phone,
              role,
              restaurant_id
            `
          )
          .single();


      if (profileError) {
        throw profileError;
      }


      currentProfile =
        profileData;


      /*
        2. EMAIL

        Email обновляем только если
        пользователь действительно
        изменил его.
      */

      const currentEmail =
        String(
          currentUser.email ||
          ""
        )
          .trim()
          .toLowerCase();


      const emailChanged =
        email !== currentEmail;


      if (emailChanged) {

        const {
          data: authData,
          error: authError
        } =
          await supabaseClient.auth
            .updateUser({
              email: email
            });


        if (authError) {
          throw authError;
        }


        if (authData?.user) {

          currentUser =
            authData.user;

        }


        showMessage(
          container,
          "Данные сохранены. Для изменения электронной почты проверьте новый email и подтвердите его.",
          "success"
        );

      } else {

        showMessage(
          container,
          "Изменения сохранены.",
          "success"
        );

      }


      /*
        Сообщаем другим частям приложения,
        что профиль изменился.

        Позже Sidebar сможет слушать
        это событие и обновлять имя
        без перезагрузки страницы.
      */

      window.dispatchEvent(
        new CustomEvent(
          "izakaz:profile-updated",
          {
            detail: {
              fullName:
                currentProfile.full_name,

              phone:
                currentProfile.phone
            }
          }
        )
      );


    } catch (error) {

      console.error(
        "Profile save error:",
        error
      );


      showMessage(
        container,
        error?.message ||
          "Не удалось сохранить изменения.",
        "error"
      );


    } finally {

      setButtonLoading(
        button,
        false
      );

    }

  }


  /* =====================================================
     CHANGE PASSWORD
  ===================================================== */

  async function changePassword(
    container,
    event
  ) {

    event.preventDefault();


    const button =
      getElement(
        container,
        "#profile-password-button"
      );


    const newPassword =
      getElement(
        container,
        "#profile-new-password"
      )
        ?.value ||
      "";


    const confirmPassword =
      getElement(
        container,
        "#profile-confirm-password"
      )
        ?.value ||
      "";


    if (
      !newPassword ||
      !confirmPassword
    ) {

      showMessage(
        container,
        "Введите новый пароль и его подтверждение.",
        "error"
      );

      return;

    }


    if (
      newPassword.length < 6
    ) {

      showMessage(
        container,
        "Пароль должен содержать минимум 6 символов.",
        "error"
      );

      return;

    }


    if (
      newPassword !==
      confirmPassword
    ) {

      showMessage(
        container,
        "Пароли не совпадают.",
        "error"
      );

      return;

    }


    setButtonLoading(
      button,
      true,
      "Изменение..."
    );


    try {

      const {
        error
      } =
        await supabaseClient.auth
          .updateUser({
            password:
              newPassword
          });


      if (error) {
        throw error;
      }


      const newPasswordInput =
        getElement(
          container,
          "#profile-new-password"
        );


      const confirmPasswordInput =
        getElement(
          container,
          "#profile-confirm-password"
        );


      if (newPasswordInput) {
        newPasswordInput.value = "";
      }


      if (confirmPasswordInput) {
        confirmPasswordInput.value = "";
      }


      showMessage(
        container,
        "Пароль успешно изменен.",
        "success"
      );


    } catch (error) {

      console.error(
        "Password update error:",
        error
      );


      showMessage(
        container,
        error?.message ||
          "Не удалось изменить пароль.",
        "error"
      );


    } finally {

      setButtonLoading(
        button,
        false
      );

    }

  }


  /* =====================================================
     PASSWORD TOGGLE
  ===================================================== */

  function bindPasswordToggles(
    container
  ) {

    container
      .querySelectorAll(
        ".profile-password-toggle"
      )
      .forEach(
        function (button) {

          button.addEventListener(
            "click",
            function () {

              const targetId =
                button.dataset.target;


              const input =
                getElement(
                  container,
                  `#${targetId}`
                );


              if (!input) {
                return;
              }


              const hidden =
                input.type ===
                "password";


              input.type =
                hidden
                  ? "text"
                  : "password";


              button.textContent =
                hidden
                  ? "Скрыть"
                  : "Показать";

            }
          );

        }
      );

  }


  /* =====================================================
     BIND EVENTS
  ===================================================== */

  function bindEvents(
    container
  ) {

    const personalForm =
      getElement(
        container,
        "#profile-personal-form"
      );


    const passwordForm =
      getElement(
        container,
        "#profile-password-form"
      );


    if (personalForm) {

      personalForm.addEventListener(
        "submit",
        function (event) {

          savePersonalData(
            container,
            event
          );

        }
      );

    }


    if (passwordForm) {

      passwordForm.addEventListener(
        "submit",
        function (event) {

          changePassword(
            container,
            event
          );

        }
      );

    }


    bindPasswordToggles(
      container
    );

  }


  /* =====================================================
     INIT
  ===================================================== */

  async function init(
    container
  ) {

    if (!container) {
      return;
    }


    setPageLoading(
      container,
      true
    );


    try {

      const user =
        await loadAuthUser();


      const profile =
        await loadProfile(
          user.id
        );


      await loadRestaurant(
        profile.restaurant_id
      );


      renderProfile(
        container
      );


      bindEvents(
        container
      );


    } catch (error) {

      console.error(
        "Profile initialization error:",
        error
      );


      showMessage(
        container,
        error?.message ||
          "Не удалось загрузить профиль.",
        "error"
      );


    } finally {

      setPageLoading(
        container,
        false
      );

    }

  }


  /* =====================================================
     PUBLIC MODULE
  ===================================================== */

  window.ProfileSettings = {
    init
  };

})();