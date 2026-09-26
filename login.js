const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const submitButton = document.querySelector("#login-submit");
const submitLabel = document.querySelector(".login-submit-label");

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  submitButton.disabled = true;
  submitLabel.textContent = "Signing in…";

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: document.querySelector("#login-username").value.trim(),
        password: document.querySelector("#login-password").value,
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.detail || "Sign in failed. Please try again.");
    }

    document.querySelector("#login-password").value = "";
    window.location.assign("/");
  } catch (error) {
    loginError.textContent =
      error instanceof Error && error.message === "Failed to fetch"
        ? "The M.V.E. server could not be reached. Ensure the backend is running."
        : error instanceof Error
          ? error.message
          : "Sign in failed. Please try again.";
    loginError.hidden = false;
    } finally {
      submitButton.disabled = false;
      submitLabel.textContent = "Enter Studio";
  }
});
