(() => {
  const state = {
    view: "home",
    project: "OpenAgent",
    branch: "main",
    env: "Local",
    mode: "Agent",
    provider: "Custom",
    model: "gpt-5",
    prevModel: "gpt-5",
    godModel: false,
    editingId: null,
    contexts: [],
    providers: [
      {
        id: "p-custom",
        name: "Custom",
        url: "https://api.example.com/v1",
        key: "",
        format: "openai",
        model: "gpt-5",
        models: ["gpt-5", "gpt-4o", "o3-mini"],
      },
      {
        id: "p-deepseek",
        name: "DeepSeek",
        url: "https://api.deepseek.com/v1",
        key: "",
        format: "openai",
        model: "deepseek-chat",
        models: ["deepseek-chat", "deepseek-reasoner"],
      },
      {
        id: "p-openai",
        name: "OpenAI",
        url: "https://api.openai.com/v1",
        key: "",
        format: "openai",
        model: "gpt-5",
        models: ["gpt-5", "gpt-4o"],
      },
      {
        id: "p-anthropic",
        name: "Anthropic",
        url: "https://api.anthropic.com",
        key: "",
        format: "anthropic",
        model: "claude-sonnet",
        models: ["claude-sonnet", "claude-opus"],
      },
    ],
    projects: ["OpenAgent", "demo-api"],
    threads: [
      {
        id: "t1",
        project: "OpenAgent",
        title: "HTML UI shell",
        time: "1m",
        logs: [
          { kind: "sys", text: "Workspace initialized" },
          { kind: "sys", text: "Provider ready (prototype)" },
        ],
      },
    ],
    activeThreadId: "t1",
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const els = {
    main: $("#main"),
    projectList: $("#projectList"),
    repoList: $("#repoList"),
    ctxProjectBtn: $("#ctxProjectBtn"),
    ctxBranchBtn: $("#ctxBranchBtn"),
    ctxEnvBtn: $("#ctxEnvBtn"),
    modeBtn: $("#modeBtn"),
    menuProject: $("#menuProject"),
    promptInput: $("#promptInput"),
    contextChips: $("#contextChips"),
    sessionStream: $("#sessionStream"),
    sessionTitle: $("#sessionTitle"),
    sessionMeta: $("#sessionMeta"),
    sessionInput: $("#sessionInput"),
    searchInput: $("#searchInput"),
    searchResults: $("#searchResults"),
    workspaceKv: $("#workspaceKv"),
    footMeta: $("#footMeta"),
    toast: $("#toast"),
    homeHint: $("#homeHint"),
  };

  let toastTimer = null;
  const simTimers = new Map(); // threadId -> timeout ids

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      els.toast.hidden = true;
    }, 1800);
  }

  function nowTime() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function closeMenus() {
    $$(".dropdown.open").forEach((d) => {
      d.classList.remove("open");
      d.firstElementChild.setAttribute("aria-expanded", "false");
    });
  }

  function setMode(mode) {
    state.mode = mode;
    els.modeBtn.textContent = `${mode} ▾`;
    $$("#menuMode button").forEach((b) => {
      b.setAttribute("aria-selected", String(b.dataset.value === mode));
    });
  }

  function setGodModel(on) {
    state.godModel = on; // 能力增强开关，不改变当前模型
    const btn = $("#godModelBtn");
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", String(on));
  }

  function setView(view, { nav = true } = {}) {
    state.view = view;
    closeMenus();

    $$(".view").forEach((v) => {
      v.classList.toggle("active", v.dataset.view === view);
    });

    els.main.classList.toggle(
      "align-start",
      view === "session" || view === "search" || view === "workspace" || view === "providers" || view === "settings"
    );

    if (nav) {
      $$(".nav-item[data-view]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.view === view);
      });
    } else {
      $$(".nav-item[data-view]").forEach((btn) => btn.classList.remove("active"));
    }

    if (view === "search") {
      renderSearch(els.searchInput.value || "");
      focusSoon(els.searchInput);
    }
    if (view === "workspace") renderWorkspace();
    if (view === "settings") syncSettingsForm();
    els.homeHint.hidden = view !== "home";
    if (view === "home") focusSoon(els.promptInput);
  }

  function focusSoon(el) {
    setTimeout(() => el.focus(), 0);
  }

  function updateContextLabels() {
    els.ctxProjectBtn.textContent = `${state.project} ▾`;
    els.ctxBranchBtn.textContent = `${state.branch} ▾`;
    els.ctxEnvBtn.textContent = `${state.env} ▾`;
    els.footMeta.textContent = `${state.env} · BYOK · ${state.provider}`;
  }

  function renderProjects() {
    els.projectList.innerHTML = state.projects
      .map(
        (name) => `
      <li>
        <button class="repo-row ${name === state.project ? "selected" : ""}" type="button" data-project="${escapeAttr(name)}">
          <span class="repo-name">${escapeHtml(name)}</span>
        </button>
      </li>`
      )
      .join("");

    els.menuProject.innerHTML = state.projects
      .map(
        (name) =>
          `<button type="button" data-value="${escapeAttr(name)}" aria-selected="${name === state.project}">${escapeHtml(name)}</button>`
      )
      .join("");
  }

  function renderRepos() {
    const byProject = new Map(state.projects.map((p) => [p, []]));
    state.threads.forEach((t) => {
      if (!byProject.has(t.project)) byProject.set(t.project, []);
      byProject.get(t.project).push(t);
    });

    els.repoList.innerHTML = [...byProject.entries()]
      .map(([project, threads]) => {
        const threadHtml =
          threads.length === 0
            ? `<div class="empty-note">No agents yet</div>`
            : `<ul class="thread-list">${threads
                .map(
                  (t) => `
              <li>
                <button class="thread ${t.id === state.activeThreadId ? "active" : ""}" type="button" data-thread="${t.id}">
                  <span class="thread-title">${escapeHtml(t.title)}</span>
                  <span class="thread-time">${escapeHtml(t.time)}</span>
                </button>
              </li>`
                )
                .join("")}</ul>`;

        return `
          <li class="repo">
            <button class="repo-row ${project === state.project ? "selected" : ""}" type="button" data-project="${escapeAttr(project)}">
              <span class="repo-name">${escapeHtml(project)}</span>
            </button>
            ${threadHtml}
          </li>`;
      })
      .join("");
  }

  function renderContextChips() {
    if (!state.contexts.length) {
      els.contextChips.hidden = true;
      els.contextChips.innerHTML = "";
      return;
    }
    els.contextChips.hidden = false;
    els.contextChips.innerHTML = state.contexts
      .map(
        (c, i) => `
      <span class="ctx-chip">
        ${escapeHtml(c)}
        <button type="button" data-remove-ctx="${i}" aria-label="Remove">×</button>
      </span>`
      )
      .join("");
  }

  function renderWorkspace() {
    els.workspaceKv.innerHTML = `
      <dt>Project</dt><dd>${escapeHtml(state.project)}</dd>
      <dt>Path</dt><dd>E:\\work_space\\${escapeHtml(state.project)}</dd>
      <dt>Branch</dt><dd>${escapeHtml(state.branch)}</dd>
      <dt>Env</dt><dd>${escapeHtml(state.env)}</dd>
      <dt>Mode</dt><dd>${escapeHtml(state.mode)}</dd>
      <dt>Provider</dt><dd>${escapeHtml(state.provider)}</dd>
      <dt>Model</dt><dd>${escapeHtml(state.model)}</dd>
    `;
  }

  function activeProvider() {
    return state.providers.find((p) => p.name === state.provider) || state.providers[0];
  }

  function applyProvider(prov) {
    state.provider = prov.name;
    if (prov.model) state.model = prov.model;
    updateContextLabels();
    syncSettingsForm();
  }

  function syncSettingsForm() {
    const p = activeProvider();
    $("#setBaseUrl").value = p.url;
    $("#setApiKey").value = p.key;
    $("#setModel").value = state.model;
  }

  function formatLabel(format) {
    if (format === "openai") return "OpenAI-compatible";
    if (format === "anthropic") return "Anthropic";
    return "Custom";
  }

  // CC Switch 风格预设（仅示例，壳子阶段不发请求）
  const PRESETS = [
    { label: "Custom", name: "", url: "", format: "openai", model: "" },
    { label: "Anthropic", name: "Anthropic", url: "https://api.anthropic.com", format: "anthropic", model: "claude-sonnet", haiku: "claude-haiku", sonnet: "claude-sonnet", opus: "claude-opus", site: "https://console.anthropic.com" },
    { label: "OpenAI", name: "OpenAI", url: "https://api.openai.com/v1", format: "openai", model: "gpt-5", site: "https://platform.openai.com" },
    { label: "DeepSeek", name: "DeepSeek", url: "https://api.deepseek.com/v1", format: "openai", model: "deepseek-chat", site: "https://platform.deepseek.com" },
    { label: "SiliconFlow", name: "SiliconFlow", url: "https://api.siliconflow.cn/v1", format: "openai", model: "", site: "https://siliconflow.cn" },
  ];
  const FIELDS = {
    name: "#provName", notes: "#provNotes", site: "#provSite", key: "#provKey", url: "#provUrl",
    format: "#provFormat", model: "#provModel", haiku: "#provHaiku", sonnet: "#provSonnet", opus: "#provOpus",
  };

  function fillForm(v = {}) {
    for (const [k, sel] of Object.entries(FIELDS)) $(sel).value = v[k] ?? (k === "format" ? "openai" : "");
  }

  function readForm() {
    const o = {};
    for (const [k, sel] of Object.entries(FIELDS)) o[k] = $(sel).value.trim();
    return o;
  }

  function renderPresets() {
    $("#presetRow").innerHTML = PRESETS.map(
      (p, i) => `<button class="chip" type="button" data-preset="${i}">${escapeHtml(p.label)}</button>`
    ).join("");
  }

  function renderProviders() {
    $("#providerList").innerHTML = state.providers
      .map((p) => {
        const active = p.name === state.provider;
        const btn = (act, label) =>
          `<button class="mini" type="button" data-act="${act}" data-id="${escapeAttr(p.id)}">${label}</button>`;
        return `
          <li class="provider-card ${active ? "selected" : ""}">
            <span class="item-main">
              <span>${escapeHtml(p.name)}</span>
              <span class="sub">${escapeHtml(formatLabel(p.format))} · ${escapeHtml(p.model || "no model")}${p.notes ? " · " + escapeHtml(p.notes) : ""}</span>
            </span>
            <span class="card-actions">
              ${active ? '<span class="badge">active</span>' : btn("enable", "Enable")}
              ${btn("edit", "Edit")}${btn("dup", "Copy")}${btn("del", "Delete")}
            </span>
          </li>`;
      })
      .join("");
  }

  function uniqueName(base) {
    let n = base;
    let i = 2;
    while (state.providers.some((p) => p.name.toLowerCase() === n.toLowerCase())) n = `${base} ${i++}`;
    return n;
  }

  function hideProviderForm() {
    $("#providerForm").hidden = true;
    state.editingId = null;
    fillForm();
  }

  function openProviderForm(prov) {
    state.editingId = prov ? prov.id : null;
    $("#providerFormTitle").textContent = prov ? "Edit Provider" : "Add Provider";
    $("#presetRow").hidden = !!prov;
    fillForm(prov || {});
    $("#providerForm").hidden = false;
    $("#provName").focus();
  }

  function isValidUrl(value) {
    try {
      const u = new URL(value);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }

  function renderSearch(query) {
    const q = query.trim().toLowerCase();
    const items = [
      ...state.projects.map((p) => ({ type: "project", label: p, id: p })),
      ...state.threads.map((t) => ({ type: "thread", label: `${t.project} / ${t.title}`, id: t.id })),
    ].filter((i) => !q || i.label.toLowerCase().includes(q));

    els.searchResults.innerHTML = items.length
      ? items
          .map(
            (i) => `
        <li>
          <button class="result-item" type="button" data-search-type="${i.type}" data-search-id="${escapeAttr(i.id)}">
            <span>${escapeHtml(i.label)}</span>
            <span class="badge">${i.type}</span>
          </button>
        </li>`
          )
          .join("")
      : `<li class="empty-note">No matches</li>`;
  }

  function renderSession(thread) {
    els.sessionTitle.textContent = thread.title;
    els.sessionMeta.textContent = `${state.mode} · ${state.project}`;
    els.sessionStream.innerHTML = thread.logs
      .map((log) => {
        const cls = log.kind === "user" ? "user" : log.kind === "run" ? "running" : "";
        const tag = log.kind === "user" ? "you" : log.kind === "run" ? "run" : "sys";
        return `
          <div class="log-line ${cls}">
            <span class="ts">${escapeHtml(log.ts || "--:--")}</span>
            <span class="body"><span class="tag">${tag}</span>${escapeHtml(log.text)}</span>
          </div>`;
      })
      .join("");
    els.sessionStream.scrollTop = els.sessionStream.scrollHeight;
  }

  function selectProject(name) {
    state.project = name;
    updateContextLabels();
    renderProjects();
    renderRepos();
    toast(`Project: ${name}`);
  }

  function openThread(id) {
    const thread = state.threads.find((t) => t.id === id);
    if (!thread) return;
    state.activeThreadId = id;
    state.project = thread.project;
    updateContextLabels();
    renderProjects();
    renderRepos();
    renderSession(thread);
    setView("session", { nav: false });
  }

  function clearSimTimers(threadId) {
    (simTimers.get(threadId) || []).forEach((id) => clearTimeout(id));
    simTimers.delete(threadId);
  }

  function appendLog(thread, kind, text) {
    thread.logs.push({ kind, text, ts: nowTime() });
    if (state.activeThreadId === thread.id && state.view === "session") {
      renderSession(thread);
    }
  }

  function simulateRun(thread, prompt) {
    clearSimTimers(thread.id);
    const steps = [
      {
        kind: "run",
        text: `Mode ${state.mode} · model ${state.model}${state.godModel ? " · GOD Model" : ""} · reading workspace`,
        delay: 400,
      },
      { kind: "run", text: "Analyzing request (prototype)", delay: 900 },
      { kind: "run", text: "Planning changes (prototype)", delay: 1400 },
      { kind: "sys", text: "Waiting for approval — no real tools ran", delay: 1900 },
    ];
    const ids = steps.map((step) =>
      setTimeout(() => appendLog(thread, step.kind, step.text), step.delay)
    );
    simTimers.set(thread.id, ids);
  }

  function createThread(title) {
    const id = `t${Date.now()}`;
    const thread = {
      id,
      project: state.project,
      title: title.slice(0, 42) || "New agent",
      time: "now",
      logs: [{ kind: "sys", text: "Session created (prototype)", ts: nowTime() }],
    };
    state.threads.unshift(thread);
    state.activeThreadId = id;
    renderRepos();
    return thread;
  }

  function sendPrompt(fromSession = false) {
    const input = fromSession ? els.sessionInput : els.promptInput;
    const text = input.value.trim();
    if (!text) {
      toast("Enter a prompt first");
      return;
    }

    let thread = fromSession
      ? state.threads.find((t) => t.id === state.activeThreadId)
      : null;
    if (!thread) thread = createThread(text);

    appendLog(thread, "user", text);
    if (state.contexts.length) {
      appendLog(thread, "sys", `Context: ${state.contexts.join(", ")}`);
      state.contexts = [];
      renderContextChips();
    }
    input.value = "";
    renderRepos();
    renderSession(thread);
    setView("session", { nav: false });
    simulateRun(thread, text);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  // —— Events ——
  $("#newAgentBtn").addEventListener("click", () => {
    state.contexts = [];
    renderContextChips();
    els.promptInput.value = "";
    state.activeThreadId = null;
    renderRepos();
    setView("home", { nav: false });
    toast("New agent");
    els.promptInput.focus();
  });

  $$(".nav-item[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });

  $("#addProjectBtn").addEventListener("click", () => {
    const name = `project-${state.projects.length + 1}`;
    state.projects.push(name);
    selectProject(name);
    renderRepos();
  });

  els.projectList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-project]");
    if (!btn) return;
    selectProject(btn.dataset.project);
  });

  els.repoList.addEventListener("click", (e) => {
    const threadBtn = e.target.closest("[data-thread]");
    if (threadBtn) {
      openThread(threadBtn.dataset.thread);
      return;
    }
    const projectBtn = e.target.closest("[data-project]");
    if (projectBtn) selectProject(projectBtn.dataset.project);
  });

  $$(".dropdown > button").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const dd = btn.closest(".dropdown");
      const wasOpen = dd.classList.contains("open");
      closeMenus();
      if (!wasOpen) {
        dd.classList.add("open");
        btn.setAttribute("aria-expanded", "true");
      }
    });
  });

  document.addEventListener("click", () => closeMenus());

  $("#menuBranch").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-value]");
    if (!b) return;
    state.branch = b.dataset.value;
    updateContextLabels();
    closeMenus();
    toast(`Branch: ${state.branch}`);
  });

  $("#menuEnv").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-value]");
    if (!b) return;
    state.env = b.dataset.value;
    updateContextLabels();
    closeMenus();
    toast(`Env: ${state.env}`);
  });

  els.menuProject.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-value]");
    if (!b) return;
    selectProject(b.dataset.value);
    closeMenus();
  });

  $("#menuMode").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-value]");
    if (!b) return;
    setMode(b.dataset.value);
    closeMenus();
    toast(`Mode: ${state.mode}`);
  });

  $("#godModelBtn").addEventListener("click", () => {
    setGodModel(!state.godModel);
    toast(state.godModel ? "GOD Model on · AI 能力增强" : "GOD Model off");
  });

  function toggleContext(label) {
    const i = state.contexts.indexOf(label);
    if (i >= 0) state.contexts.splice(i, 1);
    else state.contexts.push(label);
    renderContextChips();
  }

  function insertToPrompt(ch) {
    const el = els.promptInput;
    el.value += (el.value && !/\s$/.test(el.value) ? " " : "") + ch;
    el.focus();
  }

  // "+" 菜单（壳子：不做真实上传/搜索）
  $("#menuPlus").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-action]");
    if (!b) return;
    closeMenus();
    switch (b.dataset.action) {
      case "skill":
        insertToPrompt("/");
        toast("输入 / 选择技能（原型）");
        break;
      case "file":
        insertToPrompt("@");
        toast("输入 @ 引用文件（原型）");
        break;
      case "upload":
        $("#fileInput").click();
        break;
      case "web":
        toggleContext("Web Search");
        break;
      case "mcp":
        toggleContext("MCP Tools");
        break;
    }
  });

  $("#fileInput").addEventListener("change", (e) => {
    [...e.target.files].forEach((f) => {
      if (!state.contexts.includes(f.name)) state.contexts.push(f.name);
    });
    e.target.value = "";
    renderContextChips();
  });

  els.contextChips.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove-ctx]");
    if (!btn) return;
    state.contexts.splice(Number(btn.dataset.removeCtx), 1);
    renderContextChips();
  });

  $("#sendBtn").addEventListener("click", () => sendPrompt(false));
  $("#sessionSendBtn").addEventListener("click", () => sendPrompt(true));

  els.promptInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendPrompt(false);
    }
  });

  els.sessionInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendPrompt(true);
    }
  });

  $("#backHomeBtn").addEventListener("click", () => {
    setView("home", { nav: false });
  });

  els.searchInput.addEventListener("input", () => renderSearch(els.searchInput.value));

  els.searchResults.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-search-type]");
    if (!btn) return;
    if (btn.dataset.searchType === "project") {
      selectProject(btn.dataset.searchId);
      setView("home", { nav: false });
    } else {
      openThread(btn.dataset.searchId);
    }
  });

  $("#providerList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    const prov = b && state.providers.find((p) => p.id === b.dataset.id);
    if (!prov) return;
    const act = b.dataset.act;
    if (act === "enable") {
      applyProvider(prov);
      renderProviders();
      toast(`Enabled: ${prov.name}`);
    } else if (act === "edit") {
      openProviderForm(prov);
    } else if (act === "dup") {
      const copy = { ...prov, id: `p-${Date.now()}`, name: uniqueName(`${prov.name} copy`) };
      state.providers.push(copy);
      renderProviders();
      toast(`Copied: ${copy.name}`);
    } else if (act === "del") {
      if (prov.name === state.provider) {
        toast("无法删除正在使用的提供商");
        return;
      }
      state.providers = state.providers.filter((p) => p.id !== prov.id);
      renderProviders();
      toast(`Deleted: ${prov.name}`);
    }
  });

  $("#addProviderBtn").addEventListener("click", () => openProviderForm());
  $("#cancelProviderBtn").addEventListener("click", hideProviderForm);

  $("#presetRow").addEventListener("click", (e) => {
    const b = e.target.closest("[data-preset]");
    if (!b) return;
    const keep = readForm();
    fillForm({ ...PRESETS[Number(b.dataset.preset)], notes: keep.notes, key: keep.key });
  });

  $("#toggleKeyBtn").addEventListener("click", () => {
    const k = $("#provKey");
    const show = k.type === "password";
    k.type = show ? "text" : "password";
    $("#toggleKeyBtn").textContent = show ? "Hide" : "Show";
  });

  $("#saveProviderBtn").addEventListener("click", () => {
    const v = readForm();
    if (!v.name) {
      toast("请填写提供商名称");
      $("#provName").focus();
      return;
    }
    if (!v.url || !isValidUrl(v.url)) {
      toast(v.url ? "URL 格式无效" : "URL 必填");
      $("#provUrl").focus();
      return;
    }
    if (state.providers.some((p) => p.id !== state.editingId && p.name.toLowerCase() === v.name.toLowerCase())) {
      toast("提供商名称已存在");
      return;
    }
    if (state.editingId) {
      const p = state.providers.find((x) => x.id === state.editingId);
      const wasActive = p.name === state.provider;
      Object.assign(p, v);
      if (wasActive) applyProvider(p);
      toast(`Updated: ${p.name}`);
    } else {
      state.providers.push({ id: `p-${Date.now()}`, ...v });
      toast(`Added: ${v.name}`);
    }
    hideProviderForm();
    renderProviders();
  });

  $("#saveSettingsBtn").addEventListener("click", () => {
    const p = activeProvider();
    const url = $("#setBaseUrl").value.trim();
    if (!isValidUrl(url)) {
      toast("Base URL 格式无效");
      $("#setBaseUrl").focus();
      return;
    }
    p.url = url;
    p.key = $("#setApiKey").value.trim();
    const model = $("#setModel").value.trim();
    if (model) {
      p.model = model;
      state.model = model;
      state.prevModel = model;
    }
    updateContextLabels();
    renderProviders();
    toast(`Saved to ${p.name} (memory only)`);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenus();
  });

  // 按钮点击水波纹
  document.addEventListener("pointerdown", (e) => {
    const btn = e.target.closest("button");
    if (!btn || btn.disabled) return;
    const r = btn.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2;
    const dot = document.createElement("span");
    dot.className = "ripple";
    dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    btn.appendChild(dot);
    dot.addEventListener("animationend", () => dot.remove());
  });

  // init
  setMode(state.mode);
  updateContextLabels();
  renderProjects();
  renderRepos();
  renderProviders();
  renderContextChips();
  syncSettingsForm();
  renderPresets();
  setView("home", { nav: false });
})();
