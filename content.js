(() => {
  const BUTTON_ID = "lop-remove-unnecessary-tasks-btn";
  const STATUS_ID = "lop-remove-status";
  const WRAPPER_ID = "lop-remove-wrapper";

  const EXACT_MATCHES = new Set([
    "Follow up today - Beth replied via SMS",
    "Review & send first call follow-up",
  ]);
  const PREFIX_MATCHES = [
    "Reach out to Agent:",
    "Call now - Beth's contact status",
  ];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitFor(predicate, { timeout = 8000, interval = 100 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const v = predicate();
      if (v) return v;
      await sleep(interval);
    }
    return null;
  }

  function isUnnecessary(name) {
    if (!name) return false;
    const n = name.trim();
    if (EXACT_MATCHES.has(n)) return true;
    return PREFIX_MATCHES.some((p) => n.startsWith(p));
  }

  function getTaskName(tr) {
    const cell = tr.querySelector('td[data-column="next-task"]');
    if (!cell) return null;
    const named = cell.querySelector(".neglected-task-name");
    if (named) return named.textContent;
    const fallback = cell.querySelector(".slds-text-body_regular > span");
    return fallback ? fallback.textContent : null;
  }

  function getMatchingRows() {
    const rows = Array.from(document.querySelectorAll("tr[data-task-id]"));
    return rows.filter((tr) => isUnnecessary(getTaskName(tr)));
  }

  function findCompleteButtonForTask(expectedName) {
    const sidebar = document.querySelector("c-lo-desktop-v2-sidebar");
    if (!sidebar) return null;
    const manage = sidebar.querySelector("c-lo-desktop-v2-manage-task");
    if (!manage) return null;

    const titleEl = manage.querySelector(".slds-text-heading_small");
    if (!titleEl) return null;
    if (titleEl.textContent.trim() !== expectedName.trim()) return null;

    for (const b of manage.querySelectorAll("button")) {
      if (b.title === "Complete Task" || b.textContent.trim() === "Complete task") {
        return b;
      }
    }
    return null;
  }

  function openRow(tr) {
    tr.click();
    const link = tr.querySelector(".slds-link");
    if (link) link.click();
  }

  async function completeOne(tr) {
    const name = (getTaskName(tr) || "").trim();
    const taskId = tr.getAttribute("data-task-id");
    setStatus(`Completing: ${name}`);

    openRow(tr);

    const completeBtn = await waitFor(() => findCompleteButtonForTask(name), {
      timeout: 10000,
    });
    if (!completeBtn) {
      console.warn("[LOP] Sidebar did not show expected task; skipping", { name, taskId });
      return false;
    }

    completeBtn.click();

    const cleared = await waitFor(
      () => {
        const stillThere = document.querySelector(`tr[data-task-id="${taskId}"]`);
        if (!stillThere) return true;
        if (stillThere.getAttribute("data-fading-out") === "true") return true;
        return false;
      },
      { timeout: 12000 }
    );

    await sleep(400);
    return Boolean(cleared);
  }

  async function run() {
    const rows = getMatchingRows();
    if (rows.length === 0) {
      setStatus("No unnecessary tasks found.");
      return;
    }

    const preview = rows
      .map((r) => `• ${(getTaskName(r) || "").trim()}`)
      .join("\n");
    if (!confirm(`Mark ${rows.length} task(s) complete?\n\n${preview}`)) {
      setStatus("Cancelled.");
      return;
    }

    const btn = document.getElementById(BUTTON_ID);
    if (btn) btn.disabled = true;

    let done = 0;
    let failed = 0;
    for (const tr of rows) {
      if (!document.contains(tr)) {
        failed++;
        continue;
      }
      try {
        const ok = await completeOne(tr);
        if (ok) done++;
        else failed++;
      } catch (e) {
        console.error("[LOP] error completing row", e);
        failed++;
      }
    }

    if (btn) btn.disabled = false;
    setStatus(`Done. Completed ${done}, failed ${failed}.`);
  }

  function setStatus(text) {
    const el = document.getElementById(STATUS_ID);
    if (el) el.textContent = text;
  }

  function buildWrapper() {
    const wrapper = document.createElement("div");
    wrapper.id = WRAPPER_ID;
    wrapper.className = "lop-remove-wrapper";

    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.type = "button";
    btn.className = "lop-remove-btn";
    btn.textContent = "Remove unnecessary tasks";
    btn.addEventListener("click", run);

    const status = document.createElement("span");
    status.id = STATUS_ID;
    status.className = "lop-remove-status";

    wrapper.appendChild(btn);
    wrapper.appendChild(status);
    return wrapper;
  }

  function injectButton() {
    if (document.getElementById(BUTTON_ID)) return true;

    const refreshBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      /refresh data/i.test(b.textContent || "")
    );

    const wrapper = buildWrapper();

    if (refreshBtn && refreshBtn.parentElement) {
      refreshBtn.parentElement.insertBefore(wrapper, refreshBtn);
      return true;
    }

    wrapper.classList.add("lop-floating");
    document.body.appendChild(wrapper);
    return true;
  }

  function tryInject() {
    if (!document.querySelector("c-lo-desktop-v2-new-unified-table, tr[data-task-id]")) {
      return false;
    }
    return injectButton();
  }

  const observer = new MutationObserver(() => {
    tryInject();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  tryInject();
})();
