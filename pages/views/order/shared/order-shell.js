
/* ==========================================
   IZAKAZ v0.2.0
   ORDER — SHARED SHELL
========================================== */

(function () {
  "use strict";

  const STEPS = {
    1: {
      title: "Остатки",
      description: "Подсчет остатков товаров"
    },
    2: {
      title: "Реализация",
      description: "Расход по дням недели"
    },
    3: {
      title: "Расчёт",
      description: "Расчёт количества заказа"
    },
    4: {
      title: "Итог",
      description: "Готовый заказ"
    }
  };

  function create(config) {
    const type = config.type;
    const rootId = config.rootId;

    let root = null;
    let currentStep = 1;

    function updateStepper() {
      if (!root) return;

      root.querySelectorAll(
        "[data-order-step]"
      ).forEach(function (button) {
        const step = Number(
          button.dataset.orderStep
        );

        const active = step === currentStep;

        button.classList.toggle(
          "is-active",
          active
        );

        if (active) {
          button.setAttribute(
            "aria-current",
            "step"
          );
        } else {
          button.removeAttribute(
            "aria-current"
          );
        }
      });
    }

    function showStep(step) {
      if (!root || !root.isConnected) {
        return;
      }

      const nextStep = Number(step);

      if (!STEPS[nextStep]) {
        return;
      }

      currentStep = nextStep;

      updateStepper();

      const container = root.querySelector(
        ".order-step-container"
      );

      if (!container) return;

      const info = STEPS[currentStep];

      // Временный экран.
      // Позже сюда подключим реальные модули.
      container.innerHTML = `
        <div class="order-step-loading">
          <div>
            <h3>${info.title}</h3>
            <p>${info.description}</p>
            <p>
              Модуль в разработке.
            </p>
          </div>
        </div>
      `;
    }

    function init(container) {
      root = container.querySelector(
        "#" + rootId
      );

      if (!root) {
        throw new Error(
          "Order root not found: " + rootId
        );
      }

      if (root.dataset.orderInitialized === type) {
        return;
      }

      root.dataset.orderInitialized = type;

      currentStep = 1;

      root.addEventListener(
        "click",
        function (event) {
          const button = event.target.closest(
            "[data-order-step]"
          );

          if (!button || !root.contains(button)) {
            return;
          }

          showStep(
            button.dataset.orderStep
          );
        }
      );

      showStep(1);
    }

    return {
      init,
      goToStep: showStep,
      getCurrentStep() {
        return currentStep;
      },
      getOrderType() {
        return type;
      }
    };
  }

  window.IzakazOrderShell = {
    create
  };
})();
