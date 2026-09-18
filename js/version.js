/* =====================================================
   IZAKAZ VERSION
===================================================== */

window.IZAKAZ_VERSION = "0.1.0";


window.renderIzakazVersion = function (root = document) {

  const versionElements =
    root.querySelectorAll("[data-app-version]");


  versionElements.forEach(function (element) {

    element.textContent =
      `izakaz · v${window.IZAKAZ_VERSION}`;

  });

};


document.addEventListener(
  "DOMContentLoaded",
  function () {

    window.renderIzakazVersion();

  }
);