/* New versions wait for the user's explicit update action. */
(function () {
  if (!("serviceWorker" in navigator) || !location.protocol.startsWith("http"))
    return;
  const main = document.getElementById("householdApp"),
    banner = document.createElement("div");
  banner.className = "update-banner";
  banner.hidden = true;
  banner.setAttribute("role", "status");
  banner.innerHTML =
    '<span id="updateText">An app update is ready.</span><button id="applyUpdate">Update app</button>';
  main.prepend(banner);
  let waiting = null,
    requested = false;
  function show(worker) {
    waiting = worker;
    banner.hidden = false;
  }
  navigator.serviceWorker
    .register("./sw.js", { updateViaCache: "none" })
    .then((reg) => {
      if (reg.waiting) show(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        worker?.addEventListener("statechange", () => {
          if (
            worker.state === "installed" &&
            navigator.serviceWorker.controller
          )
            show(worker);
        });
      });
      document.getElementById("applyUpdate").onclick = () => {
        if (window.householdPending) {
          document.getElementById("updateText").textContent =
            "Sync your pending changes before updating.";
          window.householdSync?.retry();
          return;
        }
        if (document.querySelector("dialog[open]")) {
          document.getElementById("updateText").textContent =
            "Finish editing, then update the app.";
          return;
        }
        if (waiting) {
          requested = true;
          waiting.postMessage({ type: "ACTIVATE_UPDATE" });
        }
      };
      window.addEventListener("online", () => reg.update().catch(() => {}));
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) reg.update().catch(() => {});
      });
    })
    .catch(() => {
      console.info("Offline app installation unavailable on this browser.");
    });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (requested) location.reload();
  });
})();
