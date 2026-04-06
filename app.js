const STORAGE_KEY = "simple-project-tracker-board-v1";
const VIEW_MODE_KEY = "simple-project-tracker-view-mode-v1";

const DEFAULT_COLUMNS = [
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
      dueDate: getRelativeDate(2),
      priority: "high",
      label: "sunset",
      subtasks: [
        { id: crypto.randomUUID(), text: "List launch tasks", completed: true },
        { id: crypto.randomUUID(), text: "Confirm owners", completed: false }
      ]
    },
    {
      id: crypto.randomUUID(),
      title: "Review current priorities",
      details: "Make sure the most important item is in progress this week.",
      column: "doing",
      dueDate: getRelativeDate(0),
      priority: "medium",
      label: "ocean",
      subtasks: [
        { id: crypto.randomUUID(), text: "Review deadlines", completed: false }
      ]
    },
    {
      id: crypto.randomUUID(),
      title: "Create tracker",
      details: "A simple board is ready to start using.",
      column: "done",
      dueDate: getRelativeDate(-1),
      priority: "low",
      label: "moss",
      subtasks: []
    }
  ],
  columns: DEFAULT_COLUMNS
};

const boardElement = document.querySelector("#board");
const formElement = document.querySelector("#task-form");
const titleInput = document.querySelector("#task-title");
const detailsInput = document.querySelector("#task-details");
const columnInput = document.querySelector("#task-column");
const dateInput = document.querySelector("#task-date");
const priorityInput = document.querySelector("#task-priority");
const taskLabelInput = document.querySelector("#task-label");
const searchInput = document.querySelector("#search-input");
const priorityFilter = document.querySelector("#priority-filter");
const labelFilter = document.querySelector("#label-filter");
const clearFiltersButton = document.querySelector("#clear-filters-button");
const viewModeSelect = document.querySelector("#view-mode-select");
const resetButton = document.querySelector("#reset-button");
const copyLinkButton = document.querySelector("#copy-link-button");
const exportButton = document.querySelector("#export-button");
const importInput = document.querySelector("#import-input");
const statusMessage = document.querySelector("#status-message");
const updatedAtElement = document.querySelector("#updated-at");
const columnTemplate = document.querySelector("#column-template");
const cardTemplate = document.querySelector("#card-template");
const subtaskTemplate = document.querySelector("#subtask-template");

let state = loadState();
let draggedTaskId = null;
let viewMode = loadViewMode();

render();
renderUpdatedAt();
viewModeSelect.value = viewMode;

formElement.addEventListener("submit", (event) => {
  event.preventDefault();

  const title = titleInput.value.trim();
  const details = detailsInput.value.trim();
  const column = columnInput.value;
  const dueDate = dateInput.value;
  const priority = priorityInput.value;

  if (!title) {
    return;
  }

  state.tasks.unshift({
    id: crypto.randomUUID(),
    title,
    details,
    column,
    dueDate,
    priority,
    label: taskLabelInput.value,
    subtasks: []
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

exportButton.addEventListener("click", () => {
  const fileContents = JSON.stringify(state, null, 2);
  const blob = new Blob([fileContents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `project-tracker-board-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();

  URL.revokeObjectURL(url);
  setStatus("Board exported. Import that file on another device to restore everything.");
});

importInput.addEventListener("change", async (event) => {
  const [file] = event.target.files || [];

  if (!file) {
    return;
  }

  try {
    const fileContents = await file.text();
    const importedState = normalizeState(JSON.parse(fileContents));
    state = importedState;
    saveState();
    render();
    renderUpdatedAt();
    setStatus("Board imported.");
  } catch {
    setStatus("That file could not be imported.");
  } finally {
    importInput.value = "";
  }
});

searchInput.addEventListener("input", () => {
  render();
});

priorityFilter.addEventListener("change", () => {
  render();
});

labelFilter.addEventListener("change", () => {
  render();
});

clearFiltersButton.addEventListener("click", () => {
  searchInput.value = "";
  priorityFilter.value = "all";
  labelFilter.value = "all";
  render();
});

viewModeSelect.addEventListener("change", () => {
  viewMode = viewModeSelect.value;
  localStorage.setItem(VIEW_MODE_KEY, viewMode);
  render();
});

function render() {
  boardElement.innerHTML = "";
  boardElement.dataset.viewMode = viewMode;
  const filters = getActiveFilters();

  for (const column of state.columns) {
    const fragment = columnTemplate.content.cloneNode(true);
    const section = fragment.querySelector(".column");
    const kicker = fragment.querySelector(".column-kicker");
    const headingInput = fragment.querySelector(".column-title-input");
    const taskCount = fragment.querySelector(".task-count");
    const dropzone = fragment.querySelector(".column-dropzone");
    const emptyMessage = fragment.querySelector(".empty-column-message");

    section.dataset.column = column.id;
    kicker.textContent = column.kicker;
    headingInput.value = column.title;
    headingInput.addEventListener("change", () => {
      column.title = headingInput.value.trim() || "Untitled";
      persistAndRender("Column renamed.");
    });

    const tasks = state.tasks.filter(
      (task) => task.column === column.id && taskMatchesFilters(task, filters)
    );
    taskCount.textContent = `${tasks.length}`;

    for (const task of tasks) {
      dropzone.appendChild(renderCard(task));
    }

    emptyMessage.textContent = tasks.length
      ? ""
      : filters.hasFilters
        ? "No matching tasks in this column."
        : "Nothing here yet. Add a task to get started.";

    wireDropzone(dropzone, column.id);
    boardElement.appendChild(fragment);
  }
}

function renderCard(task) {
  const fragment = cardTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".task-card");
  const titleInput = fragment.querySelector(".task-title-input");
  const details = fragment.querySelector(".task-details-input");
  const dateInput = fragment.querySelector(".task-date-input");
  const priorityInput = fragment.querySelector(".task-priority-input");
  const labelInput = fragment.querySelector(".task-label-input");
  const labelChip = fragment.querySelector(".task-label-chip");
  const dateStatusPill = fragment.querySelector(".date-status-pill");
  const subtasksList = fragment.querySelector(".subtasks-list");
  const subtasksCount = fragment.querySelector(".subtasks-count");
  const subtaskInput = fragment.querySelector(".subtask-input");
  const subtaskAddButton = fragment.querySelector(".subtask-add-button");
  const buttons = fragment.querySelectorAll(".icon-button");

  card.dataset.taskId = task.id;
  titleInput.value = task.title;
  details.value = task.details || "";
  dateInput.value = task.dueDate || "";
  priorityInput.value = task.priority || "medium";
  priorityInput.dataset.priority = priorityInput.value;
  labelInput.value = task.label || "";
  renderLabelChip(task.label || "", labelChip);

  const dateState = getDateState(task);
  dateStatusPill.textContent = dateState.label;
  dateStatusPill.dataset.tone = dateState.tone;
  renderSubtasks(task, subtasksList, subtasksCount);

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
        const currentIndex = state.columns.findIndex((column) => column.id === task.column);
        const nextIndex = action === "move-left" ? currentIndex - 1 : currentIndex + 1;

        if (nextIndex < 0 || nextIndex >= state.columns.length) {
          return;
        }

        task.column = state.columns[nextIndex].id;
        persistAndRender("Task moved.");
      }
    });
  });

  dateInput.addEventListener("change", () => {
    task.dueDate = dateInput.value;
    persistAndRender("Task date updated.");
  });

  titleInput.addEventListener("change", () => {
    task.title = titleInput.value.trim() || "Untitled task";
    persistAndRender("Task title updated.");
  });

  priorityInput.addEventListener("change", () => {
    task.priority = priorityInput.value;
    priorityInput.dataset.priority = priorityInput.value;
    persistAndRender("Task priority updated.");
  });

  labelInput.addEventListener("change", () => {
    task.label = labelInput.value;
    renderLabelChip(task.label, labelChip);
    persistAndRender("Task label updated.");
  });

  details.addEventListener("change", () => {
    task.details = details.value.trim();
    persistAndRender("Task description updated.");
  });

  subtaskAddButton.addEventListener("click", () => {
    const text = subtaskInput.value.trim();

    if (!text) {
      return;
    }

    task.subtasks.push({
      id: crypto.randomUUID(),
      text,
      completed: false
    });

    persistAndRender("Checklist item added.");
  });

  subtaskInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      subtaskAddButton.click();
    }
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
  state.updatedAt = new Date().toISOString();
  saveState();
  render();
  renderUpdatedAt();
  setStatus(message);
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

function renderUpdatedAt() {
  updatedAtElement.textContent = `Last updated ${formatUpdatedAt(state.updatedAt)}`;
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
      dueDate: isValidDate(task.dueDate) ? task.dueDate : "",
      priority: isValidPriority(task.priority) ? task.priority : "medium",
      subtasks: normalizeSubtasks(task.subtasks)
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

function getActiveFilters() {
  const query = searchInput.value.trim().toLowerCase();
  const priority = priorityFilter.value;

  return {
    query,
    priority,
    hasFilters: Boolean(query || priority !== "all")
  };
}

function taskMatchesFilters(task, filters) {
  const matchesPriority = filters.priority === "all" || task.priority === filters.priority;
  const haystack = `${task.title} ${task.details}`.toLowerCase();
  const matchesQuery = !filters.query || haystack.includes(filters.query);
  return matchesPriority && matchesQuery;
}

function isValidPriority(value) {
  return value === "high" || value === "medium" || value === "low";
}

function formatUpdatedAt(value) {
  if (!value) {
    return "just now";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function makeBoardState(tasks) {
  return {
    tasks,
    updatedAt: new Date().toISOString()
  };
}

function renderSubtasks(task, container, counter) {
  container.innerHTML = "";
  const subtasks = normalizeSubtasks(task.subtasks);
  task.subtasks = subtasks;
  const completedCount = subtasks.filter((subtask) => subtask.completed).length;
  counter.textContent = subtasks.length ? `${completedCount}/${subtasks.length}` : "0/0";

  for (const subtask of subtasks) {
    const fragment = subtaskTemplate.content.cloneNode(true);
    const item = fragment.querySelector(".subtask-item");
    const checkbox = fragment.querySelector(".subtask-checkbox");
    const text = fragment.querySelector(".subtask-text");
    const deleteButton = fragment.querySelector(".subtask-delete-button");

    item.dataset.complete = String(subtask.completed);
    checkbox.checked = subtask.completed;
    text.textContent = subtask.text;

    checkbox.addEventListener("change", () => {
      subtask.completed = checkbox.checked;
      persistAndRender("Checklist updated.");
    });

    deleteButton.addEventListener("click", () => {
      task.subtasks = task.subtasks.filter((entry) => entry.id !== subtask.id);
      persistAndRender("Checklist item removed.");
    });

    container.appendChild(fragment);
  }
}

function normalizeSubtasks(candidate) {
  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate
    .filter((item) => item && typeof item.text === "string")
    .map((item) => ({
      id: item.id || crypto.randomUUID(),
      text: item.text.trim(),
      completed: Boolean(item.completed)
    }))
    .filter((item) => item.text);
}

function loadViewMode() {
  const saved = localStorage.getItem(VIEW_MODE_KEY);
  return saved === "list" ? "list" : "board";
}
