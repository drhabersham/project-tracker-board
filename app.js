const STORAGE_KEY = "simple-project-tracker-board-v1";
const SYNC_CONFIG = window.TRACKER_SYNC_CONFIG || { enabled: false };
const SYNC_POLL_INTERVAL_MS = SYNC_CONFIG.pollIntervalMs || 15000;

const COLUMNS = [
  { id: "todo", title: "To Do", kicker: "Queue" },
  { id: "doing", title: "In Progress", kicker: "Active" },
  { id: "done", title: "Done", kicker: "Wrapped" }
];

const defaultBoard = {
  tasks: [
    {
      id: crypto.randomUUID(),
      title: "Plan launch checklist",
      details: "Outline what needs to happen before the project goes live.",
      column: "todo",
      dueDate: getRelativeDate(2)
    },
    {
      id: crypto.randomUUID(),
      title: "Review current priorities",
      details: "Make sure the most important item is in progress this week.",
      column: "doing",
      dueDate: getRelativeDate(0)
    },
    {
      id: crypto.randomUUID(),
      title: "Create tracker",
      details: "A simple board is ready to start using.",
      column: "done",
      dueDate: getRelativeDate(-1)
    }
  ]
};

const boardElement = document.querySelector("#board");
const formElement = document.querySelector("#task-form");
const titleInput = document.querySelector("#task-title");
const detailsInput = document.querySelector("#task-details");
const columnInput = document.querySelector("#task-column");
const dateInput = document.querySelector("#task-date");
const resetButton = document.querySelector("#reset-button");
const copyLinkButton = document.querySelector("#copy-link-button");
const syncNowButton = document.querySelector("#sync-now-button");
const statusMessage = document.querySelector("#status-message");
const syncStatus = document.querySelector("#sync-status");
const columnTemplate = document.querySelector("#column-template");
const cardTemplate = document.querySelector("#card-template");

let state = loadState();
let draggedTaskId = null;
let syncTimer = null;
let syncInFlight = false;
let lastRemoteUpdatedAt = state.updatedAt || "";

render();
updateSyncStatus();
startSync();

formElement.addEventListener("submit", (event) => {
  event.preventDefault();

  const title = titleInput.value.trim();
  const details = detailsInput.value.trim();
  const column = columnInput.value;
  const dueDate = dateInput.value;

  if (!title) {
    return;
  }

  state.tasks.unshift({
    id: crypto.randomUUID(),
    title,
    details,
    column,
    dueDate
  });

  persistAndRender("Task added.");
  formElement.reset();
  titleInput.focus();
});

resetButton.addEventListener("click", () => {
  state = makeBoardState(structuredClone(defaultBoard).tasks);
  persistAndRender("Board reset to the starter layout.");
});

copyLinkButton.addEventListener("click", async () => {
  try {
    const shareUrl = createShareUrl();
    await navigator.clipboard.writeText(shareUrl);
    setStatus("Share link copied. Open it on another device to load this board.");
  } catch {
    setStatus("Could not copy automatically. Your browser may block clipboard access.");
  }
});

syncNowButton.addEventListener("click", async () => {
  if (!isSyncEnabled()) {
    updateSyncStatus("Sync not configured yet. Add your backend values in sync-config.js.");
    return;
  }

  await syncBoard({ reason: "manual" });
});

window.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && isSyncEnabled()) {
    syncBoard({ reason: "visible" });
  }
});

function render() {
  boardElement.innerHTML = "";

  for (const column of COLUMNS) {
    const fragment = columnTemplate.content.cloneNode(true);
    const section = fragment.querySelector(".column");
    const kicker = fragment.querySelector(".column-kicker");
    const heading = fragment.querySelector("h2");
    const taskCount = fragment.querySelector(".task-count");
    const dropzone = fragment.querySelector(".column-dropzone");

    section.dataset.column = column.id;
    kicker.textContent = column.kicker;
    heading.textContent = column.title;

    const tasks = state.tasks.filter((task) => task.column === column.id);
    taskCount.textContent = `${tasks.length}`;

    for (const task of tasks) {
      dropzone.appendChild(renderCard(task));
    }

    wireDropzone(dropzone, column.id);
    boardElement.appendChild(fragment);
  }
}

function renderCard(task) {
  const fragment = cardTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".task-card");
  const title = fragment.querySelector("h3");
  const details = fragment.querySelector(".task-details-input");
  const dateInput = fragment.querySelector(".task-date-input");
  const dateStatusPill = fragment.querySelector(".date-status-pill");
  const buttons = fragment.querySelectorAll(".icon-button");

  card.dataset.taskId = task.id;
  title.textContent = task.title;
  details.value = task.details || "";
  dateInput.value = task.dueDate || "";

  const dateState = getDateState(task);
  dateStatusPill.textContent = dateState.label;
  dateStatusPill.dataset.tone = dateState.tone;

  card.addEventListener("dragstart", () => {
    draggedTaskId = task.id;
  });

  card.addEventListener("dragend", () => {
    draggedTaskId = null;
    document
      .querySelectorAll(".column-dropzone")
      .forEach((zone) => zone.classList.remove("is-over"));
  });

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;

      if (action === "delete") {
        state.tasks = state.tasks.filter((entry) => entry.id !== task.id);
        persistAndRender("Task removed.");
        return;
      }

      if (action === "move-left" || action === "move-right") {
        const currentIndex = COLUMNS.findIndex((column) => column.id === task.column);
        const nextIndex = action === "move-left" ? currentIndex - 1 : currentIndex + 1;

        if (nextIndex < 0 || nextIndex >= COLUMNS.length) {
          return;
        }

        task.column = COLUMNS[nextIndex].id;
        persistAndRender("Task moved.");
      }
    });
  });

  dateInput.addEventListener("change", () => {
    task.dueDate = dateInput.value;
    persistAndRender("Task date updated.");
  });

  details.addEventListener("change", () => {
    task.details = details.value.trim();
    persistAndRender("Task description updated.");
  });

  return fragment;
}

function wireDropzone(dropzone, columnId) {
  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("is-over");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("is-over");
  });

  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-over");

    const task = state.tasks.find((entry) => entry.id === draggedTaskId);
    if (!task) {
      return;
    }

    task.column = columnId;
    persistAndRender("Task moved.");
  });
}

function persistAndRender(message) {
  saveState();
  render();
  setStatus(message);
  queueSync();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  history.replaceState(null, "", window.location.pathname);
}

function loadState() {
  const urlState = readStateFromUrl();
  if (urlState) {
    const normalized = normalizeState(urlState);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }

  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    return makeBoardState(structuredClone(defaultBoard).tasks);
  }

  try {
    return normalizeState(JSON.parse(saved));
  } catch {
    return makeBoardState(structuredClone(defaultBoard).tasks);
  }
}

function createShareUrl() {
  const payload = encodeURIComponent(btoa(JSON.stringify(state)));
  const url = new URL(window.location.href);
  url.hash = `board=${payload}`;
  return url.toString();
}

function readStateFromUrl() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const encoded = params.get("board");

  if (!encoded) {
    return null;
  }

  try {
    return JSON.parse(atob(decodeURIComponent(encoded)));
  } catch {
    setStatus("The shared board link could not be loaded.");
    return null;
  }
}

function setStatus(message) {
  statusMessage.textContent = message;
}

function normalizeState(candidate) {
  if (!candidate || !Array.isArray(candidate.tasks)) {
    return makeBoardState(structuredClone(defaultBoard).tasks);
  }

  return {
    tasks: candidate.tasks.map((task) => ({
      id: task.id || crypto.randomUUID(),
      title: task.title || "Untitled task",
      details: task.details || "",
      column: COLUMNS.some((column) => column.id === task.column) ? task.column : "todo",
      dueDate: isValidDate(task.dueDate) ? task.dueDate : ""
    })),
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date().toISOString()
  };
}

function getDateState(task) {
  if (task.column === "done") {
    return {
      label: task.dueDate ? `Done ${formatShortDate(task.dueDate)}` : "Done",
      tone: "done"
    };
  }

  if (!task.dueDate) {
    return { label: "No date", tone: "empty" };
  }

  const today = new Date();
  const taskDate = new Date(`${task.dueDate}T00:00:00`);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((taskDate - startOfToday) / 86400000);

  if (diffDays < 0) {
    return { label: `Overdue ${formatShortDate(task.dueDate)}`, tone: "overdue" };
  }

  if (diffDays === 0) {
    return { label: "Due today", tone: "today" };
  }

  return { label: formatUpcomingLabel(task.dueDate, diffDays), tone: "upcoming" };
}

function formatUpcomingLabel(dateValue, diffDays) {
  if (diffDays === 1) {
    return "Tomorrow";
  }

  if (diffDays < 7) {
    return `${diffDays} days left`;
  }

  return formatShortDate(dateValue);
}

function formatShortDate(dateValue) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(new Date(`${dateValue}T00:00:00`));
}

function isValidDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getRelativeDate(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function makeBoardState(tasks) {
  return {
    tasks,
    updatedAt: new Date().toISOString()
  };
}

function isSyncEnabled() {
  return Boolean(
    SYNC_CONFIG.enabled &&
      SYNC_CONFIG.supabaseUrl &&
      SYNC_CONFIG.supabaseAnonKey &&
      SYNC_CONFIG.boardId
  );
}

function queueSync() {
  state.updatedAt = new Date().toISOString();
  saveState();

  if (!isSyncEnabled()) {
    updateSyncStatus("Local mode only. Add backend settings in sync-config.js to enable auto sync.");
    return;
  }

  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    syncBoard({ reason: "auto" });
  }, 800);
}

function startSync() {
  if (!isSyncEnabled()) {
    updateSyncStatus("Local mode only. Add backend settings in sync-config.js to enable auto sync.");
    return;
  }

  updateSyncStatus("Sync is configured. Checking for the latest board...");
  syncBoard({ reason: "startup" });
  window.setInterval(() => {
    syncBoard({ reason: "poll" });
  }, SYNC_POLL_INTERVAL_MS);
}

async function syncBoard({ reason }) {
  if (!isSyncEnabled() || syncInFlight) {
    return;
  }

  syncInFlight = true;
  syncNowButton.disabled = true;
  updateSyncStatus(reason === "manual" ? "Syncing now..." : "Checking for updates...");

  try {
    const remoteRecord = await fetchRemoteBoard();

    if (!remoteRecord) {
      await pushRemoteBoard();
      lastRemoteUpdatedAt = state.updatedAt;
      updateSyncStatus(`Sync is on. Board uploaded ${formatSyncTime(new Date())}.`);
      return;
    }

    const remoteUpdatedAt = remoteRecord.updated_at || "";
    const remoteBoard = normalizeState(remoteRecord.board || {});

    if (remoteUpdatedAt > (state.updatedAt || "")) {
      state = remoteBoard;
      lastRemoteUpdatedAt = remoteUpdatedAt;
      saveState();
      render();
      updateSyncStatus(`Pulled newer changes ${formatSyncTime(new Date(remoteUpdatedAt))}.`);
      return;
    }

    if ((state.updatedAt || "") > remoteUpdatedAt || !boardsMatch(remoteBoard, state)) {
      await pushRemoteBoard();
      lastRemoteUpdatedAt = state.updatedAt;
      updateSyncStatus(`Changes synced ${formatSyncTime(new Date())}.`);
      return;
    }

    lastRemoteUpdatedAt = remoteUpdatedAt;
    updateSyncStatus(
      `Everything is synced${lastRemoteUpdatedAt ? ` as of ${formatSyncTime(new Date(lastRemoteUpdatedAt))}` : "."}`
    );
  } catch (error) {
    updateSyncStatus(`Sync issue: ${error.message}`);
  } finally {
    syncInFlight = false;
    syncNowButton.disabled = false;
  }
}

async function fetchRemoteBoard() {
  const url = new URL(`${SYNC_CONFIG.supabaseUrl}/rest/v1/${SYNC_CONFIG.table || "boards"}`);
  url.searchParams.set("id", `eq.${SYNC_CONFIG.boardId}`);
  url.searchParams.set("select", "id,board,updated_at");

  const response = await fetch(url, {
    headers: createSyncHeaders()
  });

  if (!response.ok) {
    throw new Error(`could not load remote board (${response.status})`);
  }

  const rows = await response.json();
  return rows[0] || null;
}

async function pushRemoteBoard() {
  const response = await fetch(`${SYNC_CONFIG.supabaseUrl}/rest/v1/${SYNC_CONFIG.table || "boards"}`, {
    method: "POST",
    headers: {
      ...createSyncHeaders(),
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify([
      {
        id: SYNC_CONFIG.boardId,
        board: state,
        updated_at: state.updatedAt
      }
    ])
  });

  if (!response.ok) {
    throw new Error(`could not save remote board (${response.status})`);
  }
}

function createSyncHeaders() {
  return {
    apikey: SYNC_CONFIG.supabaseAnonKey,
    Authorization: `Bearer ${SYNC_CONFIG.supabaseAnonKey}`
  };
}

function boardsMatch(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function updateSyncStatus(message) {
  syncStatus.textContent = message || syncStatus.textContent || "Local mode only.";
}

function formatSyncTime(date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}
