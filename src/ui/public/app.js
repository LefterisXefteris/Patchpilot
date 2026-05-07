const form = document.querySelector("#config-form");
const output = document.querySelector("#output");
const saveStatus = document.querySelector("#save-status");
const secretList = document.querySelector("#secret-list");
const booleanKeys = new Set(["BTS_DRY_RUN", "AUTOPILOT_ENABLED", "AUTOPILOT_DRY_RUN", "AUTOPILOT_EMERGENCY_STOP"]);
const secretLabels = {
  SENTRY_AUTH_TOKEN: "Sentry token",
  SENTRY_WEBHOOK_SECRET: "Sentry webhook",
  GITHUB_APP_PRIVATE_KEY: "GitHub private key",
  GITHUB_WEBHOOK_SECRET: "GitHub webhook",
  VERCEL_TOKEN: "Vercel token",
  ANTHROPIC_API_KEY: "Anthropic key",
};

loadConfig();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(true);
  try {
    const values = {};
    for (const field of form.querySelectorAll("[data-key]")) {
      const key = field.dataset.key;
      values[key] = field.type === "checkbox" ? String(field.checked) : field.value.trim();
    }
    const response = await fetch("/api/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values }),
    });
    const payload = await response.json();
    renderConfig(payload.config);
    saveStatus.textContent = "Saved";
    output.textContent = "Saved .env locally. Secret values were not echoed back.";
  } catch (error) {
    output.textContent = String(error);
    saveStatus.textContent = "Error";
  } finally {
    setBusy(false);
  }
});

for (const button of document.querySelectorAll("[data-command]")) {
  button.addEventListener("click", async () => {
    setBusy(true);
    output.textContent = `Running ${button.textContent}...`;
    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command: button.dataset.command }),
      });
      const payload = await response.json();
      output.textContent = `$ ${payload.command}\n\n${payload.output}`;
      saveStatus.textContent = payload.ok ? "Passed" : "Failed";
    } catch (error) {
      output.textContent = String(error);
      saveStatus.textContent = "Error";
    } finally {
      setBusy(false);
    }
  });
}

async function loadConfig() {
  const response = await fetch("/api/config");
  renderConfig(await response.json());
}

function renderConfig(payload) {
  const values = payload?.values ?? {};
  for (const field of form.querySelectorAll("[data-key]")) {
    const key = field.dataset.key;
    if (booleanKeys.has(key)) {
      field.checked = values[key] === "true";
    } else {
      field.value = values[key] ?? "";
      if (payload.secretStatus?.[key]) {
        field.placeholder = "Saved. Leave blank to keep existing value.";
      }
    }
  }

  secretList.innerHTML = "";
  for (const [key, label] of Object.entries(secretLabels)) {
    const item = document.createElement("div");
    item.className = "secret";
    item.innerHTML = `<strong>${label}</strong>${payload.secretStatus?.[key] ? "Configured" : "Missing"}`;
    secretList.appendChild(item);
  }
}

function setBusy(isBusy) {
  for (const button of document.querySelectorAll("button")) {
    button.disabled = isBusy;
  }
}
