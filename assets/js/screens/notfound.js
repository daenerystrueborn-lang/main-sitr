/** screens/notfound.js - the 404 screen (no loader; static markup). */
export const notfoundHtml = `
<main class="view" id="view-404">
  <div class="auth-wrap">
    <div class="empty">
      <div class="empty-i"><svg class="empty-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9 4.9-2.1z"/></svg></div>
      <h3>That page doesn't exist</h3>
      <p>The link may be old, or the page moved. Everything else is still where you left it.</p>
      <a class="btn btn-primary btn-sm" href="#/" data-route="home" style="margin-top:16px;">Back home</a>
    </div>
  </div>
</main>`
