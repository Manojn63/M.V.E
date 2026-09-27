const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const submitButton = document.querySelector("#login-submit");
const submitLabel = document.querySelector(".login-submit-label");
const titleEl = document.querySelector("#login-title");
const introEl = document.querySelector(".login-intro");
const registerNameGroup = document.querySelector("#register-name-group");
const tabs = document.querySelectorAll(".auth-tab");
const authToggle = document.querySelector(".auth-toggle");
const adminLoginLink = document.querySelector("#admin-login-link");
const adminLogin = window.location.pathname === "/admin-login";

let authMode = "login";

function setAuthMode(mode) {
  authMode = mode;
  tabs.forEach((tab) => {
    const active = tab.dataset.authMode === mode;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-pressed", String(active));
  });

  const isRegister = mode === "register";
  titleEl.textContent = isRegister
    ? "Create your studio."
    : adminLogin
      ? "Administrator access."
      : "Welcome back.";
  introEl.textContent = isRegister
    ? "Set up your secure creator account and start work in the private M.R-V.E. workspace."
    : adminLogin
      ? "Sign in with your administrator account to manage the M.R-V.E. workspace."
      : "Sign in to launch your studio timeline and creative workspaces.";
  registerNameGroup.hidden = !isRegister;
  submitLabel.textContent = isRegister ? "Create Account" : adminLogin ? "Admin Sign In" : "Enter Studio";
  const passwordInput = document.querySelector("#login-password");
  passwordInput.setAttribute("autocomplete", isRegister ? "new-password" : "current-password");
  if (isRegister) {
    passwordInput.placeholder = "Create a strong password";
  } else {
    passwordInput.placeholder = "Enter your password";
  }
}

if (adminLogin) {
  authToggle.hidden = true;
  adminLoginLink.textContent = "Creator sign in";
  adminLoginLink.href = "/";
  document.title = "Admin Sign In | M.R-V.E. Master Video Editor";
} else {
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => setAuthMode(tab.dataset.authMode));
  });
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  submitButton.disabled = true;
  submitLabel.textContent = authMode === "register"
    ? "Creating account…"
    : adminLogin
      ? "Verifying admin…"
      : "Signing in…";

  try {
    const username = document.querySelector("#login-username").value.trim();
    const password = document.querySelector("#login-password").value;
    const name = document.querySelector("#register-name")?.value.trim() || "";

    const endpoint = authMode === "register"
      ? "/api/auth/register"
      : adminLogin
        ? "/api/auth/admin-login"
        : "/api/auth/login";
    const payload = authMode === "register"
      ? { username, password, name }
      : { username, password };

    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.detail || "Authentication failed. Please try again.");
    }

    document.querySelector("#login-password").value = "";
    if (document.querySelector("#register-name")) document.querySelector("#register-name").value = "";
    window.location.assign("/");
  } catch (error) {
    loginError.textContent =
      error instanceof Error && error.message === "Failed to fetch"
        ? "The M.R-V.E. server could not be reached. Ensure the backend is running."
        : error instanceof Error
          ? error.message
          : "Authentication failed. Please try again.";
    loginError.hidden = false;
  } finally {
    submitButton.disabled = false;
    submitLabel.textContent = authMode === "register"
      ? "Create Account"
      : adminLogin
        ? "Admin Sign In"
        : "Enter Studio";
  }
});

setAuthMode("login");
