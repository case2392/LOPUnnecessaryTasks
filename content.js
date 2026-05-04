(() => {
  const BUTTON_ID = "lop-remove-unnecessary-tasks-btn";
  const STOP_ID = "lop-remove-stop-btn";
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

  const CLOSE_TASK_NOTE = "Task Completed. Ready to Close Task.";
  const REVIEW_SEND_TASK = "Review & send first call follow-up";

  let isRunning = false;
  let abortRequested = false;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitFor(predicate, { timeout = 8000, interval = 100 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (abortRequested) return null;
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

  function findCloseTaskModal() {
    for (const m of document.querySelectorAll("lightning-modal")) {
      const title = m.querySelector(".slds-modal__title");
      if (title && title.textContent.trim() === "Close Task") return m;
    }
    return null;
  }

  function findModalButtonByLabel(modal, label) {
    for (const b of modal.querySelectorAll("button")) {
      if (b.textContent.trim() === label) return b;
    }
    return null;
  }

  async function handleCloseTaskModal() {
    const modal = await waitFor(findCloseTaskModal, {
      timeout: 4000,
      interval: 150,
    });
    if (!modal) return true;

    const textarea = modal.querySelector("textarea");
    if (textarea) {
      textarea.focus();
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      ).set;
      setter.call(textarea, CLOSE_TASK_NOTE);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(200);

      const finishBtn = findModalButtonByLabel(modal, "Finish");
      if (!finishBtn) {
        console.warn("[LOP] Close Task modal: no Finish button");
        return false;
      }
      finishBtn.click();
    } else {
      const confirmBtn = findModalButtonByLabel(modal, "Confirm");
      if (!confirmBtn) {
        console.warn("[LOP] Close Task modal: no Confirm button");
        return false;
      }
      confirmBtn.click();
    }

    await waitFor(() => !findCloseTaskModal(), { timeout: 10000 });
    return true;
  }

  function findSendSmsReviewButton() {
    const sidebar = document.querySelector("c-lo-desktop-v2-sidebar");
    if (!sidebar) return null;
    for (const b of sidebar.querySelectorAll("button")) {
      if (b.textContent.trim() === "Send SMS and review email") return b;
    }
    return null;
  }

  function findSendSmsToggle() {
    const sidebar = document.querySelector("c-lo-desktop-v2-sidebar");
    if (!sidebar) return null;
    for (const lbl of sidebar.querySelectorAll("label")) {
      if ((lbl.textContent || "").includes("Send SMS as well")) {
        const input = lbl.querySelector('input[type="checkbox"]');
        if (input) return input;
      }
    }
    const faux = sidebar.querySelector(".slds-checkbox_faux_container");
    if (faux) {
      const lbl = faux.closest("label");
      if (lbl) return lbl.querySelector('input[type="checkbox"]');
    }
    return null;
  }

  function findEmailModalCloseButton() {
    return document.querySelector(
      'button.closeIcon[title="Cancel and close"], button.slds-modal__close[title="Cancel and close"]'
    );
  }

  async function waitForRowGone(taskId) {
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

  async function completeStandardTask(taskId, name) {
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

    const modalHandled = await handleCloseTaskModal();
    if (!modalHandled) {
      console.warn("[LOP] Close Task modal could not be handled", { taskId, name });
      return false;
    }

    return await waitForRowGone(taskId);
  }

  async function completeReviewSendTask(taskId, name) {
    const sendBtn = await waitFor(() => findSendSmsReviewButton(), {
      timeout: 12000,
    });
    if (!sendBtn) {
      console.warn("[LOP] Send SMS and review email button not found", {
        taskId,
        name,
      });
      return false;
    }

    const toggle = findSendSmsToggle();
    if (toggle && toggle.checked) {
      toggle.click();
      await sleep(250);
    }

    sendBtn.click();

    const closeBtn = await waitFor(() => findEmailModalCloseButton(), {
      timeout: 10000,
    });
    if (closeBtn) {
      closeBtn.click();
      await waitFor(() => !findEmailModalCloseButton(), { timeout: 5000 });
    } else {
      console.warn("[LOP] Email review modal close button not found; continuing", {
        taskId,
        name,
      });
    }

    return await waitForRowGone(taskId);
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

    if (name.trim() === REVIEW_SEND_TASK) {
      return await completeReviewSendTask(taskId, name);
    }
    return await completeStandardTask(taskId, name);
  }

  async function start() {
    if (isRunning) return;

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

    isRunning = true;
    abortRequested = false;
    setRunningState(true);

    let done = 0;
    let failed = 0;
    for (const task of tasks) {
      if (abortRequested) break;
      try {
        const success = await completeTask(task);
        if (success) done++;
        else failed++;
      } catch (e) {
        console.error("[LOP] error completing task", task, e);
        failed++;
      }
    }

    const tail = abortRequested ? "Stopped." : "Done.";
    setStatus(`${tail} Completed ${done}, failed ${failed}.`);
    isRunning = false;
    abortRequested = false;
    setRunningState(false);
  }

  function stop() {
    if (!isRunning) return;
    abortRequested = true;
    setStatus("Stopping after current task...");
  }

  function setRunningState(running) {
    const main = document.getElementById(BUTTON_ID);
    const stopBtn = document.getElementById(STOP_ID);
    if (main) main.disabled = running;
    if (stopBtn) stopBtn.style.display = running ? "" : "none";
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
    wrapper.className = "lop-remove-wrapper";

    const swallow = (e) => e.stopPropagation();
    wrapper.addEventListener("click", swallow);
    wrapper.addEventListener("mousedown", swallow);

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

    const stopBtn = document.createElement("button");
    stopBtn.id = STOP_ID;
    stopBtn.type = "button";
    stopBtn.className = "lop-stop-btn";
    stopBtn.textContent = "Stop";
    stopBtn.style.display = "none";
    stopBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      stop();
    });

    const status = document.createElement("span");
    status.id = STATUS_ID;
    status.className = "lop-remove-status";

    wrapper.appendChild(btn);
    wrapper.appendChild(stopBtn);
    wrapper.appendChild(status);
    return wrapper;
  }

  function findRefreshDataButton() {
    for (const b of document.querySelectorAll("button")) {
      if ((b.textContent || "").trim() === "Refresh Data") return b;
    }
    return null;
  }

  function injectButton() {
    const existing = document.getElementById(WRAPPER_ID);
    const refreshBtn = findRefreshDataButton();

    if (existing) {
      if (
        refreshBtn &&
        refreshBtn.parentElement &&
        existing.parentElement !== refreshBtn.parentElement
      ) {
        refreshBtn.parentElement.insertBefore(existing, refreshBtn);
      }
      return true;
    }

    const wrapper = buildWrapper();
    if (refreshBtn && refreshBtn.parentElement) {
      refreshBtn.parentElement.insertBefore(wrapper, refreshBtn);
    } else {
      wrapper.classList.add("lop-floating");
      document.body.appendChild(wrapper);
    }
    setRunningState(isRunning);
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
