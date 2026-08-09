const muscles = ["Chest", "Back", "Legs", "Shoulders", "Arms", "Core"];
const equipmentOptions = ["Dumbbells", "Barbell", "Cables", "Machines", "Bodyweight", "Kettlebells"];
const RECOVERY_WINDOW_MS = 48 * 60 * 60 * 1000;
const BALANCE_HISTORY_LIMIT = 10;
const EXERCISE_FRESHNESS_HISTORY_LIMIT = 5;
const RECENT_EXERCISE_CHANCE = 0.35;
const SECONDARY_BALANCE_CREDIT = 0.35;
const defaultProfile = {
  priorities: { Arms: 6, Back: 5, Chest: 4, Core: 3, Legs: 2, Shoulders: 1 },
  priorityOrder: ["Arms", "Back", "Chest", "Core", "Legs", "Shoulders"],
  duration: 45,
  equipment: [...equipmentOptions]
};

let state = loadState();
let activeView = "today";
let pendingSwapId = null;
let visibleHistoryMonths = 3;
let exerciseStatusFilter = "all";
let exerciseSearchQuery = "";
let editingCustomExerciseId = null;
let selectedCustomExerciseId = null;
let restTimer = null;
let restTimerInterval = null;
let restTimerDoneTimer = null;
let restTimerHold = null;
let suppressRestTimerClick = false;

const REST_TIMER_HOLD_MS = 500;

const title = document.querySelector("#screen-title");
const pageResetButton = document.querySelector("#page-reset-button");
const views = document.querySelectorAll(".view");
const tabs = document.querySelectorAll(".tab");
const routinePanel = document.querySelector("#routine-panel");
const todayView = document.querySelector("#view-today");
const priorityList = document.querySelector("#priority-list");
const equipmentList = document.querySelector("#equipment-list");
const profileSummary = document.querySelector("#profile-summary");
const todayHeading = document.querySelector("#today-heading");
const generateButton = document.querySelector("#generate-button");
const customDurationRow = document.querySelector("#custom-duration-row");
const customDurationInput = document.querySelector("#custom-duration-input");
const exerciseSearchInput = document.querySelector("#exercise-search-input");
const exerciseStatusFilterInput = document.querySelector("#exercise-status-filter");
const exerciseLibraryList = document.querySelector("#exercise-library");
const exerciseFormBackdrop = document.querySelector("#exercise-form-backdrop");
const exerciseFormTitle = document.querySelector("#exercise-form-title");
const exerciseForm = document.querySelector("#exercise-form");
const customExerciseName = document.querySelector("#custom-exercise-name");
const customExerciseMuscle = document.querySelector("#custom-exercise-muscle");
const customExerciseEquipment = document.querySelector("#custom-exercise-equipment");
const exerciseActionsBackdrop = document.querySelector("#exercise-actions-backdrop");
const exerciseActionsDetail = document.querySelector("#exercise-actions-detail");
const deleteExerciseBackdrop = document.querySelector("#delete-exercise-backdrop");
const deleteExerciseDetail = document.querySelector("#delete-exercise-detail");
const exercisePageActionsBackdrop = document.querySelector("#exercise-page-actions-backdrop");
const historyPageActionsBackdrop = document.querySelector("#history-page-actions-backdrop");
const pageResetBackdrop = document.querySelector("#page-reset-backdrop");
const pageResetTitle = document.querySelector("#page-reset-title");
const pageResetMessage = document.querySelector("#page-reset-message");
const keepPageSettingsButton = document.querySelector("#keep-page-settings-button");
const confirmPageResetButton = document.querySelector("#confirm-page-reset-button");
const centerNotice = document.querySelector("#center-notice");
const centerNoticeTitle = document.querySelector("#center-notice-title");
const centerNoticeMessage = document.querySelector("#center-notice-message");
const swapBackdrop = document.querySelector("#swap-backdrop");
const swapDetail = document.querySelector("#swap-detail");
const cancelWorkoutBackdrop = document.querySelector("#cancel-workout-backdrop");
const toast = document.querySelector("#toast");

function loadState() {
  const saved = localStorage.getItem("liftmix-state");
  if (!saved) {
    return normalizeState({ profile: defaultProfile, excluded: [], history: [], workout: null, customExercises: [] });
  }

  try {
    return normalizeState({ profile: defaultProfile, excluded: [], history: [], workout: null, customExercises: [], ...JSON.parse(saved) });
  } catch {
    return normalizeState({ profile: defaultProfile, excluded: [], history: [], workout: null, customExercises: [] });
  }
}

function normalizeState(nextState) {
  const profile = { ...defaultProfile, ...(nextState.profile || {}) };
  profile.duration = normalizeDuration(profile.duration);
  profile.priorityOrder = getPriorityOrder(profile);
  profile.priorities = prioritiesFromOrder(profile.priorityOrder);
  const customExercises = Array.isArray(nextState.customExercises) ? nextState.customExercises : [];
  const exerciseNotes = nextState.exerciseNotes && typeof nextState.exerciseNotes === "object"
    ? nextState.exerciseNotes
    : {};
  const workout = nextState.workout
    ? {
        ...nextState.workout,
        swappedOutIds: Array.isArray(nextState.workout.swappedOutIds)
          ? nextState.workout.swappedOutIds
          : []
      }
    : null;
  return { ...nextState, profile, customExercises, exerciseNotes, workout };
}

function getExerciseLibrary() {
  return [...builtInExerciseLibrary, ...state.customExercises];
}

function saveState() {
  localStorage.setItem("liftmix-state", JSON.stringify(state));
  renderAll();
}

function persistState() {
  localStorage.setItem("liftmix-state", JSON.stringify(state));
}

function renderAll() {
  renderProfileSummary();
  renderTodayHero();
  renderSettings();
  renderWorkout();
  renderExercises();
  renderHistory();
}

function renderTodayHero() {
  if (!generateButton || !todayHeading) return;
  const hasWorkout = Boolean(state.workout);
  todayHeading.textContent = hasWorkout ? "Workout in progress" : "Ready when you are.";
  generateButton.hidden = hasWorkout;
  renderTopAction();
}

function setView(viewName) {
  activeView = viewName;
  const labels = { today: formatTodayTitle(), settings: "Profile", excluded: "Exercises", history: "History" };
  title.textContent = labels[viewName];
  renderTopAction();
  views.forEach((view) => view.classList.toggle("is-active", view.id === `view-${viewName}`));
  tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === viewName));
}

function renderTopAction() {
  const isActiveWorkout = activeView === "today" && Boolean(state.workout);
  pageResetButton.hidden = activeView === "today" && !isActiveWorkout;
  const label = isActiveWorkout ? "Cancel Workout" : resetButtonLabel(activeView);
  pageResetButton.setAttribute("aria-label", label);
  pageResetButton.title = label;
}

function resetButtonLabel(viewName) {
  if (viewName === "settings") return "Reset Profile";
  if (viewName === "excluded") return "Reset Exercises";
  if (viewName === "history") return "Clear History";
  return "Reset";
}

function formatTodayTitle() {
  const date = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `Today, ${date}`;
}

function renderProfileSummary(profile = state.profile) {
  const topPriorities = getPriorityOrder(profile).slice(0, 2).join(" + ");
  profileSummary.textContent = `${profile.duration} min · ${topPriorities}`;
}

function renderSettings() {
  priorityList.innerHTML = getPriorityOrder(state.profile).map((muscle, index) => `
    <div class="priority-item" data-priority-muscle="${muscle}">
      <span class="priority-rank">${index + 1}</span>
      <span class="priority-name">${muscle}</span>
      <button class="priority-drag" type="button" aria-label="Drag ${muscle} priority" title="Drag">
        <span class="priority-handle-icon" aria-hidden="true"></span>
      </button>
    </div>
  `).join("");

  equipmentList.innerHTML = equipmentOptions.map((item) => `
    <label class="check-tile">
      <input type="checkbox" name="equipment" value="${item}" ${state.profile.equipment.includes(item) ? "checked" : ""} />
      <span>${item}</span>
    </label>
  `).join("");

  document.querySelectorAll("input[name='duration']").forEach((input) => {
    input.checked = durationSelectionValue() === input.value;
  });
  customDurationInput.value = presetDurations().includes(Number(state.profile.duration)) ? 40 : state.profile.duration;
  renderCustomDuration();
  updatePriorityRanks();
}

function presetDurations() {
  return [30, 45, 60];
}

function durationSelectionValue() {
  return presetDurations().includes(Number(state.profile.duration)) ? String(state.profile.duration) : "custom";
}

function selectedDurationFromForm(data) {
  if (data.get("duration") !== "custom") return normalizeDuration(data.get("duration"));
  return normalizeDuration(data.get("customDuration"), 40);
}

function normalizeDuration(value, fallback = defaultProfile.duration) {
  const duration = Math.round(Number(value));
  return Math.min(120, Math.max(5, Number.isFinite(duration) && duration > 0 ? duration : fallback));
}

function renderCustomDuration() {
  const customSelected = document.querySelector("input[name='duration'][value='custom']")?.checked;
  customDurationRow.classList.toggle("is-visible", Boolean(customSelected));
}

function currentProfileFromControls() {
  const form = document.querySelector("#settings-form");
  if (!form) return state.profile;
  const data = new FormData(form);
  const priorityOrder = [...priorityList.querySelectorAll("[data-priority-muscle]")]
    .map((item) => item.dataset.priorityMuscle);
  return {
    ...state.profile,
    priorities: prioritiesFromOrder(priorityOrder),
    priorityOrder,
    duration: selectedDurationFromForm(data)
  };
}

function renderProfileSummaryFromControls() {
  renderProfileSummary(currentProfileFromControls());
}

function getPriorityOrder(profile = state.profile) {
  const savedOrder = Array.isArray(profile.priorityOrder) ? profile.priorityOrder : [];
  const fromPriorities = [...muscles].sort((a, b) => (profile.priorities?.[b] ?? 0) - (profile.priorities?.[a] ?? 0));
  const order = [...savedOrder, ...fromPriorities, ...muscles].filter((muscle, index, list) => {
    return muscles.includes(muscle) && list.indexOf(muscle) === index;
  });
  return order.slice(0, muscles.length);
}

function prioritiesFromOrder(order) {
  return order.reduce((priorities, muscle, index) => {
    priorities[muscle] = muscles.length - index;
    return priorities;
  }, {});
}

function updatePriorityRanks() {
  document.querySelectorAll("[data-priority-muscle]").forEach((item, index) => {
    item.querySelector(".priority-rank").textContent = index + 1;
  });
}

function renderWorkout() {
  todayView.classList.toggle("is-empty", !state.workout);
  if (!state.workout) {
    routinePanel.innerHTML = `
      <div class="empty-state">
        <div class="mini-plate" aria-hidden="true"></div>
        <h3>No workout generated yet</h3>
        <p>Your saved settings stay ready.<br />Tap Generate Workout when<br />you get to the gym.</p>
      </div>
    `;
    return;
  }

  const cards = state.workout.exercises.map((exercise, index) => `
    <article class="exercise-card">
      <button class="exercise-index ${exercise.completed ? "is-complete" : ""}" data-complete="${exercise.id}" aria-label="${exercise.completed ? "Mark incomplete" : "Mark complete"}: ${exercise.name}">
        ${exercise.completed ? "✓" : index + 1}
      </button>
      <div class="exercise-main">
        <h3>${exercise.name}</h3>
        <p>${exercise.note}</p>
        <div class="last-performance">${formatLastPerformance(exercise)}</div>
        <div class="exercise-meta">
          <span class="pill">${exercise.muscle}</span>
          <span class="pill">${formatRepTarget(exercise)}</span>
        </div>
        ${renderRestTimerButton(exercise)}
      </div>
      <button class="swap-button" data-swap="${exercise.id}" aria-label="Swap ${exercise.name}" title="Swap Exercise">
        <span class="swap-arrows" aria-hidden="true"><span>→</span><span>←</span></span>
      </button>
      <div class="set-log" aria-label="Log sets for ${exercise.name}">
        ${renderExerciseNote(exercise, "log")}
        ${renderSetRows(exercise)}
      </div>
    </article>
  `).join("");

  routinePanel.innerHTML = `
    <div class="summary-strip">
      <div class="summary-tile"><span>Time</span><strong>${state.workout.duration}</strong></div>
      <div class="summary-tile"><span>Focus</span><strong>${state.workout.focus}</strong></div>
      <div class="summary-tile"><span>Moves</span><strong>${state.workout.exercises.length}</strong></div>
    </div>
    ${cards}
    <button class="primary-action full finish-button" id="finish-button">Finish Workout</button>
  `;
}

function formatRepTarget(exercise) {
  return exercise.logging === "duration" ? exercise.reps : `${exercise.reps} reps`;
}

function renderExerciseNote(exercise, location = "workout") {
  const note = getExerciseNote(exercise.id);
  if (location === "log") {
    return `
      <div class="set-row note-row">
        <div class="set-label">Notes</div>
        <label class="note-log-field">
          <textarea
            data-exercise-note="${exercise.id}"
            maxlength="140"
            enterkeyhint="done"
            aria-label="Notes for ${escapeHtml(exercise.name)}"
            placeholder="Tap to write"
          >${escapeHtml(note)}</textarea>
        </label>
      </div>
    `;
  }

  return `
    <label class="exercise-note ${location === "library" ? "is-library-note" : ""}">
      <span>Notes</span>
      <textarea
        data-exercise-note="${exercise.id}"
        maxlength="140"
        enterkeyhint="done"
        aria-label="Notes for ${escapeHtml(exercise.name)}"
        placeholder="Tap to write"
      >${escapeHtml(note)}</textarea>
    </label>
  `;
}

function getExerciseNote(exerciseId) {
  return state.exerciseNotes?.[exerciseId] || "";
}

function normalizeExerciseNote(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .split("\n")
    .slice(0, 3)
    .join("\n")
    .slice(0, 140);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderSetRows(exercise) {
  ensureExerciseLog(exercise);
  const fields = logFieldsForExercise(exercise);
  return exercise.log.map((set, index) => `
    <div class="set-row ${fields.length === 1 ? "is-single-field" : ""}">
      <div class="set-label">Set ${index + 1}</div>
      ${fields.map((field) => `
        <label class="log-field">
          <span>${field.label}</span>
          <input data-log="${exercise.id}" data-set="${index}" data-field="${field.key}" inputmode="${field.inputmode}" type="number" min="0" placeholder="${field.placeholder}" value="${set[field.key] ?? ""}" />
        </label>
      `).join("")}
      <button class="set-done-button ${set.done ? "is-complete" : ""}" data-set-done="${exercise.id}" data-set="${index}" aria-label="Mark set ${index + 1} complete">✓</button>
    </div>
  `).join("");
}

function logFieldsForExercise(exercise) {
  const logging = exercise.logging || "weight";
  if (logging === "reps") {
    return [{ key: "reps", label: "Reps", placeholder: "reps", inputmode: "numeric" }];
  }
  if (logging === "duration") {
    return [{ key: "duration", label: "Time", placeholder: "sec", inputmode: "numeric" }];
  }
  if (logging === "assistance") {
    return [
      { key: "assistance", label: "Assistance", placeholder: "lb", inputmode: "decimal" },
      { key: "reps", label: "Reps", placeholder: "reps", inputmode: "numeric" }
    ];
  }
  return [
    { key: "weight", label: "Weight", placeholder: "lb", inputmode: "decimal" },
    { key: "reps", label: "Reps", placeholder: "reps", inputmode: "numeric" }
  ];
}

function hasLoggedValues(set, exercise) {
  return logFieldsForExercise(exercise).some((field) => set[field.key] !== "" && set[field.key] != null);
}

function hasCompleteLog(set, exercise) {
  return logFieldsForExercise(exercise).every((field) => set[field.key] !== "" && set[field.key] != null);
}

function formatRestTime(seconds) {
  if (seconds <= 60) return `${seconds}s rest`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s rest` : `${minutes}m rest`;
}

function renderRestTimerButton(exercise) {
  const view = restTimerViewFor(exercise.id, exercise.rest);
  return `
    <div class="rest-timer-row">
      <button
        class="${view.className}"
        data-rest-timer="${exercise.id}"
        data-rest-seconds="${exercise.rest}"
        type="button"
        aria-label="${view.ariaLabel}"
      >${view.label}</button>
    </div>
  `;
}

function restTimerViewFor(exerciseId, restSeconds) {
  const baseClass = "pill rest-timer-pill";
  if (!restTimer || restTimer.exerciseId !== exerciseId) {
    return {
      label: formatRestTime(restSeconds),
      className: baseClass,
      ariaLabel: `Start ${formatRestTime(restSeconds)}`
    };
  }

  if (restTimer.status === "canceled") {
    return {
      label: "Canceled",
      className: `${baseClass} is-canceled`,
      ariaLabel: "Rest timer canceled"
    };
  }

  if (restTimer.status === "done") {
    return {
      label: "Rest done",
      className: `${baseClass} is-done`,
      ariaLabel: "Rest done"
    };
  }

  const seconds = restTimerRemaining();
  if (restTimer.status === "paused") {
    return {
      label: `Paused · ${formatCountdown(seconds)}`,
      className: `${baseClass} is-paused`,
      ariaLabel: `Resume rest timer, ${formatCountdown(seconds)} remaining`
    };
  }

  return {
    label: formatCountdown(seconds),
    className: `${baseClass} is-running ${seconds <= 3 ? "is-warning" : ""}`,
    ariaLabel: `Pause rest timer, ${formatCountdown(seconds)} remaining`
  };
}

function formatCountdown(seconds) {
  const remaining = Math.max(0, Math.ceil(Number(seconds) || 0));
  const minutes = Math.floor(remaining / 60);
  const remainder = String(remaining % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function restTimerRemaining() {
  if (!restTimer) return 0;
  if (["paused", "done", "canceled"].includes(restTimer.status)) return restTimer.remainingSeconds;
  return Math.max(0, Math.ceil((restTimer.endsAt - Date.now()) / 1000));
}

function toggleRestTimer(exerciseId, restSeconds) {
  if (!restSeconds) return;
  if (!restTimer || restTimer.exerciseId !== exerciseId || restTimer.status === "done") {
    startRestTimer(exerciseId, restSeconds);
    return;
  }
  if (restTimer.status === "running") {
    pauseRestTimer();
    return;
  }
  resumeRestTimer();
}

function startRestTimer(exerciseId, restSeconds) {
  clearRestTimer(false);
  const seconds = Math.max(1, Number(restSeconds) || 0);
  restTimer = {
    exerciseId,
    totalSeconds: seconds,
    remainingSeconds: seconds,
    endsAt: Date.now() + seconds * 1000,
    status: "running"
  };
  startRestTimerInterval();
  updateRestTimerButtons();
}

function pauseRestTimer() {
  if (!restTimer) return;
  restTimer.remainingSeconds = restTimerRemaining();
  restTimer.status = "paused";
  stopRestTimerInterval();
  updateRestTimerButtons();
}

function resumeRestTimer() {
  if (!restTimer) return;
  restTimer.status = "running";
  restTimer.endsAt = Date.now() + restTimer.remainingSeconds * 1000;
  startRestTimerInterval();
  updateRestTimerButtons();
}

function startRestTimerInterval() {
  stopRestTimerInterval();
  restTimerInterval = setInterval(tickRestTimer, 250);
}

function stopRestTimerInterval() {
  if (restTimerInterval) clearInterval(restTimerInterval);
  restTimerInterval = null;
}

function tickRestTimer() {
  if (!restTimer || restTimer.status !== "running") return;
  const remaining = restTimerRemaining();
  restTimer.remainingSeconds = remaining;
  updateRestTimerButtons();
  if (remaining > 0) return;
  restTimer.status = "done";
  stopRestTimerInterval();
  showCenterNotice("Rest done", "Time for the next set.");
  clearTimeout(restTimerDoneTimer);
  restTimerDoneTimer = setTimeout(() => clearRestTimer(), 1800);
  updateRestTimerButtons();
}

function clearRestTimer(updateButtons = true) {
  stopRestTimerInterval();
  clearTimeout(restTimerDoneTimer);
  restTimerDoneTimer = null;
  restTimer = null;
  if (updateButtons) updateRestTimerButtons();
}

function cancelRestTimer() {
  if (!restTimer) return;
  stopRestTimerInterval();
  restTimer.remainingSeconds = 0;
  restTimer.status = "canceled";
  clearTimeout(restTimerDoneTimer);
  restTimerDoneTimer = setTimeout(() => clearRestTimer(), 900);
  updateRestTimerButtons();
}

function updateRestTimerButtons() {
  document.querySelectorAll("[data-rest-timer]").forEach((button) => {
    const view = restTimerViewFor(button.dataset.restTimer, Number(button.dataset.restSeconds));
    button.className = view.className;
    button.textContent = view.label;
    button.setAttribute("aria-label", view.ariaLabel);
  });
}

function renderExercises() {
  const filtered = getExerciseLibrary().filter((exercise) => {
    const hidden = state.excluded.includes(exercise.id);
    const searchText = `${exercise.name} ${exercise.equipment} ${exercise.muscle}`.toLowerCase();
    const searchMatches = !exerciseSearchQuery || searchText.includes(exerciseSearchQuery);
    const statusMatches = exerciseStatusFilter === "all"
      || (exerciseStatusFilter === "hidden" && hidden)
      || (exerciseStatusFilter === "active" && !hidden);
    return searchMatches && statusMatches;
  });

  exerciseSearchInput.value = exerciseSearchQuery;
  exerciseStatusFilterInput.value = exerciseStatusFilter;

  if (!filtered.length) {
    exerciseLibraryList.innerHTML = `
      <div class="empty-state compact">
        <h3>No matching exercises</h3>
        <p>Try changing one of the filters.</p>
      </div>
    `;
    return;
  }

  exerciseLibraryList.innerHTML = [...muscles].sort((a, b) => a.localeCompare(b)).map((muscle) => {
    const exercises = filtered
      .filter((exercise) => exercise.muscle === muscle)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!exercises.length) return "";
    return `
      <section class="exercise-group">
        <h3>${muscle}</h3>
        <div class="exercise-group-list">
          ${exercises.map((exercise) => {
            const active = !state.excluded.includes(exercise.id);
            return `
              <div class="exercise-library-row">
                <div class="exercise-library-info">
                  <strong>${exercise.name}</strong>
                  <p>${exercise.equipment}${exercise.custom ? ' · <span class="custom-badge">Custom</span>' : ""}</p>
                </div>
                <div class="exercise-row-actions">
                  ${exercise.custom ? `<button class="custom-exercise-menu" data-custom-menu="${exercise.id}" aria-label="Manage ${exercise.name}" title="Manage exercise">•••</button>` : ""}
                  <label class="status-toggle">
                    <span>${active ? "Active" : "Hidden"}</span>
                    <input type="checkbox" data-exercise-active="${exercise.id}" ${active ? "checked" : ""} />
                    <i aria-hidden="true"></i>
                  </label>
                </div>
                ${renderExerciseNote(exercise, "library")}
              </div>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }).join("");
}

function renderHistory() {
  const list = document.querySelector("#history-list");
  if (!state.history.length) {
    list.innerHTML = `<div class="empty-state"><h3>No logged workouts</h3><p>Log a generated workout and it will appear here.</p></div>`;
    return;
  }

  const visibleHistory = visibleHistoryEntries();
  if (!visibleHistory.length) {
    list.innerHTML = `
      <div class="empty-state">
        <h3>No recent workouts</h3>
        <p>Older entries are still saved.</p>
      </div>
      <button class="secondary-action full history-more-button" data-view-older>View Older</button>
    `;
    return;
  }

  const rows = visibleHistory.map(({ item, index }) => `
    <div class="swipe-row" data-history-row="${index}">
      <button class="delete-history-button" data-delete-history="${index}">Delete</button>
      <div class="list-row history-row" data-swipe-content>
        <div class="history-summary">
          <strong>${item.date}</strong>
          <p>${item.focus} · ${item.exerciseNames.join(", ")}</p>
        </div>
        <div class="history-detail">
          ${formatHistoryExercises(item)}
        </div>
      </div>
    </div>
  `).join("");
  const moreButton = visibleHistory.length < state.history.length
    ? `<button class="secondary-action full history-more-button" data-view-older>View Older</button>`
    : "";
  list.innerHTML = `${rows}${moreButton}`;
}

function visibleHistoryEntries() {
  const cutoff = historyCutoffDate(visibleHistoryMonths).getTime();
  return state.history
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => historyTimestamp(item) >= cutoff);
}

function historyCutoffDate(months) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setMonth(date.getMonth() - months);
  return date;
}

function historyTimestamp(item) {
  if (item.timestamp) return item.timestamp;
  return Date.now();
}

function formatHistoryExercises(item) {
  const exercises = item.exercises?.length
    ? item.exercises
    : item.exerciseNames.map((name, index) => ({ id: item.exerciseIds[index], name, sets: [] }));

  return exercises.map((exercise) => {
    const muscle = historyExerciseMuscle(exercise);
    return `
    <div class="history-exercise">
      <div class="history-exercise-heading">
        <span>${exercise.name}</span>
        ${muscle ? `<span class="pill">${muscle}</span>` : ""}
      </div>
      <small>${formatHistorySets(exercise.sets, exercise.logging)}</small>
      ${exercise.noteSnapshot ? `<p class="history-note"><strong>Note:</strong> ${escapeHtml(exercise.noteSnapshot)}</p>` : ""}
    </div>
  `;
  }).join("");
}

function historyExerciseMuscle(exercise) {
  if (exercise.muscle) return exercise.muscle;
  return getExerciseLibrary().find((item) => item.id === exercise.id)?.muscle || "";
}

function formatHistorySets(sets = [], logging = "weight") {
  const exercise = { logging };
  const logged = sets.filter((set) => hasLoggedValues(set, exercise));
  if (!logged.length) return "No sets logged";
  return logged.map((set) => formatLoggedSet(set, logging)).join(" · ");
}

function generateWorkout() {
  clearRestTimer(false);
  const profile = state.profile;
  const targetDuration = profile.duration;
  const timeBudget = workoutTimeBudget(targetDuration);
  const minimumMinutes = workoutMinimumMinutes(targetDuration);
  const maxMoves = targetDuration <= 10
    ? 1
    : Math.min(18, Math.max(2, Math.ceil(targetDuration / 7)));
  const pool = getExerciseLibrary().filter((exercise) => {
    return profile.equipment.includes(exercise.equipment) && !state.excluded.includes(exercise.id);
  });
  const recovery = muscleRecoveryStatus();
  const generationPool = [...pool].sort((a, b) => {
    return exerciseRecoveryBurden(a, recovery) - exerciseRecoveryBurden(b, recovery);
  });

  const recentNames = recentExerciseIds(EXERCISE_FRESHNESS_HISTORY_LIMIT);
  const muscleBalance = muscleBalanceStatus(profile);
  const muscleAllocation = buildMuscleAllocation(profile, generationPool, recovery, timeBudget, muscleBalance);
  const musclePlan = buildMusclePlan(profile, generationPool, recovery, maxMoves, muscleBalance);
  const chosen = [];
  let estimatedMinutes = 0;

  musclePlan.forEach((muscle) => {
    if (chosen.length >= maxMoves) return;
    const prescribed = chooseExerciseForMuscle(
      muscle,
      generationPool,
      chosen,
      recentNames,
      recovery,
      timeBudget - estimatedMinutes,
      muscleAllocation
    );
    if (prescribed) {
      chosen.push(prescribed);
      estimatedMinutes += estimatedExerciseMinutes(prescribed);
    }
  });

  const fillOrder = [...musclePlan, ...rankDeficitMuscles(profile, generationPool, recovery, muscleBalance)]
    .filter((muscle, index, list) => list.indexOf(muscle) === index);

  let madeProgress = true;
  while (chosen.length < maxMoves && estimatedMinutes < minimumMinutes && madeProgress) {
    madeProgress = false;
    const rankedFillOrder = [...fillOrder].sort((a, b) => {
      const needA = remainingMuscleNeed(a, chosen, muscleAllocation, muscleBalance);
      const needB = remainingMuscleNeed(b, chosen, muscleAllocation, muscleBalance);
      return needB - needA;
    });

    for (const muscle of rankedFillOrder) {
      const prescribed = chooseExerciseForMuscle(
        muscle,
        generationPool,
        chosen,
        recentNames,
        recovery,
        timeBudget - estimatedMinutes,
        muscleAllocation
      );
      if (prescribed) {
        chosen.push(prescribed);
        estimatedMinutes += estimatedExerciseMinutes(prescribed);
        madeProgress = true;
        break;
      }
    }
  }

  estimatedMinutes = backfillSparseWorkout(
    chosen,
    estimatedMinutes,
    minimumWorkoutMoves(targetDuration),
    maxMoves,
    timeBudget,
    generationPool,
    recentNames,
    recovery,
    profile,
    muscleBalance
  );

  estimatedMinutes = extendWorkoutTowardMinimum(
    chosen,
    estimatedMinutes,
    minimumMinutes,
    timeBudget,
    muscleAllocation
  );

  const ordered = orderWorkoutForGymFlow(chosen, profile);
  estimatedMinutes = extendWorkoutTowardMinimum(
    ordered,
    estimatedOrderedWorkoutMinutes(ordered),
    minimumMinutes,
    timeBudget,
    muscleAllocation
  );

  const focus = topMuscles(ordered).slice(0, 2).join(" + ") || "Balanced";
  state.workout = {
    id: Date.now(),
    duration: `${targetDuration}m`,
    focus,
    exercises: ordered,
    swappedOutIds: []
  };
  saveState();
}

function buildMusclePlan(profile, pool, recovery, maxMoves, balance = muscleBalanceStatus(profile)) {
  const ranked = rankDeficitMuscles(profile, pool, recovery, balance);
  const targetGroups = Math.min(ranked.length, maxMoves, targetMuscleGroupCount(profile.duration));
  if (targetGroups <= 1) return ranked.slice(0, targetGroups);

  const plan = [];
  const available = [...ranked];
  while (plan.length < targetGroups && available.length) {
    const topWindow = available.slice(0, Math.min(3, available.length));
    const muscle = weightedDeficitChoice(topWindow, profile, recovery, balance);
    const index = available.indexOf(muscle);
    plan.push(muscle);
    available.splice(index >= 0 ? index : 0, 1);
  }
  return plan;
}

function targetMuscleGroupCount(duration) {
  if (duration <= 10) return 1;
  if (duration <= 20) return 2;
  if (duration <= 30) return 3;
  if (duration <= 45) return 4;
  if (duration <= 60) return 5;
  return 6;
}

function minimumWorkoutMoves(duration) {
  if (duration <= 10) return 1;
  if (duration <= 20) return 2;
  if (duration <= 45) return 3;
  if (duration <= 60) return 4;
  return 5;
}

function backfillSparseWorkout(chosen, estimatedMinutes, minimumMoves, maxMoves, timeBudget, pool, recentNames, recovery, profile, balance = muscleBalanceStatus(profile)) {
  if (chosen.length >= minimumMoves) return estimatedMinutes;
  const fillOrder = rankDeficitMuscles(profile, pool, recovery, balance);
  let madeProgress = true;

  while (chosen.length < minimumMoves && chosen.length < maxMoves && madeProgress) {
    madeProgress = false;
    for (const muscle of fillOrder) {
      const prescribed = chooseExerciseForMuscle(
        muscle,
        pool,
        chosen,
        recentNames,
        recovery,
        timeBudget - estimatedMinutes,
        null
      );
      if (!prescribed) continue;
      chosen.push(prescribed);
      estimatedMinutes += estimatedExerciseMinutes(prescribed);
      madeProgress = true;
      break;
    }
  }

  return estimatedMinutes;
}

function rankAvailableMuscles(profile, pool, recovery, balance = muscleBalanceStatus(profile)) {
  return muscles
    .filter((muscle) => pool.some((exercise) => exercise.muscle === muscle))
    .sort((a, b) => {
      const scoreA = muscleGenerationWeight(profile, a, balance, recovery) * 10 - (recovery[a] || 0) * 16;
      const scoreB = muscleGenerationWeight(profile, b, balance, recovery) * 10 - (recovery[b] || 0) * 16;
      return scoreB - scoreA;
    });
}

function rankDeficitMuscles(profile, pool, recovery, balance = muscleBalanceStatus(profile)) {
  return muscles
    .filter((muscle) => pool.some((exercise) => exercise.muscle === muscle))
    .sort((a, b) => {
      return muscleDeficitScore(profile, b, balance, recovery) - muscleDeficitScore(profile, a, balance, recovery);
    });
}

function buildMuscleAllocation(profile, pool, recovery, timeBudget, balance = muscleBalanceStatus(profile)) {
  const availableMuscles = rankAvailableMuscles(profile, pool, recovery, balance);
  const weighted = availableMuscles.map((muscle) => ({
    muscle,
    weight: Math.max(0.6, muscleGenerationWeight(profile, muscle, balance, recovery))
  }));
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0) || 1;
  const priorityOrder = getPriorityOrder(profile);
  const allocation = {};

  weighted.forEach(({ muscle, weight }) => {
    const target = timeBudget * (weight / totalWeight);
    const priorityRank = priorityOrder.indexOf(muscle);
    const lowPriority = priorityRank >= muscles.length - 2;
    const mediumPriority = priorityRank >= 2 && priorityRank < muscles.length - 2;
    const duration = profile.duration;
    let max = target * (duration > 75 ? 1.55 : 1.35) + (duration > 75 ? 3 : 1.5);

    if (duration <= 60 && lowPriority) max = target * 1.2 + 1.5;
    if (duration <= 30 && mediumPriority) max = target * 1.25 + 1;

    allocation[muscle] = {
      target,
      max,
      rank: priorityRank < 0 ? muscles.length : priorityRank,
      lowPriority,
      mediumPriority
    };
  });

  allocation.order = availableMuscles;
  return allocation;
}

function muscleBalanceStatus(profile = state.profile) {
  const targetShares = muscleTargetShares(profile);
  const actual = Object.fromEntries(muscles.map((muscle) => [muscle, 0]));
  const recent = state.history.slice(0, BALANCE_HISTORY_LIMIT);

  recent.forEach((workout, workoutIndex) => {
    const workoutWeight = Math.pow(0.88, workoutIndex);
    const exercises = workout.exercises?.length
      ? workout.exercises
      : (workout.exerciseIds || []).map((id, index) => {
          const definition = getExerciseLibrary().find((exercise) => exercise.id === id);
          return {
            id,
            name: workout.exerciseNames?.[index] || definition?.name || id,
            muscle: definition?.muscle,
            secondaryMuscles: secondaryMusclesForExercise(definition)
          };
        });

    exercises.forEach((exercise) => {
      const completed = exercise.completed
        || exercise.sets?.some((set) => set.done)
        || !exercise.sets;
      if (!completed) return;

      const definition = getExerciseLibrary().find((item) => item.id === exercise.id);
      const primaryMuscle = exercise.muscle || definition?.muscle;
      if (!primaryMuscle) return;

      const setCount = Math.max(1, exercise.sets?.length || 1);
      actual[primaryMuscle] += setCount * workoutWeight;

      const secondaryMuscles = exercise.secondaryMuscles
        || secondaryMusclesForExercise(definition || exercise);
      secondaryMuscles.forEach((muscle) => {
        actual[muscle] += setCount * SECONDARY_BALANCE_CREDIT * workoutWeight;
      });
    });
  });

  const total = Object.values(actual).reduce((sum, value) => sum + value, 0);
  const confidence = Math.min(1, recent.length / 6);
  const balance = {};

  muscles.forEach((muscle) => {
    const target = targetShares[muscle] || 0;
    const actualShare = total ? actual[muscle] / total : target;
    const gap = target - actualShare;
    const correction = clamp(gap * 2.4 * confidence, -0.35, 0.7);
    const absenceBoost = total && actual[muscle] === 0
      ? Math.min(0.2, target * 1.5 * confidence)
      : 0;
    balance[muscle] = {
      target,
      actual: actualShare,
      deficit: gap,
      deficitRatio: target ? gap / target : 0,
      multiplier: Math.max(0.65, 1 + correction + absenceBoost)
    };
  });

  return balance;
}

function muscleTargetShares(profile = state.profile) {
  const priorityOrder = getPriorityOrder(profile);
  const weighted = priorityOrder.map((muscle, index) => ({
    muscle,
    weight: priorityTargetWeight(index)
  }));
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0) || 1;
  return weighted.reduce((shares, item) => {
    shares[item.muscle] = item.weight / totalWeight;
    return shares;
  }, {});
}

function priorityTargetWeight(index) {
  return Math.max(2.5, 6 - index * 0.7);
}

function muscleGenerationWeight(profile, muscle, balance = muscleBalanceStatus(profile), recovery = {}) {
  const priorityOrder = getPriorityOrder(profile);
  const rank = priorityOrder.indexOf(muscle);
  const targetWeight = priorityTargetWeight(rank < 0 ? muscles.length - 1 : rank);
  const balanceMultiplier = balance[muscle]?.multiplier ?? 1;
  const recoveryMultiplier = 1 - (recovery[muscle] || 0) * 0.55;
  return targetWeight * balanceMultiplier * recoveryMultiplier;
}

function muscleDeficitScore(profile, muscle, balance = muscleBalanceStatus(profile), recovery = {}) {
  const priorityOrder = getPriorityOrder(profile);
  const rank = priorityOrder.indexOf(muscle);
  const priorityWeight = priorityTargetWeight(rank < 0 ? muscles.length - 1 : rank);
  const deficitRatio = balance[muscle]?.deficitRatio ?? 0;
  const target = balance[muscle]?.target ?? 0;
  const recoveryBurden = recovery[muscle] || 0;
  const deficitScore = clamp(deficitRatio, -1, 1.4) * 12;
  const priorityTieBreaker = priorityWeight * 0.55 + target * 8;
  return deficitScore + priorityTieBreaker - recoveryBurden * 9;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function muscleAllocationNeed(muscle, chosen, allocation) {
  const target = allocation[muscle]?.target || 0;
  return target - muscleMinutes(chosen, muscle);
}

function remainingMuscleNeed(muscle, chosen, allocation, balance = muscleBalanceStatus(state.profile)) {
  const allocationNeed = muscleAllocationNeed(muscle, chosen, allocation);
  const longTermNeed = Math.max(0, balance[muscle]?.deficitRatio || 0) * 6;
  return allocationNeed + longTermNeed;
}

function muscleMinutes(exercises, muscle) {
  return exercises
    .filter((exercise) => exercise.muscle === muscle)
    .reduce((total, exercise) => total + estimatedExerciseMinutes(exercise), 0);
}

function weightedMuscleChoice(candidates, profile, recovery, balance = muscleBalanceStatus(profile)) {
  if (!candidates.length) return null;
  const weighted = candidates.map((muscle) => ({
    muscle,
    weight: Math.max(1, Math.pow(muscleGenerationWeight(profile, muscle, balance, recovery), 1.5))
  }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of weighted) {
    roll -= item.weight;
    if (roll <= 0) return item.muscle;
  }
  return weighted.at(-1).muscle;
}

function weightedDeficitChoice(candidates, profile, recovery, balance = muscleBalanceStatus(profile)) {
  if (!candidates.length) return null;
  const scored = candidates.map((muscle) => ({
    muscle,
    weight: Math.max(1, muscleDeficitScore(profile, muscle, balance, recovery) + 14)
  }));
  const total = scored.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of scored) {
    roll -= item.weight;
    if (roll <= 0) return item.muscle;
  }
  return scored.at(-1).muscle;
}

function chooseExerciseForMuscle(muscle, pool, chosen, recentNames, recovery, minutesAvailable, muscleAllocation = null) {
  const candidates = pool
    .filter((exercise) => exercise.muscle === muscle)
    .filter((exercise) => !chosen.some((picked) => picked.id === exercise.id))
    .map((exercise) => withPrescription(exercise))
    .filter((exercise) => {
      return estimatedExerciseMinutes(exercise) <= minutesAvailable
        && canAddExercise(chosen, exercise, muscleAllocation);
    });

  const lowerRecoveryBurden = candidates.filter((exercise) => {
    const minimum = Math.min(...candidates.map((item) => exerciseRecoveryBurden(item, recovery)));
    return exerciseRecoveryBurden(exercise, recovery) === minimum;
  });
  const preferredPool = lowerRecoveryBurden.length ? lowerRecoveryBurden : candidates;
  const longWorkoutCompounds = state.profile.duration > 75
    ? preferredPool.filter((exercise) => exercise.style === "compound")
    : [];
  const durationPool = longWorkoutCompounds.length ? longWorkoutCompounds : preferredPool;
  return weightedExerciseChoice(durationPool, recentNames);
}

function weightedExerciseChoice(candidates, recentNames) {
  if (!candidates.length) return null;
  const allRecent = candidates.every((exercise) => recentNames.has(exercise.id));
  const weighted = candidates.map((exercise) => ({
    exercise,
    weight: allRecent || !recentNames.has(exercise.id) ? 1 : RECENT_EXERCISE_CHANCE
  }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of weighted) {
    roll -= item.weight;
    if (roll <= 0) return item.exercise;
  }
  return weighted.at(-1).exercise;
}

function shuffleArray(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function muscleRecoveryStatus() {
  const recovery = Object.fromEntries(muscles.map((muscle) => [muscle, 0]));
  const cutoff = Date.now() - RECOVERY_WINDOW_MS;

  state.history.forEach((workout) => {
    if (!workout.timestamp || workout.timestamp < cutoff) return;
    (workout.exercises || []).forEach((loggedExercise) => {
      const completed = loggedExercise.completed
        || loggedExercise.sets?.some((set) => set.done);
      if (!completed) return;

      const definition = getExerciseLibrary().find((exercise) => exercise.id === loggedExercise.id);
      const primaryMuscle = loggedExercise.muscle || definition?.muscle;
      if (primaryMuscle) recovery[primaryMuscle] = 1;

      const secondaryMuscles = loggedExercise.secondaryMuscles
        || secondaryMusclesForExercise(definition || loggedExercise);
      secondaryMuscles.forEach((muscle) => {
        recovery[muscle] = Math.max(recovery[muscle] || 0, 0.5);
      });
    });
  });

  return recovery;
}

function secondaryMusclesForExercise(exercise) {
  if (!exercise || exercise.style !== "compound") return [];
  if (exercise.muscle === "Chest" && exercise.pattern === "press") return ["Shoulders", "Arms"];
  if (exercise.muscle === "Shoulders" && exercise.pattern === "press") return ["Arms", "Chest"];
  if (exercise.muscle === "Back") return ["Arms"];
  if (exercise.muscle === "Legs" && ["squat", "hinge"].includes(exercise.pattern)) return ["Core"];
  return [];
}

function orderWorkoutForGymFlow(exercises, profile) {
  if (exercises.length < 2) return [...exercises];
  const priorityOrder = getPriorityOrder(profile);
  const originalIndex = new Map(exercises.map((exercise, index) => [exercise.id, index]));
  const beamWidth = exercises.length > 10 ? 100 : 180;
  let paths = [{ ordered: [], remaining: [...exercises], score: 0 }];

  while (paths[0]?.remaining.length) {
    const expanded = [];
    paths.forEach((path) => {
      path.remaining.forEach((candidate) => {
        const previous = path.ordered.at(-1) || null;
        const compoundsRemain = path.remaining.some((exercise) => {
          return exercise.id !== candidate.id && exercise.style === "compound";
        });
        const nextScore = path.score
          + gymFlowStepScore(candidate, previous, path.ordered.length, compoundsRemain, priorityOrder, originalIndex);
        expanded.push({
          ordered: [...path.ordered, candidate],
          remaining: path.remaining.filter((exercise) => exercise.id !== candidate.id),
          score: nextScore
        });
      });
    });
    paths = expanded.sort((a, b) => a.score - b.score).slice(0, beamWidth);
  }

  return paths[0]?.ordered || [...exercises];
}

function gymFlowStepScore(candidate, previous, position, compoundsRemain, priorityOrder, originalIndex) {
  const priorityRank = Math.max(0, priorityOrder.indexOf(candidate.muscle));
  const earlyPositionWeight = Math.max(0.25, 1 - position * 0.12);
  let score = priorityRank * 0.35 * earlyPositionWeight
    + (originalIndex.get(candidate.id) || 0) * 0.03 * earlyPositionWeight;

  if (position === 0 && candidate.style === "accessory") score += 7;
  if (compoundsRemain && candidate.style === "accessory") score += 4;
  if (!previous) return score;

  score += adjacentFatiguePenalty(previous, candidate);
  score += equipmentTransitionScore(previous.equipment, candidate.equipment);
  if (exerciseFamily(previous) === exerciseFamily(candidate)) score += 4;
  return score;
}

function adjacentFatiguePenalty(previous, candidate) {
  const previousSecondary = secondaryMusclesForExercise(previous);
  const candidateSecondary = secondaryMusclesForExercise(candidate);
  let penalty = previous.muscle === candidate.muscle ? 12 : 0;
  if (previousSecondary.includes(candidate.muscle)) penalty += 6;
  if (candidateSecondary.includes(previous.muscle)) penalty += 6;
  penalty += previousSecondary.filter((muscle) => candidateSecondary.includes(muscle)).length * 2;
  return penalty;
}

function equipmentTransitionScore(previousEquipment, nextEquipment) {
  if (previousEquipment !== nextEquipment) return 1;
  if (previousEquipment === "Machines") return -1;
  if (previousEquipment === "Bodyweight") return -0.5;
  return -5;
}

function estimatedOrderedWorkoutMinutes(exercises) {
  const baseMinutes = exercises.reduce((total, exercise) => total + estimatedExerciseMinutes(exercise), 0);
  const savedSeconds = exercises.slice(1).reduce((total, exercise, index) => {
    const previous = exercises[index];
    if (previous.equipment !== exercise.equipment) return total;
    if (exercise.equipment === "Machines") return total;
    if (exercise.equipment === "Cables") return total + 10;
    return total + 8;
  }, 0);
  return Math.max(0, baseMinutes - savedSeconds / 60);
}

function exerciseRecoveryBurden(exercise, recovery) {
  const primaryBurden = (recovery[exercise.muscle] || 0) * 100;
  const secondaryBurden = secondaryMusclesForExercise(exercise)
    .reduce((total, muscle) => total + (recovery[muscle] || 0) * 30, 0);
  return primaryBurden + secondaryBurden;
}

function exerciseFamily(exercise) {
  if (!exercise) return "";
  const id = exercise.id || "";
  const name = (exercise.name || "").toLowerCase();

  if (id.includes("push-up")) return "push-up";
  if (id.includes("bench-press") || id === "machine-chest-press") return "chest-press";
  if (id.includes("cable-fly") || id === "pec-deck") return "chest-fly";
  if (id.includes("curl")) return "curl";
  if (id.includes("triceps") || id.includes("skull-crusher") || id === "bench-dip") return "triceps-extension";
  if (id.includes("lateral-raise")) return "lateral-raise";
  if (id.includes("rear-delt") || id.includes("face-pull") || id.includes("reverse-dumbbell-fly")) return "rear-delt";
  if (id.includes("shoulder-press") || id.includes("overhead-press") || id === "arnold-press") return "shoulder-press";
  if (id.includes("row")) return "row";
  if (id.includes("pull-up") || id.includes("chin-up") || id.includes("pulldown")) return "vertical-pull";
  if (id.includes("lunge") || id.includes("split-squat") || id === "step-up") return "single-leg";
  if (id.includes("squat") || id === "leg-press") return "squat";
  if (id.includes("deadlift") || id.includes("romanian") || id.includes("hip-thrust") || id.includes("glute-bridge")) return "hinge";
  if (id.includes("calf-raise")) return "calf-raise";
  if (id.includes("leg-curl")) return "leg-curl";
  if (id.includes("plank") || id.includes("hollow-body")) return "plank";
  if (id.includes("dead-bug")) return "dead-bug";
  if (id.includes("crunch")) return "crunch";
  if (id.includes("hanging-") && (id.includes("raise") || name.includes("raise"))) return "hanging-raise";

  return `${exercise.muscle}-${exercise.pattern || id}`;
}

function workoutTimeBudget(targetDuration) {
  if (targetDuration <= 10) return targetDuration;
  if (targetDuration <= 30) return targetDuration * 0.88;
  return targetDuration * 0.9;
}

function workoutMinimumMinutes(targetDuration) {
  if (targetDuration <= 10) return workoutTimeBudget(targetDuration) * 0.8;
  return workoutTimeBudget(targetDuration) * 0.82;
}

function estimatedExerciseMinutes(exercise) {
  const workSeconds = exercise.sets * workSecondsPerSet(exercise);
  const restSeconds = Math.max(0, exercise.sets - 1) * exercise.rest;
  const setupSeconds = exerciseSetupSeconds(exercise);
  const transitionSeconds = 60;
  return (workSeconds + restSeconds + setupSeconds + transitionSeconds) / 60;
}

function addedSetMinutes(exercise) {
  const workSeconds = workSecondsPerSet(exercise);
  return (workSeconds + exercise.rest) / 60;
}

function workSecondsPerSet(exercise) {
  const liftSeconds = exercise.logging === "duration"
    ? 50
    : exercise.style === "compound" ? 50 : 42;
  const loggingSeconds = 10;
  return liftSeconds + loggingSeconds;
}

function exerciseSetupSeconds(exercise) {
  const equipmentSetup = {
    Barbell: 120,
    Cables: 100,
    Machines: 80,
    Dumbbells: 70,
    Kettlebells: 60,
    Bodyweight: 35
  };
  const base = equipmentSetup[exercise.equipment] ?? 75;
  return exercise.style === "compound" ? base + 20 : base;
}

function extendWorkoutTowardMinimum(exercises, currentMinutes, minimumMinutes, timeBudget, muscleAllocation = null) {
  let estimatedMinutes = currentMinutes;
  const priorityOrder = getPriorityOrder(state.profile);

  while (estimatedMinutes < minimumMinutes) {
    const candidates = exercises
      .filter((exercise) => {
        const maximumSets = state.profile.duration > 75
          ? (exercise.style === "compound" ? 6 : 5)
          : (exercise.style === "compound" ? 5 : 4);
        const muscleSets = exercises
          .filter((item) => item.muscle === exercise.muscle)
          .reduce((total, item) => total + item.sets, 0);
        const muscleSetLimit = state.profile.duration > 75 ? 10 : 8;
        return exercise.sets < maximumSets && muscleSets < muscleSetLimit;
      })
      .map((exercise) => ({ exercise, addedMinutes: addedSetMinutes(exercise) }))
      .filter(({ exercise, addedMinutes }) => {
        if (estimatedMinutes + addedMinutes > timeBudget) return false;
        const allocation = muscleAllocation?.[exercise.muscle];
        if (!allocation) return true;
        return muscleMinutes(exercises, exercise.muscle) + addedMinutes <= allocation.max;
      });

    const sortedCandidates = candidates
      .sort((a, b) => {
        const needA = muscleAllocationNeed(a.exercise.muscle, exercises, muscleAllocation || {});
        const needB = muscleAllocationNeed(b.exercise.muscle, exercises, muscleAllocation || {});
        if (needA !== needB) return needB - needA;

        const priorityA = priorityOrder.indexOf(a.exercise.muscle);
        const priorityB = priorityOrder.indexOf(b.exercise.muscle);
        if (priorityA !== priorityB) return priorityA - priorityB;

        const distanceA = Math.abs(minimumMinutes - (estimatedMinutes + a.addedMinutes));
        const distanceB = Math.abs(minimumMinutes - (estimatedMinutes + b.addedMinutes));
        return distanceA - distanceB;
      });

    const best = sortedCandidates[0];
    if (!best) break;
    best.exercise.sets += 1;
    best.exercise.log.push(newLogSet(
      best.exercise,
      previousLoad(best.exercise, findLastExerciseEntry(best.exercise.id))
    ));
    estimatedMinutes += best.addedMinutes;
  }

  return estimatedMinutes;
}

function canAddExercise(chosen, candidate, muscleAllocation = null) {
  const sameMuscle = chosen.filter((exercise) => exercise.muscle === candidate.muscle);
  const directSets = sameMuscle.reduce((total, exercise) => total + exercise.sets, 0) + candidate.sets;
  const directSetLimit = state.profile.duration > 75 ? 10 : 7;
  const exerciseLimit = state.profile.duration > 105 ? 3 : 2;
  if (sameMuscle.length >= exerciseLimit || directSets > directSetLimit) return false;

  const allocation = muscleAllocation?.[candidate.muscle];
  if (allocation && sameMuscle.length > 0) {
    const proposedMinutes = muscleMinutes(chosen, candidate.muscle) + estimatedExerciseMinutes(candidate);
    if (proposedMinutes > allocation.max) return false;
    if (state.profile.duration <= 60 && allocation.lowPriority) return false;
    if (state.profile.duration <= 30 && allocation.mediumPriority) return false;
  }

  const candidateFamily = exerciseFamily(candidate);
  const repeatsFamily = chosen.some((exercise) => {
    return candidateFamily && exerciseFamily(exercise) === candidateFamily;
  });
  if (repeatsFamily) return false;

  const repeatsMovement = chosen.some((exercise) => {
    return exercise.muscle === candidate.muscle && exercise.pattern === candidate.pattern;
  });
  if (repeatsMovement) return false;

  const majorPresses = [...chosen, candidate].filter((exercise) => {
    return exercise.style === "compound"
      && exercise.pattern === "press"
      && ["Chest", "Shoulders"].includes(exercise.muscle);
  });
  if (majorPresses.length > 2) return false;

  const fatigue = workoutFatigue([...chosen, candidate]);
  const fatigueLimit = state.profile.duration > 105 ? 9 : state.profile.duration > 75 ? 7 : 5;
  return Object.values(fatigue).every((load) => load <= fatigueLimit);
}

function workoutFatigue(exercises) {
  const fatigue = Object.fromEntries(muscles.map((muscle) => [muscle, 0]));
  exercises.forEach((exercise) => {
    fatigue[exercise.muscle] += exercise.style === "compound" ? 3 : 2;
    secondaryMusclesForExercise(exercise).forEach((muscle) => {
      fatigue[muscle] += 1;
    });
  });
  return fatigue;
}

function withPrescription(exercise) {
  const compound = exercise.style === "compound";
  const miniWorkout = state.profile.duration <= 10;
  const shortWorkout = state.profile.duration <= 30;
  const longWorkout = state.profile.duration > 75 && state.profile.duration <= 105;
  const sets = miniWorkout
    ? (compound ? 1 : 2)
    : shortWorkout
    ? (compound ? 3 : 2)
    : longWorkout ? (compound ? 5 : 4) : (compound ? 4 : 3);
  const reps = exercise.logging === "duration" ? "30-45 sec" : compound ? "6-10" : "10-15";
  const last = findLastExerciseEntry(exercise.id);
  const lastLoad = previousLoad(exercise, last);
  return {
    ...exercise,
    sets,
    reps,
    rest: shortWorkout ? (compound ? 90 : 45) : (compound ? 105 : 60),
    completed: false,
    log: Array.from({ length: sets }, () => newLogSet(exercise, lastLoad))
  };
}

function ensureExerciseLog(exercise) {
  if (!Array.isArray(exercise.log) || exercise.log.length !== exercise.sets) {
    const last = findLastExerciseEntry(exercise.id);
    const lastLoad = previousLoad(exercise, last);
    exercise.log = Array.from({ length: exercise.sets }, (_, index) => ({
      ...newLogSet(exercise, lastLoad),
      ...exercise.log?.[index],
      done: Boolean(exercise.log?.[index]?.done)
    }));
  }
  if (typeof exercise.completed !== "boolean") {
    exercise.completed = false;
  }
}

function previousLoad(exercise, last) {
  const loadKey = exercise.logging === "assistance" ? "assistance" : "weight";
  if (!["weight", "assistance"].includes(exercise.logging || "weight")) return "";
  return last?.sets?.find((set) => set[loadKey] !== "" && set[loadKey] != null)?.[loadKey] || "";
}

function newLogSet(exercise, previous = "") {
  if (exercise.logging === "duration") return { duration: "", done: false };
  if (exercise.logging === "reps") return { reps: "", done: false };
  if (exercise.logging === "assistance") return { assistance: previous, reps: "", done: false };
  return { weight: previous, reps: "", done: false };
}

function findLastExerciseEntry(exerciseId) {
  for (const workout of state.history) {
    const match = workout.exercises?.find((exercise) => exercise.id === exerciseId && exercise.sets?.length);
    if (match) return match;
  }
  return null;
}

function formatLastPerformance(exercise) {
  const last = findLastExerciseEntry(exercise.id);
  if (!last) return "Last time: no prior log";
  const sets = last.sets
    .filter((set) => hasLoggedValues(set, exercise))
    .map((set, index) => `<li>${index + 1}: ${formatLoggedSet(set, exercise.logging)}</li>`)
    .join("");
  return sets
    ? `<strong>Last</strong><ul>${sets}</ul>`
    : `<strong>Last</strong><span> no completed sets</span>`;
}

function formatLoggedSet(set, logging = "weight") {
  if (logging === "reps") return `${set.reps || "?"} reps`;
  if (logging === "duration") return `${set.duration || "?"} sec`;
  if (logging === "assistance") return `${set.assistance || "?"} lb assistance x ${set.reps || "?"}`;
  return `${set.weight || "?"} lb x ${set.reps || "?"}`;
}

function topMuscles(exercises) {
  const counts = exercises.reduce((acc, exercise) => {
    acc[exercise.muscle] = (acc[exercise.muscle] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([muscle]) => muscle);
}

function swapExercise(mode) {
  if (!state.workout || !pendingSwapId) return;
  const index = state.workout.exercises.findIndex((exercise) => exercise.id === pendingSwapId);
  const original = state.workout.exercises[index];
  if (!original) return;

  if (mode === "forever" && !state.excluded.includes(original.id)) {
    state.excluded.push(original.id);
  }

  const replacement = findReplacement(original);
  if (replacement) {
    if (restTimer?.exerciseId === original.id) clearRestTimer(false);
    state.workout.exercises[index] = replacement;
    state.workout.swappedOutIds = [
      ...new Set([...(state.workout.swappedOutIds || []), original.id])
    ];
    state.workout.focus = topMuscles(state.workout.exercises).slice(0, 2).join(" + ");
  }

  const removedId = original.id;
  closeSwapSheet();
  saveState();

  if (mode === "forever") {
    showToast(`${original.name} hidden.`, "Undo", () => {
      state.excluded = state.excluded.filter((id) => id !== removedId);
      saveState();
      showToast(`${original.name} restored.`);
    }, 3000);
  } else {
    showToast(replacement ? `Swapped to ${replacement.name}.` : "No safe swap available.");
  }
}

function findReplacement(original) {
  const unavailable = new Set([
    original.id,
    ...state.excluded,
    ...(state.workout?.swappedOutIds || []),
    ...(state.workout?.exercises || []).map((exercise) => exercise.id)
  ]);
  const pool = getExerciseLibrary().filter((exercise) => {
    return state.profile.equipment.includes(exercise.equipment) && !unavailable.has(exercise.id);
  });

  const otherExercises = state.workout.exercises.filter((exercise) => exercise.id !== original.id);
  const currentMinutes = otherExercises.reduce((total, exercise) => total + estimatedExerciseMinutes(exercise), 0);
  const timeBudget = workoutTimeBudget(state.profile.duration);
  const recovery = muscleRecoveryStatus();
  const lastWorkoutIds = recentExerciseIds(1);
  const recentWorkoutIds = recentExerciseIds(3);
  const originalFamily = exerciseFamily(original);
  const priorityOrder = getPriorityOrder(state.profile);
  const originalPriorityIndex = priorityOrder.indexOf(original.muscle);

  const candidates = shuffleArray(pool)
    .map((exercise) => withPrescription(exercise))
    .filter((exercise) => {
      return currentMinutes + estimatedExerciseMinutes(exercise) <= timeBudget
        && canAddExercise(otherExercises, exercise);
    });

  const safeCandidates = candidates.filter((exercise) => exerciseRecoveryBurden(exercise, recovery) === 0);
  const mildRecoveryCandidates = candidates.filter((exercise) => {
    return (recovery[exercise.muscle] || 0) < 1 && exerciseRecoveryBurden(exercise, recovery) <= 15;
  });
  const recoveryPool = safeCandidates.length ? safeCandidates : mildRecoveryCandidates;

  return recoveryPool
    .sort((a, b) => {
      const ladderA = swapLadderRank(a, original, originalFamily, priorityOrder, originalPriorityIndex, recentWorkoutIds);
      const ladderB = swapLadderRank(b, original, originalFamily, priorityOrder, originalPriorityIndex, recentWorkoutIds);
      if (ladderA !== ladderB) return ladderA - ladderB;

      const lastWorkoutA = lastWorkoutIds.has(a.id) ? 1 : 0;
      const lastWorkoutB = lastWorkoutIds.has(b.id) ? 1 : 0;
      if (lastWorkoutA !== lastWorkoutB) return lastWorkoutA - lastWorkoutB;

      const recoveryA = exerciseRecoveryBurden(a, recovery);
      const recoveryB = exerciseRecoveryBurden(b, recovery);
      if (recoveryA !== recoveryB) return recoveryA - recoveryB;

      const priorityA = priorityDistance(a.muscle, priorityOrder, originalPriorityIndex);
      const priorityB = priorityDistance(b.muscle, priorityOrder, originalPriorityIndex);
      if (priorityA !== priorityB) return priorityA - priorityB;

      const minutesA = Math.abs(timeBudget - (currentMinutes + estimatedExerciseMinutes(a)));
      const minutesB = Math.abs(timeBudget - (currentMinutes + estimatedExerciseMinutes(b)));
      return minutesA - minutesB;
    })[0] || null;
}

function recentExerciseIds(limit) {
  return new Set(state.history.slice(0, limit).flatMap((workout) => {
    return workout.exerciseIds || workout.exercises?.map((exercise) => exercise.id) || [];
  }));
}

function priorityDistance(muscle, priorityOrder, originalPriorityIndex) {
  const index = priorityOrder.indexOf(muscle);
  if (index < 0 || originalPriorityIndex < 0) return muscles.length;
  return Math.abs(index - originalPriorityIndex);
}

function samePriorityTier(muscle, priorityOrder, originalPriorityIndex) {
  return priorityDistance(muscle, priorityOrder, originalPriorityIndex) <= 1;
}

function swapLadderRank(exercise, original, originalFamily, priorityOrder, originalPriorityIndex, recentWorkoutIds) {
  const recent = recentWorkoutIds.has(exercise.id);
  const sameMuscle = exercise.muscle === original.muscle;
  const sameFamily = exerciseFamily(exercise) === originalFamily;

  if (sameMuscle && sameFamily && !recent) return 0;
  if (sameMuscle && !sameFamily && !recent) return 1;
  if (sameMuscle) return 2;
  if (samePriorityTier(exercise.muscle, priorityOrder, originalPriorityIndex) && !recent) return 3;
  if (samePriorityTier(exercise.muscle, priorityOrder, originalPriorityIndex)) return 4;
  if (!recent) return 5;
  return 6;
}

function openSwapSheet(id) {
  pendingSwapId = id;
  const exercise = getExerciseLibrary().find((item) => item.id === id);
  swapDetail.textContent = exercise ? `${exercise.name} · ${exercise.muscle} · ${exercise.equipment}` : "";
  swapBackdrop.hidden = false;
}

function closeSwapSheet() {
  pendingSwapId = null;
  swapBackdrop.hidden = true;
}

function openCancelWorkoutSheet() {
  cancelWorkoutBackdrop.hidden = false;
}

function closeCancelWorkoutSheet() {
  cancelWorkoutBackdrop.hidden = true;
}

function openExerciseForm(exerciseId = null) {
  editingCustomExerciseId = exerciseId;
  const exercise = state.customExercises.find((item) => item.id === exerciseId);
  exerciseFormTitle.textContent = exercise ? "Edit Exercise" : "Add Exercise";
  customExerciseName.value = exercise?.name || "";
  customExerciseMuscle.value = exercise?.muscle || "Chest";
  customExerciseEquipment.value = exercise?.equipment || "Dumbbells";
  exerciseFormBackdrop.hidden = false;
  setTimeout(() => customExerciseName.focus(), 0);
}

function closeExerciseForm() {
  editingCustomExerciseId = null;
  exerciseForm.reset();
  exerciseFormBackdrop.hidden = true;
}

function saveCustomExercise(formData) {
  const name = String(formData.get("name") || "").trim().replace(/[<>"']/g, "");
  if (!name) return;
  const values = {
    name,
    muscle: formData.get("muscle"),
    equipment: formData.get("equipment"),
    pattern: "custom",
    style: "accessory",
    logging: "weight",
    note: "Your custom exercise.",
    custom: true
  };

  if (editingCustomExerciseId) {
    const index = state.customExercises.findIndex((exercise) => exercise.id === editingCustomExerciseId);
    if (index >= 0) {
      state.customExercises[index] = { ...state.customExercises[index], ...values };
    }
  } else {
    state.customExercises.push({ id: `custom-${Date.now()}`, ...values });
  }

  closeExerciseForm();
  saveState();
}

function openExerciseActions(id) {
  const exercise = state.customExercises.find((item) => item.id === id);
  if (!exercise) return;
  selectedCustomExerciseId = id;
  exerciseActionsDetail.textContent = `${exercise.name} · ${exercise.muscle} · ${exercise.equipment}`;
  exerciseActionsBackdrop.hidden = false;
}

function closeExerciseActions() {
  exerciseActionsBackdrop.hidden = true;
}

function openDeleteExerciseConfirmation() {
  const exercise = state.customExercises.find((item) => item.id === selectedCustomExerciseId);
  if (!exercise) return;
  closeExerciseActions();
  deleteExerciseDetail.textContent = `${exercise.name} will be removed from future workouts. Past history will remain unchanged.`;
  deleteExerciseBackdrop.hidden = false;
}

function closeDeleteExerciseConfirmation() {
  deleteExerciseBackdrop.hidden = true;
}

function openExercisePageActions() {
  exercisePageActionsBackdrop.hidden = false;
}

function closeExercisePageActions() {
  exercisePageActionsBackdrop.hidden = true;
}

function openHistoryPageActions() {
  historyPageActionsBackdrop.hidden = false;
}

function closeHistoryPageActions() {
  historyPageActionsBackdrop.hidden = true;
}

function deleteCustomExercise() {
  const exercise = state.customExercises.find((item) => item.id === selectedCustomExerciseId);
  if (!exercise) return;
  state.customExercises = state.customExercises.filter((item) => item.id !== selectedCustomExerciseId);
  state.excluded = state.excluded.filter((id) => id !== selectedCustomExerciseId);
  delete state.exerciseNotes[selectedCustomExerciseId];
  selectedCustomExerciseId = null;
  closeDeleteExerciseConfirmation();
  saveState();
  showToast("Custom exercise deleted.");
}

function pageResetCopy(viewName) {
  if (viewName === "settings") {
    return {
      title: "Reset Profile?",
      message: "This restores muscle priorities, duration, and equipment to their defaults.",
      keep: "Keep Settings",
      confirm: "Reset Profile"
    };
  }
  if (viewName === "excluded") {
    return {
      title: "Reset Exercises?",
      message: "This deletes all custom exercises and makes every built-in exercise Active.",
      keep: "Keep Exercises",
      confirm: "Reset Exercises"
    };
  }
  return {
    title: "Clear Workout History?",
    message: "This permanently deletes all logged workouts and progress records.",
    keep: "Keep History",
    confirm: "Clear History"
  };
}

function openPageResetSheet() {
  const copy = pageResetCopy(activeView);
  pageResetTitle.textContent = copy.title;
  pageResetMessage.textContent = copy.message;
  keepPageSettingsButton.textContent = copy.keep;
  confirmPageResetButton.textContent = copy.confirm;
  pageResetBackdrop.hidden = false;
}

function closePageResetSheet() {
  pageResetBackdrop.hidden = true;
}

function resetCurrentPage() {
  if (activeView === "settings") {
    state.profile = normalizeState({ profile: defaultProfile }).profile;
    closePageResetSheet();
    saveState();
    showCenterNotice("Profile reset", "Default workout preferences restored.");
    return;
  }

  if (activeView === "excluded") {
    state.customExercises.forEach((exercise) => delete state.exerciseNotes[exercise.id]);
    state.customExercises = [];
    state.excluded = [];
    exerciseStatusFilter = "all";
    exerciseSearchQuery = "";
    closePageResetSheet();
    saveState();
    showCenterNotice("Exercises reset", "Custom exercises were removed and built-ins are Active.");
    return;
  }

  state.history = [];
  visibleHistoryMonths = 3;
  closePageResetSheet();
  saveState();
  showCenterNotice("History cleared", "All logged workouts were deleted.");
}

function exportHistoryCsv() {
  if (!state.history.length) {
    closeHistoryPageActions();
    showCenterNotice("No history yet", "Log a workout before exporting.");
    return;
  }

  const csv = buildHistoryCsv();
  const date = new Date().toISOString().slice(0, 10);
  const filename = `liftmix-history-${date}.csv`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const file = new File([blob], filename, { type: "text/csv" });

  closeHistoryPageActions();

  if (navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file], title: "LiftMix history" })
      .then(() => showCenterNotice("History exported", "Your CSV is ready to share.", "success"))
      .catch(() => {});
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showCenterNotice("History exported", "Your CSV file is ready.", "success");
}

function buildHistoryCsv() {
  const headers = [
    "Workout Date",
    "Timestamp",
    "Focus",
    "Exercise",
    "Muscle Group",
    "Secondary Muscles",
    "Logging Type",
    "Set",
    "Weight",
    "Reps",
    "Duration Seconds",
    "Assistance",
    "Set Done",
    "Exercise Completed",
    "Note"
  ];
  const rows = state.history.flatMap((workout) => {
    const exercises = workout.exercises?.length
      ? workout.exercises
      : workout.exerciseNames.map((name, index) => ({ id: workout.exerciseIds[index], name, sets: [] }));

    return exercises.flatMap((exercise) => {
      const sets = exercise.sets?.length ? exercise.sets : [{}];
      return sets.map((set, index) => [
        workout.date || "",
        workout.timestamp ? new Date(workout.timestamp).toISOString() : "",
        workout.focus || "",
        exercise.name || "",
        historyExerciseMuscle(exercise),
        (exercise.secondaryMuscles || []).join("; "),
        exercise.logging || "weight",
        exercise.sets?.length ? index + 1 : "",
        set.weight ?? "",
        set.reps ?? "",
        set.duration ?? "",
        set.assistance ?? "",
        set.done ? "Yes" : "No",
        exercise.completed ? "Yes" : "No",
        exercise.noteSnapshot || ""
      ]);
    });
  });

  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function cancelWorkoutWithoutSaving() {
  clearRestTimer(false);
  state.workout = null;
  closeCancelWorkoutSheet();
  saveState();
  showCenterNotice("Workout canceled", "Nothing was saved to History.");
}

function showCenterNotice(titleText, messageText, tone = "danger") {
  centerNoticeTitle.textContent = titleText;
  centerNoticeMessage.textContent = messageText;
  centerNotice.classList.toggle("is-success", tone === "success");
  centerNotice.hidden = false;
  requestAnimationFrame(() => centerNotice.classList.add("is-visible"));
  clearTimeout(showCenterNotice.timer);
  showCenterNotice.timer = setTimeout(() => {
    centerNotice.classList.remove("is-visible");
    setTimeout(() => {
      centerNotice.hidden = true;
      centerNotice.classList.remove("is-success");
    }, 180);
  }, 2200);
}

function showToast(message, actionLabel, action, duration = 3400) {
  toast.innerHTML = "";
  const panel = document.createElement("div");
  panel.className = "toast-panel";
  const text = document.createElement("p");
  text.textContent = message;
  panel.appendChild(text);
  toast.classList.add("is-visible");
  if (actionLabel) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = actionLabel;
    button.addEventListener("click", () => {
      toast.classList.remove("is-visible");
      action();
    }, { once: true });
    panel.appendChild(button);
  }
  toast.appendChild(panel);
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), duration);
}

function randomIndex(length) {
  return Math.floor(Math.random() * length);
}

document.querySelector("#generate-button").addEventListener("click", generateWorkout);
document.querySelector("#keep-workout-button").addEventListener("click", closeCancelWorkoutSheet);
document.querySelector("#confirm-cancel-workout-button").addEventListener("click", cancelWorkoutWithoutSaving);
document.querySelector("#cancel-exercise-form-button").addEventListener("click", closeExerciseForm);
document.querySelector("#close-exercise-actions-button").addEventListener("click", closeExerciseActions);
document.querySelector("#edit-custom-exercise-button").addEventListener("click", () => {
  const id = selectedCustomExerciseId;
  closeExerciseActions();
  openExerciseForm(id);
});
document.querySelector("#delete-custom-exercise-button").addEventListener("click", openDeleteExerciseConfirmation);
document.querySelector("#keep-custom-exercise-button").addEventListener("click", closeDeleteExerciseConfirmation);
document.querySelector("#confirm-delete-exercise-button").addEventListener("click", deleteCustomExercise);
document.querySelector("#close-exercise-page-actions-button").addEventListener("click", closeExercisePageActions);
document.querySelector("#page-add-exercise-button").addEventListener("click", () => {
  closeExercisePageActions();
  openExerciseForm();
});
document.querySelector("#page-reset-exercises-button").addEventListener("click", () => {
  closeExercisePageActions();
  openPageResetSheet();
});
document.querySelector("#page-export-history-button").addEventListener("click", exportHistoryCsv);
document.querySelector("#page-clear-history-button").addEventListener("click", () => {
  closeHistoryPageActions();
  openPageResetSheet();
});
document.querySelector("#close-history-page-actions-button").addEventListener("click", closeHistoryPageActions);
document.querySelector("#page-reset-button").addEventListener("click", () => {
  if (activeView === "today" && state.workout) {
    openCancelWorkoutSheet();
    return;
  }
  if (activeView === "excluded") {
    openExercisePageActions();
    return;
  }
  if (activeView === "history") {
    openHistoryPageActions();
    return;
  }
  openPageResetSheet();
});
document.querySelector("#keep-page-settings-button").addEventListener("click", closePageResetSheet);
document.querySelector("#confirm-page-reset-button").addEventListener("click", resetCurrentPage);
exercisePageActionsBackdrop.addEventListener("click", (event) => {
  if (event.target === exercisePageActionsBackdrop) closeExercisePageActions();
});
historyPageActionsBackdrop.addEventListener("click", (event) => {
  if (event.target === historyPageActionsBackdrop) closeHistoryPageActions();
});
exerciseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const wasEditing = Boolean(editingCustomExerciseId);
  saveCustomExercise(new FormData(event.currentTarget));
  showToast(wasEditing ? "Exercise updated." : "Exercise added.");
});
document.querySelector("#settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const priorityOrder = [...priorityList.querySelectorAll("[data-priority-muscle]")].map((item) => item.dataset.priorityMuscle);
  const equipment = data.getAll("equipment");
  state.profile = {
    priorities: prioritiesFromOrder(priorityOrder),
    priorityOrder,
    duration: selectedDurationFromForm(data),
    equipment: equipment.length ? equipment : ["Bodyweight"]
  };
  saveState();
  showToast("Profile saved.");
  setView("today");
});

document.addEventListener("input", (event) => {
  if (event.target === customDurationInput) {
    renderProfileSummaryFromControls();
  }
  if (event.target === exerciseSearchInput) {
    exerciseSearchQuery = event.target.value.trim().toLowerCase();
    renderExercises();
    exerciseSearchInput.focus();
    exerciseSearchInput.setSelectionRange(event.target.value.length, event.target.value.length);
  }
  if (event.target.matches("[data-log]")) {
    const exercise = state.workout?.exercises.find((item) => item.id === event.target.dataset.log);
    const set = exercise?.log?.[Number(event.target.dataset.set)];
    if (!set) return;
    set[event.target.dataset.field] = event.target.value;
    persistState();
  }
  if (event.target.matches("[data-exercise-note]")) {
    const exerciseId = event.target.dataset.exerciseNote;
    const note = normalizeExerciseNote(event.target.value);
    if (event.target.value !== note) event.target.value = note;
    if (note) {
      state.exerciseNotes[exerciseId] = note;
    } else {
      delete state.exerciseNotes[exerciseId];
    }
    document.querySelectorAll("[data-exercise-note]").forEach((field) => {
      if (field !== event.target && field.dataset.exerciseNote === exerciseId) field.value = note;
    });
    persistState();
  }
});

document.addEventListener("keydown", (event) => {
  if (!event.target.matches("[data-exercise-note]")) return;
  if (event.key !== "Enter") return;
  event.preventDefault();
  event.target.blur();
});

document.addEventListener("change", (event) => {
  if (event.target.matches("input[name='duration']")) {
    renderCustomDuration();
    renderProfileSummaryFromControls();
  }
  if (event.target === exerciseStatusFilterInput) {
    exerciseStatusFilter = event.target.value;
    renderExercises();
  }
  if (event.target.matches("[data-exercise-active]")) {
    const id = event.target.dataset.exerciseActive;
    if (event.target.checked) {
      state.excluded = state.excluded.filter((exerciseId) => exerciseId !== id);
    } else if (!state.excluded.includes(id)) {
      state.excluded.push(id);
    }
    persistState();
    renderExercises();
  }
});

let draggedPriorityItem = null;
let priorityPlaceholder = null;
let priorityDragOffsetY = 0;
let pendingPriorityDrag = null;

priorityList.addEventListener("pointerdown", (event) => {
  const handle = event.target.closest(".priority-drag");
  const item = handle?.closest("[data-priority-muscle]");
  if (!handle || !item) return;

  event.preventDefault();
  pendingPriorityDrag = {
    item,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    timer: setTimeout(() => beginPriorityDrag(item, event), 160)
  };
});

function beginPriorityDrag(item, event) {
  if (!pendingPriorityDrag || pendingPriorityDrag.pointerId !== event.pointerId) return;
  const box = item.getBoundingClientRect();
  draggedPriorityItem = item;
  priorityDragOffsetY = event.clientY - box.top;
  priorityPlaceholder = document.createElement("div");
  priorityPlaceholder.className = "priority-placeholder";
  priorityPlaceholder.style.height = `${box.height}px`;
  item.classList.add("is-dragging");
  item.style.position = "fixed";
  item.style.left = `${box.left}px`;
  item.style.top = `${box.top}px`;
  item.style.width = `${box.width}px`;
  item.style.zIndex = "30";
  animatePriorityShift(() => {
    priorityList.insertBefore(priorityPlaceholder, item.nextSibling);
  });
  item.setPointerCapture?.(event.pointerId);
  pendingPriorityDrag = null;
}

function cancelPendingPriorityDrag() {
  if (!pendingPriorityDrag) return;
  clearTimeout(pendingPriorityDrag.timer);
  pendingPriorityDrag = null;
}

priorityList.addEventListener("pointermove", (event) => {
  if (pendingPriorityDrag && pendingPriorityDrag.pointerId === event.pointerId) {
    const deltaX = Math.abs(event.clientX - pendingPriorityDrag.startX);
    const deltaY = Math.abs(event.clientY - pendingPriorityDrag.startY);
    if (deltaX > 8 || deltaY > 8) cancelPendingPriorityDrag();
  }
  if (!draggedPriorityItem) return;
  event.preventDefault();
  draggedPriorityItem.style.top = `${event.clientY - priorityDragOffsetY}px`;

  const target = document.elementsFromPoint(event.clientX, event.clientY)
    .map((element) => element.closest?.("[data-priority-muscle]"))
    .find((element) => element && element !== draggedPriorityItem && element.parentElement === priorityList);
  if (!target || !priorityPlaceholder) return;

  const targetBox = target.getBoundingClientRect();
  const insertAfter = event.clientY > targetBox.top + targetBox.height / 2;
  const referenceNode = insertAfter ? target.nextSibling : target;
  if (referenceNode === priorityPlaceholder || priorityPlaceholder.nextSibling === referenceNode) return;

  animatePriorityShift(() => {
    priorityList.insertBefore(priorityPlaceholder, referenceNode);
  });
  updatePriorityRanks();
});

priorityList.addEventListener("pointerup", (event) => {
  if (pendingPriorityDrag?.pointerId === event.pointerId) cancelPendingPriorityDrag();
  if (!draggedPriorityItem) return;
  finishPriorityDrag(event.pointerId);
});

priorityList.addEventListener("pointercancel", (event) => {
  if (pendingPriorityDrag?.pointerId === event.pointerId) cancelPendingPriorityDrag();
  if (!draggedPriorityItem) return;
  finishPriorityDrag(event.pointerId);
});

function finishPriorityDrag(pointerId) {
  const item = draggedPriorityItem;
  item.releasePointerCapture?.(pointerId);
  if (priorityPlaceholder) {
    animatePriorityShift(() => {
      priorityList.insertBefore(item, priorityPlaceholder);
      item.classList.remove("is-dragging");
      item.removeAttribute("style");
      priorityPlaceholder.remove();
    });
  } else {
    item.classList.remove("is-dragging");
    item.removeAttribute("style");
  }
  draggedPriorityItem = null;
  priorityPlaceholder = null;
  priorityDragOffsetY = 0;
  pendingPriorityDrag = null;
  updatePriorityRanks();
  renderProfileSummaryFromControls();
}

function animatePriorityShift(mutator) {
  const movers = [...priorityList.querySelectorAll("[data-priority-muscle]")]
    .filter((item) => item !== draggedPriorityItem);
  const before = new Map(movers.map((item) => [item, item.getBoundingClientRect()]));

  mutator();

  movers.forEach((item) => {
    const previous = before.get(item);
    if (!previous) return;
    const next = item.getBoundingClientRect();
    const deltaY = previous.top - next.top;
    if (Math.abs(deltaY) < 1) return;
    item.animate(
      [
        { transform: `translateY(${deltaY}px)` },
        { transform: "translateY(0)" }
      ],
      {
        duration: 280,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)"
      }
    );
  });
}

document.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-view]");
  const swap = event.target.closest("[data-swap]");
  const complete = event.target.closest("[data-complete]");
  const setDone = event.target.closest("[data-set-done]");
  const restButton = event.target.closest("[data-rest-timer]");
  const deleteHistory = event.target.closest("[data-delete-history]");
  const viewOlder = event.target.closest("[data-view-older]");
  const customMenu = event.target.closest("[data-custom-menu]");

  if (restButton) {
    if (suppressRestTimerClick) {
      suppressRestTimerClick = false;
    } else {
      toggleRestTimer(restButton.dataset.restTimer, Number(restButton.dataset.restSeconds));
    }
    return;
  }
  if (tab) setView(tab.dataset.view);
  if (customMenu) openExerciseActions(customMenu.dataset.customMenu);
  if (viewOlder) {
    visibleHistoryMonths += 3;
    renderHistory();
  }
  if (swap) openSwapSheet(swap.dataset.swap);
  if (complete) {
    const exercise = state.workout?.exercises.find((item) => item.id === complete.dataset.complete);
    if (exercise) {
      ensureExerciseLog(exercise);
      exercise.completed = !exercise.completed;
      exercise.log.forEach((set) => {
        if (hasLoggedValues(set, exercise)) set.done = exercise.completed;
      });
      saveState();
    }
  }
  if (setDone) {
    const exercise = state.workout?.exercises.find((item) => item.id === setDone.dataset.setDone);
    const set = exercise?.log?.[Number(setDone.dataset.set)];
    if (set) {
      set.done = !set.done;
      exercise.completed = exercise.log.every((entry) => entry.done);
      saveState();
    }
  }
  if (deleteHistory) {
    const index = Number(deleteHistory.dataset.deleteHistory);
    const removed = state.history.splice(index, 1)[0];
    saveState();
    showToast("History entry deleted.", "Undo", () => {
      state.history.splice(index, 0, removed);
      saveState();
    });
  }
  if (event.target.id === "finish-button" && state.workout) {
    clearRestTimer(false);
    const loggedExercises = state.workout.exercises.map((exercise) => {
      ensureExerciseLog(exercise);
      return {
        id: exercise.id,
        name: exercise.name,
        muscle: exercise.muscle,
        logging: exercise.logging || "weight",
        noteSnapshot: getExerciseNote(exercise.id),
        completed: exercise.completed || exercise.log.some((set) => set.done),
        secondaryMuscles: secondaryMusclesForExercise(exercise),
        sets: exercise.log
          .filter((set) => hasLoggedValues(set, exercise) || set.done)
          .map((set) => {
            const savedSet = { done: set.done };
            logFieldsForExercise(exercise).forEach((field) => {
              savedSet[field.key] = set[field.key] ?? "";
            });
            return savedSet;
          })
      };
    });
    state.history.unshift({
      date: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      timestamp: Date.now(),
      focus: state.workout.focus,
      exerciseIds: state.workout.exercises.map((exercise) => exercise.id),
      exerciseNames: state.workout.exercises.map((exercise) => exercise.name),
      exercises: loggedExercises
    });
    state.workout = null;
    saveState();
    showToast("Workout logged.", null, null, 2600);
  }
});

const HISTORY_DELETE_WIDTH = 82;

document.addEventListener("pointerdown", (event) => {
  const button = event.target.closest("[data-rest-timer]");
  if (!button) return;
  restTimerHold = window.setTimeout(() => {
    suppressRestTimerClick = true;
    if (restTimer?.exerciseId === button.dataset.restTimer) {
      cancelRestTimer();
    }
  }, REST_TIMER_HOLD_MS);
});

document.addEventListener("pointerup", clearRestTimerHold);
document.addEventListener("pointercancel", clearRestTimerHold);
document.addEventListener("pointermove", (event) => {
  if (!restTimerHold) return;
  const button = event.target.closest("[data-rest-timer]");
  if (!button) clearRestTimerHold();
});

function clearRestTimerHold() {
  if (restTimerHold) clearTimeout(restTimerHold);
  restTimerHold = null;
}

document.addEventListener("pointerdown", (event) => {
  const row = event.target.closest("[data-history-row]");
  if (!row) return;
  row.dataset.startX = event.clientX;
  row.dataset.startY = event.clientY;
  row.dataset.startOffset = row.classList.contains("is-open") ? String(-HISTORY_DELETE_WIDTH) : "0";
  row.dataset.currentX = row.dataset.startOffset;
  row.dataset.swipeIntent = "pending";
  row.classList.add("is-swiping");
});

document.addEventListener("pointermove", (event) => {
  const row = document.querySelector(".swipe-row.is-swiping");
  if (!row?.classList.contains("is-swiping")) return;
  const startX = Number(row.dataset.startX);
  const startY = Number(row.dataset.startY);
  const startOffset = Number(row.dataset.startOffset || 0);
  const rawDeltaX = event.clientX - startX;
  const rawDeltaY = event.clientY - startY;
  const horizontal = Math.abs(rawDeltaX);
  const vertical = Math.abs(rawDeltaY);

  if (row.dataset.swipeIntent === "pending") {
    if (vertical > 8 && vertical > horizontal) {
      resetHistorySwipe(row);
      return;
    }
    if (horizontal < 22 || horizontal < vertical * 1.6) return;
    row.dataset.swipeIntent = "horizontal";
  }

  if (row.dataset.swipeIntent !== "horizontal") return;
  const delta = Math.min(0, Math.max(-HISTORY_DELETE_WIDTH, startOffset + rawDeltaX));
  row.dataset.currentX = String(delta);
  setHistorySwipePosition(row, delta);
});

document.addEventListener("pointerup", (event) => {
  const row = document.querySelector(".swipe-row.is-swiping");
  if (!row) return;
  const delta = Number(row.dataset.currentX || 0);
  const wasOpen = row.dataset.startOffset === String(-HISTORY_DELETE_WIDTH);
  const open = row.dataset.swipeIntent === "horizontal"
    ? delta < -(HISTORY_DELETE_WIDTH / 2)
    : wasOpen;
  row.classList.toggle("is-open", open);
  setHistorySwipePosition(row, open ? -HISTORY_DELETE_WIDTH : 0);
  resetHistorySwipe(row, true);
});

document.addEventListener("pointercancel", () => {
  const row = document.querySelector(".swipe-row.is-swiping");
  if (row) resetHistorySwipe(row);
});

function resetHistorySwipe(row, keepOpenState = false) {
  if (!keepOpenState) {
    row.classList.remove("is-open");
    setHistorySwipePosition(row, 0);
  }
  row.classList.remove("is-swiping");
  delete row.dataset.startX;
  delete row.dataset.startY;
  delete row.dataset.startOffset;
  delete row.dataset.currentX;
  delete row.dataset.swipeIntent;
}

function setHistorySwipePosition(row, delta) {
  const content = row.querySelector("[data-swipe-content]");
  if (!content) return;
  content.style.transform = delta ? `translateX(${delta}px)` : "";
}

function updateCompletionButtons(exercise) {
  const card = document.querySelector(`[data-complete="${exercise.id}"]`)?.closest(".exercise-card");
  if (!card) return;
  const completeButton = card.querySelector("[data-complete]");
  completeButton.classList.toggle("is-complete", exercise.completed);
  completeButton.textContent = exercise.completed ? "✓" : [...state.workout.exercises].findIndex((item) => item.id === exercise.id) + 1;
  card.querySelectorAll("[data-set-done]").forEach((button) => {
    const set = exercise.log[Number(button.dataset.set)];
    button.classList.toggle("is-complete", Boolean(set?.done));
  });
}

document.querySelector("#swap-today-button").addEventListener("click", () => swapExercise("today"));
document.querySelector("#swap-forever-button").addEventListener("click", () => swapExercise("forever"));
document.querySelector("#cancel-swap-button").addEventListener("click", closeSwapSheet);
swapBackdrop.addEventListener("click", (event) => {
  if (event.target === swapBackdrop) closeSwapSheet();
});
cancelWorkoutBackdrop.addEventListener("click", (event) => {
  if (event.target === cancelWorkoutBackdrop) closeCancelWorkoutSheet();
});
exerciseFormBackdrop.addEventListener("click", (event) => {
  if (event.target === exerciseFormBackdrop) closeExerciseForm();
});
exerciseActionsBackdrop.addEventListener("click", (event) => {
  if (event.target === exerciseActionsBackdrop) closeExerciseActions();
});
deleteExerciseBackdrop.addEventListener("click", (event) => {
  if (event.target === deleteExerciseBackdrop) closeDeleteExerciseConfirmation();
});
pageResetBackdrop.addEventListener("click", (event) => {
  if (event.target === pageResetBackdrop) closePageResetSheet();
});

renderAll();
setView("today");
