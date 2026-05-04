(() => {
  const BUTTON_ID = "lop-remove-unnecessary-tasks-btn";
  const STATUS_ID = "lop-remove-status";
  const WRAPPER_ID = "lop-remove-wrapper";
  const MODAL_ID = "lop-remove-modal";

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
    if (!tr) return null;
    const cell = tr.querySelector('td[data-column="next-task"]');
    if (!cell) return null;
    const named = cell.querySelector(".neglected-task-name");
    if (named) return named.textContent;
    const fallback = cell.querySelector(".slds-text-body_regular > span");
    return fallback ? fallback.textContent : null;
  }

  function findRowByTaskId(taskId) {
    return document.querySelector(`tr[data-task-id="${taskId}"]`);
  }

  function getMatchingTasks() {
    const out = [];
    for (const tr of document.querySelectorAll("tr[data-task-id]")) {
      const name = getTaskName(tr);
      if (!isUnnecessary(name)) continue;
      const taskId = tr.getAttribute("data-task-id");
      if (taskId) out.push({ taskId, name: name.trim() });
    }
    return out;
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

  async function completeTask({ taskId, name }) {
    setStatus(`Completing: ${name}`);

    const tr = await waitFor(() => findRowByTaskId(taskId), { timeout: 5000 });
    if (!tr) {
      console.warn("[LOP] Row not found for task", { taskId, name });
      return false;
    }

    tr.click();
    const link = tr.querySelector(".slds-link");
    if (link) link.click();

    const completeBtn = await waitFor(() => findCompleteButtonForTask(name), {
      timeout: 12000,
    });
    if (!completeBtn) {
      console.warn("[LOP] Sidebar did not show expected task; skipping", {
        taskId,
        name,
      });
      return false;
    }

    completeBtn.click();

    const cleared = await waitFor(
      () => {
        const row = findRowByTaskId(taskId);
        if (!row) return true;
        if (row.getAttribute("data-fading-out") === "true") return true;
        return false;
      },
      { timeout: 15000 }
    );

    await sleep(500);
    return Boolean(cleared);
  }

  async function start() {
    const tasks = getMatchingTasks();
    if (tasks.length === 0) {
      setStatus("No unnecessary tasks found.");
      return;
    }

    const ok = await openConfirmModal(tasks);
    if (!ok) {
      setStatus("Cancelled.");
      return;
    }

    const btn = document.getElementById(BUTTON_ID);
    if (btn) btn.disabled = true;

    let done = 0;
    let failed = 0;
    for (const task of tasks) {
      try {
        const success = await completeTask(task);
        if (success) done++;
        else failed++;
      } catch (e) {
        console.error("[LOP] error completing task", task, e);
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

  function openConfirmModal(tasks) {
    return new Promise((resolve) => {
      const existing = document.getElementById(MODAL_ID);
      if (existing) existing.remove();

      const overlay = document.createElement("div");
      overlay.id = MODAL_ID;
      overlay.className = "lop-modal-overlay";

      const dialog = document.createElement("div");
      dialog.className = "lop-modal";

      const heading = document.createElement("div");
      heading.className = "lop-modal-heading";
      heading.textContent = `Mark ${tasks.length} task(s) complete?`;

      const list = document.createElement("ul");
      list.className = "lop-modal-list";
      for (const t of tasks) {
        const li = document.createElement("li");
        li.textContent = t.name;
        list.appendChild(li);
      }

      const actions = document.createElement("div");
      actions.className = "lop-modal-actions";

      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "lop-modal-btn lop-modal-cancel";
      cancel.textContent = "Cancel";

      const ok = document.createElement("button");
      ok.type = "button";
      ok.className = "lop-modal-btn lop-modal-ok";
      ok.textContent = "Complete tasks";

      const cleanup = (result) => {
        overlay.remove();
        resolve(result);
      };

      cancel.addEventListener("click", (e) => {
        e.stopPropagation();
        cleanup(false);
      });
      ok.addEventListener("click", (e) => {
        e.stopPropagation();
        cleanup(true);
      });
      overlay.addEventListener("click", (e) => {
        e.stopPropagation();
        if (e.target === overlay) cleanup(false);
      });

      actions.appendChild(cancel);
      actions.appendChild(ok);
      dialog.appendChild(heading);
      dialog.appendChild(list);
      dialog.appendChild(actions);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
    });
  }

  function buildWrapper() {
    const wrapper = document.createElement("div");
    wrapper.id = WRAPPER_ID;
    wrapper.className = "lop-remove-wrapper lop-floating";

    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.type = "button";
    btn.className = "lop-remove-btn";
    btn.textContent = "Remove unnecessary tasks";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      start();
    });

    const status = document.createElement("span");
    status.id = STATUS_ID;
    status.className = "lop-remove-status";

    wrapper.appendChild(btn);
    wrapper.appendChild(status);
    return wrapper;
  }

  function injectButton() {
    if (document.getElementById(BUTTON_ID)) return true;
    document.body.appendChild(buildWrapper());
    return true;
  }

  function tryInject() {
    if (!document.querySelector("c-lo-desktop-v2-new-unified-table, tr[data-task-id]")) {
      return false;
    }
    return injectButton();
  }

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      tryInject();
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  tryInject();
})();
