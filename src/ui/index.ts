export const renderHomeHtml = (): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Alexclaw (Cloudflare)</title>
  <style>
    :root {
      --bg: #eef3f7;
      --panel: #ffffff;
      --text: #13263a;
      --muted: #5e6f80;
      --primary: #0b5fa6;
      --border: #d7e2eb;
      --danger: #b42318;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      background: radial-gradient(circle at top left, #f8fbff 0%, #ecf2f7 45%, #e4edf5 100%);
      color: var(--text);
    }
    .container {
      max-width: 1120px;
      margin: 0 auto;
      padding: 20px;
      display: grid;
      gap: 14px;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px;
    }
    .row {
      display: grid;
      gap: 10px;
      grid-template-columns: 1fr 1fr;
    }
    textarea, input, select, button {
      width: 100%;
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: 8px;
      font: inherit;
      background: #fff;
    }
    textarea { min-height: 130px; resize: vertical; }
    button { width: auto; background: var(--primary); color: #fff; border: none; cursor: pointer; }
    button.secondary { background: #596b7d; }
    button.danger { background: var(--danger); }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { text-align: left; border-bottom: 1px solid var(--border); padding: 8px; vertical-align: top; }
    .badge {
      display: inline-block;
      border-radius: 999px;
      padding: 3px 8px;
      font-size: 12px;
      background: #e3edf6;
      font-weight: 600;
    }
    .muted { color: var(--muted); font-size: 14px; }
    @media (max-width: 900px) {
      .row { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
<div class="container">
  <section class="panel">
    <h1>Alexclaw</h1>
    <p class="muted">Cloudflare Workers + Queues + Workflows + D1</p>
    <div id="auth"></div>
  </section>

  <section class="panel" id="submitPanel" hidden>
    <h2>Thesis Intake</h2>
    <div class="row">
      <div>
        <label for="title">Title</label>
        <input id="title" placeholder="Thesis title" />
      </div>
      <div>
        <label for="thesisSelect">Existing thesis</label>
        <select id="thesisSelect"></select>
      </div>
    </div>
    <label for="text">Thesis text</label>
    <textarea id="text" placeholder="Paste thesis text"></textarea>
    <div class="actions" style="margin-top: 10px;">
      <button id="createThesis">Create Thesis</button>
      <button id="createRun" class="secondary">Run Pipeline</button>
    </div>
  </section>

  <section class="panel" id="runsPanel" hidden>
    <h2>Runs</h2>
    <table>
      <thead>
        <tr><th>Run</th><th>Status</th><th>Updated</th><th>Action</th></tr>
      </thead>
      <tbody id="runsBody"></tbody>
    </table>
  </section>

  <section class="panel" id="detailsPanel" hidden>
    <h2>Run Details</h2>
    <p id="detailsMeta" class="muted"></p>
    <div class="actions"><button id="refreshRun" class="secondary">Refresh</button></div>

    <h3>Papers</h3>
    <table>
      <thead><tr><th>Title</th><th>Tier</th><th>Total</th><th>Citations</th><th>PDF</th></tr></thead>
      <tbody id="papersBody"></tbody>
    </table>

    <h3>Authors</h3>
    <table>
      <thead><tr><th>Name</th><th>Count</th></tr></thead>
      <tbody id="authorsBody"></tbody>
    </table>

    <h3>Edges</h3>
    <table>
      <thead><tr><th>Source</th><th>Type</th><th>Target</th><th>Weight</th></tr></thead>
      <tbody id="edgesBody"></tbody>
    </table>
  </section>
</div>
<script>
  const state = { user: null, theses: [], runs: [], activeRun: null };
  const byId = (id) => document.getElementById(id);

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
    alert(error?.message || String(error));
  }

  async function loadAuth() {
    try {
      const data = await api('/api/auth/me');
      state.user = data.user;
    } catch {
      state.user = null;
    }

    const auth = byId('auth');
    if (!state.user) {
      auth.innerHTML = '<div class="actions"><a href="/auth/google"><button>Sign in with Google</button></a></div>';
      byId('submitPanel').hidden = true;
      byId('runsPanel').hidden = true;
      byId('detailsPanel').hidden = true;
      return;
    }

    auth.innerHTML = '<div class="actions"><span class="badge">' + state.user.email + '</span><button id="logout" class="danger">Logout</button></div>';
    byId('logout').onclick = async () => {
      await api('/api/auth/logout', { method: 'POST' });
      await boot();
    };

    byId('submitPanel').hidden = false;
    byId('runsPanel').hidden = false;
    await loadTheses();
    await loadRuns();
  }

  async function loadTheses() {
    const data = await api('/api/theses');
    state.theses = data.theses;
    const select = byId('thesisSelect');
    select.innerHTML = '';
    state.theses.forEach((thesis) => {
      const option = document.createElement('option');
      option.value = thesis.id;
      option.textContent = thesis.title + ' (' + new Date(thesis.createdAt).toLocaleString() + ')';
      select.append(option);
    });
  }

  async function loadRuns() {
    const data = await api('/api/runs');
    state.runs = data.runs;
    const body = byId('runsBody');
    body.innerHTML = '';
    state.runs.forEach((run) => {
      const row = document.createElement('tr');
      row.innerHTML =
        '<td><code>' + run.id.slice(0, 8) + '</code></td>' +
        '<td><span class="badge">' + run.status + '</span></td>' +
        '<td>' + new Date(run.updatedAt).toLocaleString() + '</td>' +
        '<td><button data-run="' + run.id + '" class="secondary">Inspect</button></td>';
      body.append(row);
    });

    body.querySelectorAll('button[data-run]').forEach((button) => {
      button.addEventListener('click', async () => {
        state.activeRun = button.getAttribute('data-run');
        await loadRunDetails();
      });
    });
  }

  async function loadRunDetails() {
    if (!state.activeRun) return;
    const [run, papers, authors, edges] = await Promise.all([
      api('/api/runs/' + state.activeRun),
      api('/api/runs/' + state.activeRun + '/papers'),
      api('/api/runs/' + state.activeRun + '/authors'),
      api('/api/runs/' + state.activeRun + '/edges')
    ]);

    byId('detailsPanel').hidden = false;
    byId('detailsMeta').textContent = 'Status: ' + run.run.status + ' | Steps: ' + run.run.steps.length;

    const papersBody = byId('papersBody');
    papersBody.innerHTML = '';
    papers.papers.slice(0, 50).forEach((paper) => {
      const row = document.createElement('tr');
      row.innerHTML =
        '<td>' + paper.title + '</td>' +
        '<td><span class="badge">' + paper.tier + '</span></td>' +
        '<td>' + paper.score.total.toFixed(3) + '</td>' +
        '<td>' + (paper.citationCount || 0) + '</td>' +
        '<td>' + (paper.access.pdfUrl ? '<a href="' + paper.access.pdfUrl + '" target="_blank" rel="noreferrer">PDF</a>' : '-') + '</td>';
      papersBody.append(row);
    });

    const authorsBody = byId('authorsBody');
    authorsBody.innerHTML = '';
    authors.authors.slice(0, 50).forEach((author) => {
      const row = document.createElement('tr');
      row.innerHTML = '<td>' + author.name + '</td><td>' + author.paperCount + '</td>';
      authorsBody.append(row);
    });

    const edgesBody = byId('edgesBody');
    edgesBody.innerHTML = '';
    edges.edges.slice(0, 50).forEach((edge) => {
      const row = document.createElement('tr');
      row.innerHTML = '<td>' + edge.sourceTitle + '</td><td>' + edge.type + '</td><td>' + edge.targetTitle + '</td><td>' + edge.weight.toFixed(2) + '</td>';
      edgesBody.append(row);
    });
  }

  byId('createThesis').onclick = async () => {
    try {
      await api('/api/theses', {
        method: 'POST',
        body: JSON.stringify({
          title: byId('title').value,
          text: byId('text').value
        })
      });
      byId('title').value = '';
      byId('text').value = '';
      await loadTheses();
      await loadRuns();
    } catch (error) {
      showError(error);
    }
  };

  byId('createRun').onclick = async () => {
    try {
      const thesisId = byId('thesisSelect').value;
      const result = await api('/api/theses/' + thesisId + '/runs', { method: 'POST' });
      state.activeRun = result.run.id;
      await loadRuns();
      await loadRunDetails();
    } catch (error) {
      showError(error);
    }
  };

  byId('refreshRun').onclick = async () => {
    try {
      await loadRuns();
      await loadRunDetails();
    } catch (error) {
      showError(error);
    }
  };

  setInterval(async () => {
    if (!state.user) return;
    try {
      await loadRuns();
      await loadRunDetails();
    } catch {
      // noop
    }
  }, 5000);

  async function boot() {
    await loadAuth();
  }

  boot().catch(showError);
</script>
</body>
</html>`;
