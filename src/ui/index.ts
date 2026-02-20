export const renderHomeHtml = (): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Alexclaw Research</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    html { height: 100%; }

    :root {
      --bg: #ffffff;
      --panel: #ffffff;
      --text: #0a0a0a;
      --muted: #5a5a5a;
      --line: #e7e7e7;
      --soft: #f6f6f6;
      --black: #111111;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100%;
      font-family: "Manrope", "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
      -webkit-text-size-adjust: 100%;
    }

    .hidden { display: none !important; }

    .landing {
      min-height: 100vh;
      min-height: 100dvh;
      display: grid;
      place-items: center;
      padding: 20px;
      background: #ffffff;
    }

    .landing-card {
      width: min(780px, 100%);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 28px;
      background: var(--panel);
    }

    .landing-eyebrow {
      margin: 0;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .landing h1 {
      margin: 8px 0 12px;
      font-size: clamp(30px, 4vw, 44px);
      line-height: 1.1;
    }

    .landing p {
      margin: 0 0 18px;
      color: var(--muted);
      font-size: 16px;
      max-width: 60ch;
    }

    .landing ul {
      margin: 0;
      padding-left: 18px;
      color: var(--text);
      display: grid;
      gap: 8px;
    }

    .landing-actions {
      margin-top: 24px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .button {
      appearance: none;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 10px 16px;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      color: var(--text);
      background: #fff;
    }

    .button.primary {
      background: var(--black);
      border-color: var(--black);
      color: #fff;
    }

    .button.ghost {
      background: #fff;
      color: var(--text);
    }

    .app-shell {
      height: 100vh;
      height: 100dvh;
      display: grid;
      grid-template-columns: 290px 1fr;
      background: #fff;
    }

    .sidebar {
      border-right: 1px solid var(--line);
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .sidebar-head {
      padding: 16px;
      border-bottom: 1px solid var(--line);
      display: grid;
      gap: 10px;
    }

    .brand {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.01em;
    }

    .chat-list {
      padding: 10px;
      overflow-y: auto;
      display: grid;
      gap: 6px;
      align-content: start;
      min-height: 0;
      flex: 1;
    }

    .chat-item {
      width: 100%;
      text-align: left;
      border: 1px solid transparent;
      background: transparent;
      border-radius: 10px;
      padding: 10px;
      cursor: pointer;
      display: grid;
      gap: 4px;
      color: var(--text);
    }

    .chat-item:hover { background: var(--soft); }

    .chat-item.active {
      background: #f2f2f2;
      border-color: var(--line);
    }

    .chat-title {
      font-size: 14px;
      font-weight: 600;
      line-height: 1.3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .chat-meta {
      font-size: 12px;
      color: var(--muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .empty-note {
      margin: 4px;
      font-size: 13px;
      color: var(--muted);
      border: 1px dashed var(--line);
      border-radius: 10px;
      padding: 12px;
    }

    .sidebar-foot {
      border-top: 1px solid var(--line);
      padding: 12px 14px;
      display: grid;
      gap: 8px;
      font-size: 12px;
      color: var(--muted);
    }

    .user-email {
      font-weight: 600;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .main {
      min-width: 0;
      min-height: 0;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
    }

    .main-head {
      border-bottom: 1px solid var(--line);
      padding: 18px 20px;
      background: #fff;
    }

    .main-head h2 {
      margin: 0;
      font-size: 20px;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .main-head p {
      margin: 5px 0 0;
      color: var(--muted);
      font-size: 13px;
    }

    .messages {
      overflow-y: auto;
      min-height: 0;
      display: grid;
      gap: 14px;
      padding: 22px 20px;
      align-content: start;
      background: #fff;
    }

    .message {
      width: min(860px, 100%);
      border-radius: 14px;
      padding: 14px 15px;
      border: 1px solid var(--line);
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .message.user {
      justify-self: end;
      background: var(--black);
      border-color: var(--black);
      color: #fff;
    }

    .message.assistant {
      justify-self: start;
      background: var(--soft);
      color: var(--text);
    }

    .assistant-title {
      margin: 0 0 8px;
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #444;
    }

    .assistant-list {
      margin: 0;
      padding-left: 18px;
      display: grid;
      gap: 7px;
    }

    .typing {
      display: inline-flex;
      gap: 5px;
      align-items: center;
      margin-right: 8px;
      vertical-align: middle;
    }

    .typing span {
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: #333;
      animation: pulse 1s infinite ease-in-out;
    }

    .typing span:nth-child(2) { animation-delay: 0.18s; }
    .typing span:nth-child(3) { animation-delay: 0.36s; }

    @keyframes pulse {
      0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
      40% { opacity: 1; transform: translateY(-1px); }
    }

    .composer {
      border-top: 1px solid var(--line);
      padding: 12px;
      padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
      background: #fff;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: end;
    }

    .composer textarea {
      width: 100%;
      min-height: 74px;
      max-height: 220px;
      resize: vertical;
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px;
      font: inherit;
      color: var(--text);
      background: #fff;
    }

    .composer textarea:focus,
    .button:focus {
      outline: 2px solid #111;
      outline-offset: 1px;
    }

    .inline-button {
      margin-top: 10px;
    }

    @media (max-width: 960px) {
      .app-shell {
        grid-template-columns: 1fr;
        grid-template-rows: auto minmax(0, 1fr);
      }

      .sidebar {
        border-right: none;
        border-bottom: 1px solid var(--line);
      }

      .chat-list {
        max-height: 220px;
      }

      .main {
        min-height: auto;
      }
    }

    @media (max-width: 640px) {
      .landing {
        padding: 14px;
      }

      .landing-card {
        padding: 20px;
        border-radius: 12px;
      }

      .landing h1 {
        font-size: clamp(26px, 9vw, 34px);
      }

      .sidebar-head,
      .sidebar-foot {
        padding: 12px;
      }

      .chat-list {
        max-height: 170px;
      }

      .main-head {
        padding: 14px;
      }

      .main-head h2 {
        white-space: normal;
        overflow: visible;
        text-overflow: unset;
      }

      .messages {
        padding: 14px;
      }

      .composer {
        grid-template-columns: 1fr;
      }

      .composer .button {
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <section id="landingView" class="landing">
    <div class="landing-card">
      <p class="landing-eyebrow">Alexclaw Research</p>
      <h1>Academic research, in a chat.</h1>
      <p>
        Paste your thesis text and Alexclaw runs a research pipeline to find relevant academic papers.
        Each thesis becomes its own chat thread.
      </p>
      <ul>
        <li>Start one chat per thesis or research question.</li>
        <li>Wait while the agent works in the background.</li>
        <li>Read the first response as a clean list of discovered paper titles.</li>
      </ul>
      <div class="landing-actions">
        <a href="/auth/google" class="button primary">Sign in with Google</a>
      </div>
    </div>
  </section>

  <section id="appView" class="app-shell hidden">
    <aside class="sidebar">
      <div class="sidebar-head">
        <div class="brand">Alexclaw Research</div>
        <button id="newChatButton" type="button" class="button ghost">New chat</button>
      </div>
      <div id="chatList" class="chat-list"></div>
      <div class="sidebar-foot">
        <div id="userEmail" class="user-email"></div>
        <button id="logoutButton" type="button" class="button ghost">Log out</button>
      </div>
    </aside>

    <main class="main">
      <header class="main-head">
        <h2 id="chatTitle">New chat</h2>
        <p id="chatSubtitle">Paste a thesis to start your research run.</p>
      </header>

      <section id="messages" class="messages"></section>

      <form id="composer" class="composer">
        <textarea id="composerInput" placeholder="Paste thesis text (minimum 30 characters)" required></textarea>
        <button id="sendButton" type="submit" class="button primary">Send</button>
      </form>
    </main>
  </section>

  <script>
    const state = {
      user: null,
      theses: [],
      runsByThesis: new Map(),
      thesisDetails: new Map(),
      runPapersById: new Map(),
      activeThesisId: null,
      pollingTimer: null,
      pollInFlight: false,
      sending: false
    };

    const byId = (id) => document.getElementById(id);
    const clearNode = (node) => node.replaceChildren();

    async function api(path, options = {}) {
      const response = await fetch(path, {
        ...options,
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          ...(options.headers || {})
        }
      });

      const isJson = (response.headers.get("content-type") || "").includes("application/json");
      const payload = isJson ? await response.json() : await response.text();
      if (!response.ok) {
        const message = typeof payload === "string" ? payload : payload.error || "Request failed";
        throw new Error(message);
      }
      return payload;
    }

    function showError(error) {
      alert(error && error.message ? error.message : String(error));
    }

    function formatDate(iso) {
      try {
        return new Date(iso).toLocaleString();
      } catch {
        return "";
      }
    }

    function thesisDisplayTitle(thesis) {
      const raw = typeof thesis.title === "string" ? thesis.title.trim() : "";
      if (raw) {
        return raw;
      }
      return "Thesis " + thesis.id.slice(0, 8);
    }

    function runStateLabel(run) {
      if (!run) {
        return "Draft";
      }
      if (run.status === "COMPLETED") {
        return "Complete";
      }
      if (run.status === "FAILED") {
        return "Failed";
      }
      return "Working";
    }

    function isRunPending(run) {
      return Boolean(run && (run.status === "QUEUED" || run.status === "RUNNING"));
    }

    function showLanding() {
      byId("landingView").classList.remove("hidden");
      byId("appView").classList.add("hidden");
      stopPolling();
    }

    function showApp() {
      byId("landingView").classList.add("hidden");
      byId("appView").classList.remove("hidden");
    }

    async function loadAuth() {
      try {
        const data = await api("/api/auth/me");
        state.user = data.user;
      } catch {
        state.user = null;
      }

      if (!state.user) {
        showLanding();
        return;
      }

      showApp();
      byId("userEmail").textContent = state.user.email;
      await loadChats();
    }

    async function loadChats() {
      const [thesesPayload, runsPayload] = await Promise.all([api("/api/theses"), api("/api/runs")]);
      state.theses = thesesPayload.theses || [];

      const latestRunByThesis = new Map();
      (runsPayload.runs || []).forEach((run) => {
        if (!latestRunByThesis.has(run.thesisId)) {
          latestRunByThesis.set(run.thesisId, run);
        }
      });
      state.runsByThesis = latestRunByThesis;

      if (!state.activeThesisId && state.theses.length > 0) {
        state.activeThesisId = state.theses[0].id;
      }
      if (state.activeThesisId && !state.theses.some((thesis) => thesis.id === state.activeThesisId)) {
        state.activeThesisId = null;
      }

      renderChatList();
      await renderActiveChat();
    }

    function renderChatList() {
      const list = byId("chatList");
      clearNode(list);

      if (state.theses.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-note";
        empty.textContent = "No chats yet. Start by pasting thesis text below.";
        list.append(empty);
        return;
      }

      state.theses.forEach((thesis) => {
        const run = state.runsByThesis.get(thesis.id) || null;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "chat-item" + (state.activeThesisId === thesis.id ? " active" : "");

        const title = document.createElement("div");
        title.className = "chat-title";
        title.textContent = thesisDisplayTitle(thesis);
        button.append(title);

        const meta = document.createElement("div");
        meta.className = "chat-meta";
        meta.textContent = runStateLabel(run) + " • " + formatDate((run && run.updatedAt) || thesis.createdAt);
        button.append(meta);

        button.addEventListener("click", async () => {
          state.activeThesisId = thesis.id;
          renderChatList();
          await renderActiveChat();
        });

        list.append(button);
      });
    }

    async function ensureThesisDetail(thesisId) {
      if (state.thesisDetails.has(thesisId)) {
        return state.thesisDetails.get(thesisId);
      }
      const payload = await api("/api/theses/" + thesisId);
      state.thesisDetails.set(thesisId, payload.thesis);
      return payload.thesis;
    }

    function createMessage(role) {
      const el = document.createElement("article");
      el.className = "message " + role;
      return el;
    }

    async function renderActiveChat() {
      const messages = byId("messages");
      clearNode(messages);

      if (!state.activeThesisId) {
        byId("chatTitle").textContent = "New chat";
        byId("chatSubtitle").textContent = "Paste a thesis to begin your academic research run.";

        const intro = createMessage("assistant");
        const introTitle = document.createElement("p");
        introTitle.className = "assistant-title";
        introTitle.textContent = "How it works";
        intro.append(introTitle);

        const introText = document.createElement("p");
        introText.textContent = "Send thesis text to create a new chat. The agent will process it and reply with discovered paper titles.";
        intro.append(introText);

        messages.append(intro);
        stopPolling();
        return;
      }

      const thesis = state.theses.find((item) => item.id === state.activeThesisId);
      if (!thesis) {
        stopPolling();
        return;
      }

      byId("chatTitle").textContent = thesisDisplayTitle(thesis);
      byId("chatSubtitle").textContent = "Academic research assistant";

      let detail = state.thesisDetails.get(thesis.id) || null;
      if (!detail) {
        try {
          detail = await ensureThesisDetail(thesis.id);
        } catch {
          detail = {
            id: thesis.id,
            title: thesis.title,
            text: thesis.textPreview || "",
            createdAt: thesis.createdAt
          };
        }
      }

      const userMessage = createMessage("user");
      userMessage.textContent = detail.text || "(No thesis text found)";
      messages.append(userMessage);

      const run = state.runsByThesis.get(thesis.id) || null;
      if (!run) {
        const assistant = createMessage("assistant");
        assistant.textContent = "No analysis has started for this chat yet.";
        messages.append(assistant);
        stopPolling();
        messages.scrollTop = messages.scrollHeight;
        return;
      }

      if (run.status === "FAILED") {
        const assistant = createMessage("assistant");
        const title = document.createElement("p");
        title.className = "assistant-title";
        title.textContent = "Run failed";
        assistant.append(title);

        const text = document.createElement("p");
        text.textContent = run.error || "The agent could not finish this run.";
        assistant.append(text);

        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "button primary inline-button";
        retry.textContent = "Retry this chat";
        retry.addEventListener("click", async () => {
          try {
            await createRunForThesis(thesis.id);
          } catch (error) {
            showError(error);
          }
        });
        assistant.append(retry);

        messages.append(assistant);
        stopPolling();
        messages.scrollTop = messages.scrollHeight;
        return;
      }

      if (isRunPending(run)) {
        const assistant = createMessage("assistant");
        const title = document.createElement("p");
        title.className = "assistant-title";
        title.textContent = "Agent is working";
        assistant.append(title);

        const text = document.createElement("p");
        text.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>Analyzing your thesis and searching academic sources...';
        assistant.append(text);
        messages.append(assistant);

        restartPolling();
        messages.scrollTop = messages.scrollHeight;
        return;
      }

      if (run.status === "COMPLETED") {
        let paperTitles = state.runPapersById.get(run.id) || null;
        if (!paperTitles) {
          try {
            const papersPayload = await api("/api/runs/" + run.id + "/papers");
            paperTitles = (papersPayload.papers || []).map((paper) => paper.title).filter(Boolean);
            state.runPapersById.set(run.id, paperTitles);
          } catch {
            paperTitles = [];
          }
        }

        const assistant = createMessage("assistant");
        const title = document.createElement("p");
        title.className = "assistant-title";
        title.textContent = "Found titles";
        assistant.append(title);

        if (!paperTitles || paperTitles.length === 0) {
          const empty = document.createElement("p");
          empty.textContent = "No paper titles were found for this thesis yet.";
          assistant.append(empty);
        } else {
          const intro = document.createElement("p");
          intro.textContent = "Here are the paper titles found for this thesis:";
          assistant.append(intro);

          const list = document.createElement("ol");
          list.className = "assistant-list";
          paperTitles.slice(0, 50).forEach((paperTitle) => {
            const item = document.createElement("li");
            item.textContent = paperTitle;
            list.append(item);
          });
          assistant.append(list);
        }

        messages.append(assistant);
        stopPolling();
      }

      messages.scrollTop = messages.scrollHeight;
    }

    async function createRunForThesis(thesisId) {
      await api("/api/theses/" + thesisId + "/runs", { method: "POST" });
      await loadChats();
    }

    function stopPolling() {
      if (state.pollingTimer) {
        clearInterval(state.pollingTimer);
        state.pollingTimer = null;
      }
    }

    function restartPolling() {
      stopPolling();

      const thesisId = state.activeThesisId;
      if (!thesisId) {
        return;
      }

      const run = state.runsByThesis.get(thesisId) || null;
      if (!isRunPending(run)) {
        return;
      }

      state.pollingTimer = setInterval(async () => {
        if (state.pollInFlight) {
          return;
        }
        state.pollInFlight = true;
        try {
          await loadChats();
        } catch {
          // keep polling; transient errors are expected
        } finally {
          state.pollInFlight = false;
        }
      }, 4000);
    }

    async function submitComposer() {
      if (state.sending) {
        return;
      }

      const input = byId("composerInput");
      const raw = input.value || "";
      const text = raw.trim();
      if (text.length < 30) {
        showError(new Error("Please provide at least 30 characters of thesis text."));
        return;
      }

      state.sending = true;
      const sendButton = byId("sendButton");
      sendButton.disabled = true;
      sendButton.textContent = "Sending...";

      try {
        const thesisPayload = await api("/api/theses", {
          method: "POST",
          body: JSON.stringify({ text })
        });

        const thesis = thesisPayload.thesis;
        state.thesisDetails.set(thesis.id, {
          id: thesis.id,
          title: thesis.title,
          text,
          createdAt: thesis.createdAt
        });

        state.activeThesisId = thesis.id;

        try {
          await createRunForThesis(thesis.id);
        } catch (error) {
          await loadChats();
          throw error;
        }

        input.value = "";
      } finally {
        state.sending = false;
        sendButton.disabled = false;
        sendButton.textContent = "Send";
      }
    }

    byId("composer").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await submitComposer();
      } catch (error) {
        showError(error);
      }
    });

    byId("newChatButton").addEventListener("click", async () => {
      state.activeThesisId = null;
      renderChatList();
      await renderActiveChat();
      byId("composerInput").focus();
    });

    byId("logoutButton").addEventListener("click", async () => {
      try {
        await api("/api/auth/logout", { method: "POST" });
      } catch {
        // best effort logout
      }

      state.user = null;
      state.theses = [];
      state.runsByThesis = new Map();
      state.thesisDetails = new Map();
      state.runPapersById = new Map();
      state.activeThesisId = null;
      stopPolling();
      showLanding();
    });

    async function boot() {
      await loadAuth();
    }

    boot().catch(showError);
  </script>
</body>
</html>`;
