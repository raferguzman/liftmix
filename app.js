const muscles = ["Chest", "Back", "Legs", "Shoulders", "Arms", "Core"];
const equipmentOptions = ["Dumbbells", "Barbell", "Cables", "Machines", "Bodyweight", "Kettlebells"];
const RECOVERY_WINDOW_MS = 48 * 60 * 60 * 1000;
const defaultProfile = {
  priorities: { Arms: 6, Back: 5, Chest: 4, Core: 3, Legs: 2, Shoulders: 1 },
  priorityOrder: ["Arms", "Back", "Chest", "Core", "Legs", "Shoulders"],
  duration: 45,
  equipment: ["Dumbbells", "Cables", "Machines", "Bodyweight"]
};

let state = loadState();
let activeView = "today";
let pendingSwapId = null;
let visibleHistoryMonths = 3;
let exerciseStatusFilter = "all";
let exerciseSearchQuery = "";
let editingCustomExerciseId = null;
let selectedCustomExerciseId = null;

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
  profile.priorityOrder = getPriorityOrder(profile);
  profile.priorities = prioritiesFromOrder(profile.priorityOrder);
  const customExercises = Array.isArray(nextState.customExercises) ? nextState.customExercises : [];
  const exerciseNotes = nextState.exerciseNotes && typeof nextState.exerciseNotes === "object"
    ? nextState.exerciseNotes
    : {};
  return { ...nextState, profile, customExercises, exerciseNotes };
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

function renderProfileSummary() {
  const topPriorities = getPriorityOrder(state.profile).slice(0, 2).join(" + ");
  profileSummary.textContent = `${state.profile.duration} min · ${topPriorities}`;
}

function renderSettings() {
  priorityList.innerHTML = getPriorityOrder(state.profile).map((muscle, index) => `
    <div class="priority-item" data-priority-muscle="${muscle}">
      <span class="priority-rank">${index + 1}</span>
      <span class="priority-name">${muscle}</span>
      <button class="priority-drag" type="button" aria-label="Drag ${muscle} priority" title="Drag">☰</button>
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
  if (data.get("duration") !== "custom") return Number(data.get("duration"));
  const customValue = Number(data.get("customDuration"));
  return Math.min(120, Math.max(20, customValue || 40));
}

function renderCustomDuration() {
  const customSelected = document.querySelector("input[name='duration'][value='custom']")?.checked;
  customDurationRow.classList.toggle("is-visible", Boolean(customSelected));
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
        <p>Your saved settings stay ready. Tap Generate Workout when you get to the gym.</p>
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
          <span class="pill">${exercise.sets} x ${exercise.reps}</span>
          <span class="pill">${formatRestTime(exercise.rest)}</span>
        </div>
        ${renderExerciseNote(exercise)}
      </div>
      <button class="swap-button" data-swap="${exercise.id}" aria-label="Swap ${exercise.name}" title="Swap Exercise">
        <span class="swap-arrows" aria-hidden="true"><span>→</span><span>←</span></span>
      </button>
      <div class="set-log" aria-label="Log sets for ${exercise.name}">
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

function renderExerciseNote(exercise, location = "workout") {
  const note = getExerciseNote(exercise.id);
  return `
    <label class="exercise-note ${location === "library" ? "is-library-note" : ""}">
      <span>Your note <small data-note-count="${exercise.id}">${note.length}/140</small></span>
      <textarea
        data-exercise-note="${exercise.id}"
        maxlength="140"
        rows="2"
        aria-label="Your note for ${escapeHtml(exercise.name)}"
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

  return exercises.map((exercise) => `
    <div class="history-exercise">
      <span>${exercise.name}</span>
      <small>${formatHistorySets(exercise.sets, exercise.logging)}</small>
      ${exercise.noteSnapshot ? `<p class="history-note"><strong>Note:</strong> ${escapeHtml(exercise.noteSnapshot)}</p>` : ""}
    </div>
  `).join("");
}

function formatHistorySets(sets = [], logging = "weight") {
  const exercise = { logging };
  const logged = sets.filter((set) => hasLoggedValues(set, exercise));
  if (!logged.length) return "No sets logged";
  return logged.map((set) => formatLoggedSet(set, logging)).join(" · ");
}

function generateWorkout() {
  const profile = state.profile;
  const targetDuration = profile.duration;
  const timeBudget = workoutTimeBudget(targetDuration);
  const minimumMinutes = workoutMinimumMinutes(targetDuration);
  const maxMoves = Math.min(18, Math.max(2, Math.ceil(targetDuration / 7)));
  const pool = getExerciseLibrary().filter((exercise) => {
    return profile.equipment.includes(exercise.equipment) && !state.excluded.includes(exercise.id);
  });
  const recovery = muscleRecoveryStatus();
  const recoveredPool = pool.filter((exercise) => (recovery[exercise.muscle] || 0) < 1);
  const generationPool = recoveredPool.length ? recoveredPool : [...pool].sort((a, b) => {
    return exerciseRecoveryBurden(a, recovery) - exerciseRecoveryBurden(b, recovery);
  });

  const recentNames = new Set(state.history.slice(0, 3).flatMap((item) => item.exerciseIds));
  const musclePlan = buildMusclePlan(profile, generationPool, recovery, maxMoves);
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
      timeBudget - estimatedMinutes
    );
    if (prescribed) {
      chosen.push(prescribed);
      estimatedMinutes += estimatedExerciseMinutes(prescribed);
    }
  });

  const fillOrder = [...musclePlan, ...rankAvailableMuscles(profile, generationPool, recovery)]
    .filter((muscle, index, list) => list.indexOf(muscle) === index);

  let madeProgress = true;
  while (chosen.length < maxMoves && estimatedMinutes < minimumMinutes && madeProgress) {
    madeProgress = false;
    const rankedFillOrder = [...fillOrder].sort((a, b) => {
      const countA = chosen.filter((exercise) => exercise.muscle === a).length;
      const countB = chosen.filter((exercise) => exercise.muscle === b).length;
      return countA - countB;
    });

    for (const muscle of rankedFillOrder) {
      const prescribed = chooseExerciseForMuscle(
        muscle,
        generationPool,
        chosen,
        recentNames,
        recovery,
        timeBudget - estimatedMinutes
      );
      if (prescribed) {
        chosen.push(prescribed);
        estimatedMinutes += estimatedExerciseMinutes(prescribed);
        madeProgress = true;
        break;
      }
    }
  }

  estimatedMinutes = extendWorkoutTowardMinimum(
    chosen,
    estimatedMinutes,
    minimumMinutes,
    timeBudget
  );

  const focus = topMuscles(chosen).slice(0, 2).join(" + ") || "Balanced";
  state.workout = {
    id: Date.now(),
    duration: `${targetDuration}m`,
    focus,
    exercises: chosen
  };
  saveState();
}

function buildMusclePlan(profile, pool, recovery, maxMoves) {
  const ranked = rankAvailableMuscles(profile, pool, recovery);
  const targetGroups = Math.min(ranked.length, maxMoves, targetMuscleGroupCount(profile.duration));
  if (targetGroups <= 1) return ranked.slice(0, targetGroups);

  const prioritySlots = Math.max(1, targetGroups - 1);
  const plan = ranked.slice(0, prioritySlots);
  const rotationCandidates = ranked.slice(prioritySlots);
  const rotatingMuscle = weightedMuscleChoice(rotationCandidates, profile, recovery);
  if (rotatingMuscle) plan.push(rotatingMuscle);
  return plan;
}

function targetMuscleGroupCount(duration) {
  if (duration <= 20) return 2;
  if (duration <= 30) return 3;
  if (duration <= 45) return 4;
  if (duration <= 60) return 5;
  return 6;
}

function rankAvailableMuscles(profile, pool, recovery) {
  return muscles
    .filter((muscle) => pool.some((exercise) => exercise.muscle === muscle))
    .sort((a, b) => {
      const scoreA = (profile.priorities[a] || 0) * 10 - (recovery[a] || 0) * 30;
      const scoreB = (profile.priorities[b] || 0) * 10 - (recovery[b] || 0) * 30;
      return scoreB - scoreA;
    });
}

function weightedMuscleChoice(candidates, profile, recovery) {
  if (!candidates.length) return null;
  const weighted = candidates.map((muscle) => ({
    muscle,
    weight: Math.max(1, Math.pow(profile.priorities[muscle] || 1, 2) * (1 - (recovery[muscle] || 0) * 0.75))
  }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of weighted) {
    roll -= item.weight;
    if (roll <= 0) return item.muscle;
  }
  return weighted.at(-1).muscle;
}

function chooseExerciseForMuscle(muscle, pool, chosen, recentNames, recovery, minutesAvailable) {
  const candidates = pool
    .filter((exercise) => exercise.muscle === muscle)
    .filter((exercise) => !chosen.some((picked) => picked.id === exercise.id))
    .map((exercise) => withPrescription(exercise))
    .filter((exercise) => {
      return estimatedExerciseMinutes(exercise) <= minutesAvailable
        && canAddExercise(chosen, exercise);
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
  const fresh = shuffleArray(durationPool.filter((exercise) => !recentNames.has(exercise.id)));
  const recent = shuffleArray(durationPool.filter((exercise) => recentNames.has(exercise.id)));
  return fresh[0] || recent[0] || null;
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

function exerciseRecoveryBurden(exercise, recovery) {
  const primaryBurden = (recovery[exercise.muscle] || 0) * 100;
  const secondaryBurden = secondaryMusclesForExercise(exercise)
    .reduce((total, muscle) => total + (recovery[muscle] || 0) * 30, 0);
  return primaryBurden + secondaryBurden;
}

function workoutTimeBudget(targetDuration) {
  return Math.max(12, targetDuration);
}

function workoutMinimumMinutes(targetDuration) {
  return workoutTimeBudget(targetDuration) * 0.92;
}

function estimatedExerciseMinutes(exercise) {
  const workSecondsPerSet = exercise.logging === "duration"
    ? 45
    : exercise.style === "compound" ? 45 : 35;
  const workSeconds = exercise.sets * workSecondsPerSet;
  const restSeconds = Math.max(0, exercise.sets - 1) * exercise.rest;
  const setupSeconds = exercise.style === "compound" ? 90 : 45;
  const transitionSeconds = 45;
  return (workSeconds + restSeconds + setupSeconds + transitionSeconds) / 60;
}

function addedSetMinutes(exercise) {
  const workSeconds = exercise.logging === "duration"
    ? 45
    : exercise.style === "compound" ? 45 : 35;
  return (workSeconds + exercise.rest) / 60;
}

function extendWorkoutTowardMinimum(exercises, currentMinutes, minimumMinutes, timeBudget) {
  let estimatedMinutes = currentMinutes;

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
      .filter(({ addedMinutes }) => estimatedMinutes + addedMinutes <= timeBudget)
      .sort((a, b) => {
        const distanceA = Math.abs(minimumMinutes - (estimatedMinutes + a.addedMinutes));
        const distanceB = Math.abs(minimumMinutes - (estimatedMinutes + b.addedMinutes));
        return distanceA - distanceB;
      });

    const best = candidates[0];
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

function canAddExercise(chosen, candidate) {
  const sameMuscle = chosen.filter((exercise) => exercise.muscle === candidate.muscle);
  const directSets = sameMuscle.reduce((total, exercise) => total + exercise.sets, 0) + candidate.sets;
  const directSetLimit = state.profile.duration > 75 ? 10 : 7;
  const exerciseLimit = state.profile.duration > 105 ? 3 : 2;
  if (sameMuscle.length >= exerciseLimit || directSets > directSetLimit) return false;

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
  const fatigueLimit = state.profile.duration > 105 ? 7 : 5;
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
  const shortWorkout = state.profile.duration <= 30;
  const longWorkout = state.profile.duration > 75 && state.profile.duration <= 105;
  const sets = shortWorkout
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
    .map((set) => formatLoggedSet(set, exercise.logging))
    .join(" · ");
  return `<strong>Last:</strong> ${sets || "no completed sets"}`;
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
    state.workout.exercises[index] = replacement;
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
    });
  } else {
    showToast(replacement ? `Swapped to ${replacement.name}.` : "No close alternative found.");
  }
}

function findReplacement(original) {
  const unavailable = new Set([
    original.id,
    ...state.excluded,
    ...(state.workout?.exercises || []).map((exercise) => exercise.id)
  ]);
  const pool = getExerciseLibrary().filter((exercise) => {
    return state.profile.equipment.includes(exercise.equipment) && !unavailable.has(exercise.id);
  });

  const otherExercises = state.workout.exercises.filter((exercise) => exercise.id !== original.id);
  const currentMinutes = otherExercises.reduce((total, exercise) => total + estimatedExerciseMinutes(exercise), 0);
  const timeBudget = workoutTimeBudget(state.profile.duration);
  const candidates = [
    ...pool.filter((exercise) => exercise.muscle === original.muscle && exercise.pattern === original.pattern),
    ...pool.filter((exercise) => exercise.muscle === original.muscle && exercise.style === original.style),
    ...pool.filter((exercise) => exercise.muscle === original.muscle),
    ...pool
  ].filter((exercise, index, list) => list.findIndex((item) => item.id === exercise.id) === index);

  return candidates
    .map((exercise) => withPrescription(exercise))
    .find((exercise) => {
      return currentMinutes + estimatedExerciseMinutes(exercise) <= timeBudget
        && canAddExercise(otherExercises, exercise);
    });
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

function cancelWorkoutWithoutSaving() {
  state.workout = null;
  closeCancelWorkoutSheet();
  saveState();
  showCenterNotice("Workout canceled", "Nothing was saved to History.");
}

function showCenterNotice(titleText, messageText) {
  centerNoticeTitle.textContent = titleText;
  centerNoticeMessage.textContent = messageText;
  centerNotice.hidden = false;
  requestAnimationFrame(() => centerNotice.classList.add("is-visible"));
  clearTimeout(showCenterNotice.timer);
  showCenterNotice.timer = setTimeout(() => {
    centerNotice.classList.remove("is-visible");
    setTimeout(() => {
      centerNotice.hidden = true;
    }, 180);
  }, 2200);
}

function showToast(message, actionLabel, action) {
  toast.innerHTML = `${message}${actionLabel ? ` <button type="button">${actionLabel}</button>` : ""}`;
  toast.classList.add("is-visible");
  if (actionLabel) {
    toast.querySelector("button").addEventListener("click", () => {
      toast.classList.remove("is-visible");
      action();
    }, { once: true });
  }
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 3600);
}

function randomIndex(length) {
  return Math.floor(Math.random() * length);
}

document.querySelector("#generate-button").addEventListener("click", generateWorkout);
document.querySelector("#keep-workout-button").addEventListener("click", closeCancelWorkoutSheet);
document.querySelector("#confirm-cancel-workout-button").addEventListener("click", cancelWorkoutWithoutSaving);
document.querySelector("#add-exercise-button").addEventListener("click", () => openExerciseForm());
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
document.querySelector("#page-reset-button").addEventListener("click", () => {
  if (activeView === "today" && state.workout) {
    openCancelWorkoutSheet();
    return;
  }
  openPageResetSheet();
});
document.querySelector("#keep-page-settings-button").addEventListener("click", closePageResetSheet);
document.querySelector("#confirm-page-reset-button").addEventListener("click", resetCurrentPage);
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
    set.done = hasCompleteLog(set, exercise);
    exercise.completed = exercise.log.every((entry) => entry.done);
    persistState();
    updateCompletionButtons(exercise);
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
    document.querySelectorAll("[data-note-count]").forEach((counter) => {
      if (counter.dataset.noteCount === exerciseId) counter.textContent = `${note.length}/140`;
    });
    persistState();
  }
});

document.addEventListener("change", (event) => {
  if (event.target.matches("input[name='duration']")) {
    renderCustomDuration();
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

priorityList.addEventListener("pointerdown", (event) => {
  const item = event.target.closest("[data-priority-muscle]");
  if (!item) return;
  const box = item.getBoundingClientRect();
  draggedPriorityItem = item;
  priorityDragOffsetY = event.clientY - box.top;
  priorityPlaceholder = document.createElement("div");
  priorityPlaceholder.className = "priority-placeholder";
  priorityPlaceholder.style.height = `${box.height}px`;
  priorityList.insertBefore(priorityPlaceholder, item.nextSibling);
  item.classList.add("is-dragging");
  item.style.position = "fixed";
  item.style.left = `${box.left}px`;
  item.style.top = `${box.top}px`;
  item.style.width = `${box.width}px`;
  item.style.zIndex = "30";
  item.setPointerCapture?.(event.pointerId);
});

priorityList.addEventListener("pointermove", (event) => {
  if (!draggedPriorityItem) return;
  event.preventDefault();
  draggedPriorityItem.style.top = `${event.clientY - priorityDragOffsetY}px`;

  const target = document.elementsFromPoint(event.clientX, event.clientY)
    .map((element) => element.closest?.("[data-priority-muscle]"))
    .find((element) => element && element !== draggedPriorityItem && element.parentElement === priorityList);
  if (!target || !priorityPlaceholder) return;

  const targetBox = target.getBoundingClientRect();
  const insertAfter = event.clientY > targetBox.top + targetBox.height / 2;
  priorityList.insertBefore(priorityPlaceholder, insertAfter ? target.nextSibling : target);
  updatePriorityRanks();
});

priorityList.addEventListener("pointerup", (event) => {
  if (!draggedPriorityItem) return;
  finishPriorityDrag(event.pointerId);
});

priorityList.addEventListener("pointercancel", (event) => {
  if (!draggedPriorityItem) return;
  finishPriorityDrag(event.pointerId);
});

function finishPriorityDrag(pointerId) {
  const item = draggedPriorityItem;
  if (priorityPlaceholder) {
    priorityList.insertBefore(item, priorityPlaceholder);
    priorityPlaceholder.remove();
  }
  item.releasePointerCapture?.(pointerId);
  item.classList.remove("is-dragging");
  item.removeAttribute("style");
  draggedPriorityItem = null;
  priorityPlaceholder = null;
  priorityDragOffsetY = 0;
  updatePriorityRanks();
}

document.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-view]");
  const swap = event.target.closest("[data-swap]");
  const complete = event.target.closest("[data-complete]");
  const setDone = event.target.closest("[data-set-done]");
  const deleteHistory = event.target.closest("[data-delete-history]");
  const viewOlder = event.target.closest("[data-view-older]");
  const customMenu = event.target.closest("[data-custom-menu]");

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
    showToast("Workout logged.");
  }
});

document.addEventListener("pointerdown", (event) => {
  const row = event.target.closest("[data-history-row]");
  if (!row) return;
  row.dataset.startX = event.clientX;
  row.dataset.currentX = "0";
  row.classList.add("is-swiping");
});

document.addEventListener("pointermove", (event) => {
  const row = event.target.closest("[data-history-row]");
  if (!row?.classList.contains("is-swiping")) return;
  const startX = Number(row.dataset.startX);
  const delta = Math.min(0, Math.max(-92, event.clientX - startX));
  row.dataset.currentX = String(delta);
  row.querySelector("[data-swipe-content]").style.transform = `translateX(${delta}px)`;
});

document.addEventListener("pointerup", (event) => {
  const row = document.querySelector(".swipe-row.is-swiping");
  if (!row) return;
  const delta = Number(row.dataset.currentX || 0);
  const open = delta < -42;
  row.classList.toggle("is-open", open);
  row.querySelector("[data-swipe-content]").style.transform = open ? "translateX(-82px)" : "";
  row.classList.remove("is-swiping");
});

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
