import { baseStyles } from "./styles/base.js";
import { layoutStyles } from "./styles/layout.js";
import { componentStyles } from "./styles/components.js";
import { responsiveStyles } from "./styles/responsive.js";
import { coreScript } from "./scripts/core.js";
import { navigationScript } from "./scripts/navigation.js";
import { explorerScript } from "./scripts/explorer.js";
import { chatScript } from "./scripts/chat.js";

// UI composition entrypoint: styles/scripts are split for maintainability.
const styles = [baseStyles, layoutStyles, componentStyles, responsiveStyles].join("\n");
const appScript = [coreScript, navigationScript, explorerScript, chatScript].join("\n");

export const renderHomeHtml = (): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Alexclaw Research Hub</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,500;6..72,700&display=swap" rel="stylesheet">
  <style>
${styles}
  </style>
</head>
<body>
  <section id="landingView" class="landing">
    <div class="landing-card">
      <p class="landing-eyebrow">Alexclaw Research Hub</p>
      <h1>Your thesis workspace, with chat at the center.</h1>
      <p>
        Create a project with your thesis text and Alexclaw starts background research immediately.
        Manage suggestions, save readings, annotate papers, and open as many chats as you need.
      </p>
      <ul>
        <li>Each project owns its paper explorer, dashboard, reading list, and memory docs.</li>
        <li>Chats are free-form: debate, planning, synthesis, writing support, or quick thinking.</li>
        <li>Research suggestions keep improving while you continue working.</li>
      </ul>
      <div class="landing-actions">
        <a href="/auth/google" class="button primary">Sign in with Google</a>
      </div>
    </div>
  </section>

  <section id="appView" class="app-shell hidden">
    <aside class="sidebar">
      <div class="sidebar-head">
        <div class="brand">Alexclaw</div>
        <div class="sidebar-actions">
          <button id="newProjectButton" type="button" class="button accent">New project</button>
        </div>
      </div>
      <div id="projectTree" class="project-tree"></div>
      <div class="sidebar-foot">
        <div id="userEmail" class="user-email"></div>
        <button id="logoutButton" type="button" class="button soft">Log out</button>
      </div>
    </aside>

    <main class="main">
      <header class="main-head">
        <div>
          <h2 id="mainTitle">Research Hub</h2>
          <p id="mainSubtitle">Create a project to begin.</p>
        </div>
        <div id="mainActions" class="main-actions"></div>
      </header>
      <section id="mainContent" class="main-content"></section>
    </main>
  </section>

  <script>
${appScript}
  </script>
</body>
</html>`;
