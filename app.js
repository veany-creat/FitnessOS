(() => {
  "use strict";

  const APP_KEY = "fitnessOS.v2";
  const TASKS = [
    { id: "water", title: "喝水500ml" },
    { id: "posture", title: "20分钟体态练习" },
    { id: "breakfast", title: "早餐完成" },
    { id: "lunch", title: "午餐按规则" },
    { id: "gym", title: "晚上健身房" },
    { id: "recovery", title: "训练后补充" },
    { id: "no-snack", title: "不吃高热量夜宵" },
    { id: "sleep", title: "保证睡眠" },
  ];
  const TAB_ORDER = ["today", "food", "posture", "progress"];
  const LEGACY_ROOT_KEYS = ["fitnessOS", "fitnessOSData", "fitnessData", "fitness-os-data"];
  const LEGACY_WEIGHT_KEYS = ["weightHistory", "weightRecords", "fitnessOSWeightHistory"];
  const LEGACY_TASK_KEYS = ["completedTasks", "fitnessOSTasks", "todayTasks"];

  const els = {
    progressValue: document.querySelector("#progress-value"),
    progressLabel: document.querySelector("#progress-ring-label"),
    ringParts: document.querySelectorAll(".ring-progress, .ring-glow, .ring-highlight"),
    streak: document.querySelector("#streak-count"),
    taskCount: document.querySelector("#task-count"),
    taskList: document.querySelector("#task-list"),
    tabBar: document.querySelector(".tab-bar"),
    tabs: document.querySelectorAll(".tab-button"),
    pages: document.querySelectorAll(".page"),
    challengeCount: document.querySelector("#challenge-count"),
    challengeDays: document.querySelector("#challenge-days"),
    rewardNote: document.querySelector("#reward-note"),
    weightForm: document.querySelector("#weight-form"),
    weightInput: document.querySelector("#weight-input"),
    weightHistory: document.querySelector("#weight-history"),
    historyCount: document.querySelector("#history-count"),
    toast: document.querySelector("#toast"),
  };

  let state = loadState();
  let toastTimer = null;

  function createDefaultState() {
    return { version: 2, days: {}, weights: [], lastTab: "today" };
  }

  function safeParse(raw) {
    if (!raw || typeof raw !== "string") return null;
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.warn("Fitness OS: 忽略无法解析的本地数据。", error);
      return null;
    }
  }

  function readStorage(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.warn("Fitness OS: 本地存储当前不可用。", error);
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.warn("Fitness OS: 无法保存本地数据。", error);
      showToast("暂时无法保存，请检查浏览器设置");
      return false;
    }
  }

  function loadState() {
    const saved = safeParse(readStorage(APP_KEY));
    if (saved && saved.version === 2) return normalizeState(saved);

    const migrated = createDefaultState();
    for (const key of LEGACY_ROOT_KEYS) {
      const legacy = safeParse(readStorage(key));
      if (legacy) mergeLegacyData(migrated, legacy);
    }
    mergeStandaloneLegacyData(migrated);
    const normalized = normalizeState(migrated);
    writeStorage(APP_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function normalizeState(value) {
    const normalized = createDefaultState();
    if (value && typeof value === "object") {
      if (value.days && typeof value.days === "object" && !Array.isArray(value.days)) {
        for (const [date, day] of Object.entries(value.days)) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !day || typeof day !== "object") continue;
          const completedTaskIds = Array.isArray(day.completedTaskIds)
            ? [...new Set(day.completedTaskIds.filter((id) => TASKS.some((task) => task.id === id)))]
            : [];
          normalized.days[date] = {
            completedTaskIds,
            completed: Boolean(day.completed || completedTaskIds.length === TASKS.length),
            updatedAt: typeof day.updatedAt === "string" ? day.updatedAt : new Date().toISOString(),
          };
        }
      }
      const weights = Array.isArray(value.weights) ? value.weights : [];
      normalized.weights = weights
        .map(normalizeWeightEntry)
        .filter(Boolean)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 100);
      normalized.lastTab = TAB_ORDER.includes(value.lastTab) ? value.lastTab : "today";
    }
    return normalized;
  }

  function mergeLegacyData(target, legacy) {
    if (!legacy || typeof legacy !== "object") return;
    const today = getDateKey(new Date());
    const legacyTasks = legacy.completedTaskIds || legacy.completedTasks || legacy.tasks;
    const ids = normalizeLegacyTasks(legacyTasks);
    if (ids.length) {
      target.days[today] = {
        completedTaskIds: ids,
        completed: ids.length === TASKS.length,
        updatedAt: new Date().toISOString(),
      };
    }

    const legacyWeights = legacy.weights || legacy.weightHistory || legacy.weightRecords;
    if (Array.isArray(legacyWeights)) target.weights.push(...legacyWeights.map(normalizeWeightEntry).filter(Boolean));

    const completedDates = legacy.completedDates || legacy.challengeDays || legacy.streakDates;
    if (Array.isArray(completedDates)) {
      completedDates.forEach((dateLike) => {
        const date = normalizeDateKey(dateLike);
        if (date) {
          target.days[date] = {
            completedTaskIds: TASKS.map((task) => task.id),
            completed: true,
            updatedAt: new Date().toISOString(),
          };
        }
      });
    }
  }

  function mergeStandaloneLegacyData(target) {
    for (const key of LEGACY_TASK_KEYS) {
      const parsed = safeParse(readStorage(key));
      const ids = normalizeLegacyTasks(parsed);
      if (ids.length) {
        const date = getDateKey(new Date());
        target.days[date] = {
          completedTaskIds: ids,
          completed: ids.length === TASKS.length,
          updatedAt: new Date().toISOString(),
        };
        break;
      }
    }
    for (const key of LEGACY_WEIGHT_KEYS) {
      const parsed = safeParse(readStorage(key));
      if (Array.isArray(parsed)) target.weights.push(...parsed.map(normalizeWeightEntry).filter(Boolean));
    }
  }

  function normalizeLegacyTasks(value) {
    if (Array.isArray(value)) {
      if (value.every((item) => typeof item === "boolean")) {
        return TASKS.filter((_, index) => value[index]).map((task) => task.id);
      }
      return [...new Set(value.flatMap((item, index) => {
        if (typeof item === "string") {
          const byId = TASKS.find((task) => task.id === item);
          const byTitle = TASKS.find((task) => task.title === item);
          return byId ? [byId.id] : byTitle ? [byTitle.id] : [];
        }
        if (item && typeof item === "object" && (item.completed || item.done || item.checked)) {
          const id = item.id || item.key;
          const task = TASKS.find((entry) => entry.id === id || entry.title === item.title) || TASKS[index];
          return task ? [task.id] : [];
        }
        return [];
      }))];
    }
    if (value && typeof value === "object") {
      return TASKS.filter((task, index) => value[task.id] || value[task.title] || value[index]).map((task) => task.id);
    }
    return [];
  }

  function normalizeWeightEntry(entry) {
    const rawValue = typeof entry === "number" || typeof entry === "string"
      ? entry
      : entry && (entry.value ?? entry.weight ?? entry.jin);
    const value = Number.parseFloat(rawValue);
    if (!Number.isFinite(value) || value < 60 || value > 400) return null;
    const rawTimestamp = entry && typeof entry === "object" ? (entry.timestamp || entry.date || entry.createdAt) : null;
    const parsedDate = rawTimestamp ? new Date(rawTimestamp) : new Date();
    const timestamp = Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();
    return {
      id: entry && typeof entry === "object" && entry.id ? String(entry.id) : `${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
      value: Math.round(value * 10) / 10,
      timestamp,
    };
  }

  function normalizeDateKey(value) {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : getDateKey(date);
  }

  function getDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function offsetDate(date, amount) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + amount);
    return copy;
  }

  function getTodayData() {
    const key = getDateKey(new Date());
    if (!state.days[key]) {
      state.days[key] = { completedTaskIds: [], completed: false, updatedAt: new Date().toISOString() };
    }
    return state.days[key];
  }

  function saveState() {
    state.version = 2;
    writeStorage(APP_KEY, JSON.stringify(state));
  }

  function render() {
    renderTasks();
    renderTodayProgress();
    renderChallenge();
    renderWeightHistory();
  }

  function renderTasks() {
    const completed = new Set(getTodayData().completedTaskIds);
    els.taskList.replaceChildren(...TASKS.map((task) => {
      const button = document.createElement("button");
      const isComplete = completed.has(task.id);
      button.type = "button";
      button.className = `task-item${isComplete ? " is-complete" : ""}`;
      button.dataset.taskId = task.id;
      button.setAttribute("aria-pressed", String(isComplete));
      button.setAttribute("aria-label", `${isComplete ? "取消完成" : "标记完成"}：${task.title}`);
      button.innerHTML = `
        <span class="task-check" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="m4.5 10.2 3.2 3.2 7.8-7.7" /></svg></span>
        <span class="task-title">${task.title}</span>
        <span class="task-status" aria-hidden="true">完成</span>`;
      return button;
    }));
  }

  function renderTodayProgress() {
    const done = getTodayData().completedTaskIds.length;
    const percent = Math.round((done / TASKS.length) * 100);
    const circumference = 2 * Math.PI * 48;
    const offset = circumference * (1 - percent / 100);
    els.progressValue.textContent = String(percent);
    els.progressLabel.setAttribute("aria-label", `今日完成 ${percent}%`);
    els.ringParts.forEach((circle) => { circle.style.strokeDashoffset = String(offset); });
    els.taskCount.textContent = `${done} / ${TASKS.length}`;
    els.streak.textContent = String(calculateStreak());
  }

  function calculateStreak() {
    let cursor = new Date();
    const todayKey = getDateKey(cursor);
    if (!state.days[todayKey]?.completed) cursor = offsetDate(cursor, -1);
    let streak = 0;
    while (streak < 3650 && state.days[getDateKey(cursor)]?.completed) {
      streak += 1;
      cursor = offsetDate(cursor, -1);
    }
    return streak;
  }

  function getRecentSevenDays() {
    const today = new Date();
    return Array.from({ length: 7 }, (_, index) => offsetDate(today, index - 6));
  }

  function renderChallenge() {
    const days = getRecentSevenDays();
    const weekNames = ["日", "一", "二", "三", "四", "五", "六"];
    const completedCount = days.filter((date) => state.days[getDateKey(date)]?.completed).length;
    els.challengeCount.textContent = String(completedCount);
    els.challengeDays.replaceChildren(...days.map((date) => {
      const key = getDateKey(date);
      const completed = Boolean(state.days[key]?.completed);
      const today = key === getDateKey(new Date());
      const item = document.createElement("div");
      item.className = `challenge-day${completed ? " is-complete" : ""}${today ? " is-today" : ""}`;
      item.setAttribute("aria-label", `${date.getMonth() + 1}月${date.getDate()}日，${completed ? "已完成" : "未完成"}${today ? "，今天" : ""}`);
      item.innerHTML = `<abbr title="星期${weekNames[date.getDay()]}">周${weekNames[date.getDay()]}</abbr><span class="day-orb"><span class="day-number">${date.getDate()}</span></span>`;
      return item;
    }));
    els.rewardNote.hidden = calculateStreak() < 7;
  }

  function renderWeightHistory() {
    els.historyCount.textContent = `${state.weights.length} 条`;
    if (!state.weights.length) {
      const empty = document.createElement("p");
      empty.className = "history-empty";
      empty.textContent = "保存第一次记录后，变化会显示在这里。";
      els.weightHistory.replaceChildren(empty);
      return;
    }
    const formatter = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" });
    const timeFormatter = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
    els.weightHistory.replaceChildren(...state.weights.map((entry) => {
      const date = new Date(entry.timestamp);
      const row = document.createElement("div");
      row.className = "weight-row";
      row.innerHTML = `<time datetime="${entry.timestamp}">${formatter.format(date)}<span>${timeFormatter.format(date)}</span></time><strong>${entry.value.toFixed(1)}<small>斤</small></strong>`;
      return row;
    }));
  }

  function toggleTask(taskId) {
    const today = getTodayData();
    const completed = new Set(today.completedTaskIds);
    const wasComplete = completed.has(taskId);
    if (wasComplete) completed.delete(taskId);
    else completed.add(taskId);
    today.completedTaskIds = TASKS.map((task) => task.id).filter((id) => completed.has(id));
    today.completed = today.completedTaskIds.length === TASKS.length;
    today.updatedAt = new Date().toISOString();
    saveState();
    renderTasks();
    renderTodayProgress();
    renderChallenge();
    haptic(8);
    if (today.completed) showToast("今日清单全部完成");
  }

  function switchTab(tab, options = {}) {
    if (!TAB_ORDER.includes(tab)) tab = "today";
    const index = TAB_ORDER.indexOf(tab);
    els.tabBar.style.setProperty("--tab-index", String(index));
    els.tabs.forEach((button) => {
      const active = button.dataset.tab === tab;
      button.classList.toggle("is-active", active);
      button.toggleAttribute("aria-current", active);
      if (active) button.setAttribute("aria-current", "page");
    });
    els.pages.forEach((page) => {
      const active = page.dataset.page === tab;
      page.hidden = !active;
      page.classList.toggle("is-active", active);
    });
    state.lastTab = tab;
    saveState();
    if (!options.preserveScroll) window.scrollTo({ top: 0, behavior: "auto" });
    if (!options.skipHistory) {
      try { history.replaceState(null, "", `#${tab}`); } catch (_) { /* 页面仍可正常使用 */ }
    }
    if (options.feedback) haptic(5);
  }

  function saveWeight(event) {
    event.preventDefault();
    const value = Number.parseFloat(els.weightInput.value);
    if (!Number.isFinite(value) || value < 60 || value > 400) {
      els.weightInput.setAttribute("aria-invalid", "true");
      els.weightInput.focus();
      showToast("请输入 60–400 斤之间的体重");
      return;
    }
    els.weightInput.removeAttribute("aria-invalid");
    state.weights.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      value: Math.round(value * 10) / 10,
      timestamp: new Date().toISOString(),
    });
    state.weights = state.weights.slice(0, 100);
    saveState();
    els.weightForm.reset();
    renderWeightHistory();
    haptic(8);
    showToast("体重已保存");
  }

  function showToast(message) {
    if (!els.toast) return;
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => els.toast.classList.remove("is-visible"), 2200);
  }

  function haptic(duration) {
    try {
      if (typeof navigator.vibrate === "function") navigator.vibrate(duration);
    } catch (_) {
      // 触觉反馈不是核心功能，失败时静默降级。
    }
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js", { scope: "./" }).catch((error) => {
        console.warn("Fitness OS: 离线服务注册失败，页面仍可正常使用。", error);
      });
    });
  }

  els.taskList.addEventListener("click", (event) => {
    const button = event.target.closest(".task-item");
    if (button) toggleTask(button.dataset.taskId);
  });
  els.tabs.forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.tab, { feedback: true })));
  els.weightForm.addEventListener("submit", saveWeight);

  const requestedTab = window.location.hash.slice(1);
  const initialTab = TAB_ORDER.includes(requestedTab) ? requestedTab : state.lastTab;
  render();
  switchTab(initialTab, { skipHistory: true, preserveScroll: true });
  registerServiceWorker();
})();
