(function () {
  const KEY = "zhospar_tasks_v2";
  const CAL_KEY = "zhospar_calendar_v1";
  const LANG_KEY = "zhospar_lang";
  const THEME_KEY = "zhospar_theme";

  const defaults = [
    { id: "t1", title: "Таңғы жүгіру", start: 7, end: 8 },
    { id: "t2", title: "Дәріс", start: 9, end: 11 },
    { id: "t3", title: "Кездесу", start: 10, end: 12 },
    { id: "t4", title: "Кітапхана", start: 13, end: 15 },
  ];
  const studentDay = [
    { id: "s1", title: "Таңғы ас", start: 8, end: 8.5 },
    { id: "s2", title: "Дәріс 1", start: 9, end: 11 },
    { id: "s3", title: "Дәріс 2", start: 10.5, end: 12 },
    { id: "s4", title: "Түскі ас", start: 12, end: 13 },
    { id: "s5", title: "Практика", start: 14, end: 16 },
    { id: "s6", title: "Доспен кездесу", start: 15, end: 17 },
  ];
  const workDay = [
    { id: "w1", title: "Планерка", start: 9, end: 10 },
    { id: "w2", title: "Клиент қоңырауы", start: 9.5, end: 11 },
    { id: "w3", title: "Фокус-жұмыс", start: 11, end: 13 },
    { id: "w4", title: "Түскі үзіліс", start: 13, end: 14 },
    { id: "w5", title: "Код ревью", start: 14, end: 15.5 },
    { id: "w6", title: "Жаттығу", start: 18, end: 19.5 },
  ];

  let lang = localStorage.getItem(LANG_KEY) || "kk";
  let theme = localStorage.getItem(THEME_KEY) || "light";
  let animTimer = null;
  let animSteps = [];
  let animIndex = 0;
  let animPlaying = false;
  let idSeq = Date.now();
  let calCursor = new Date();
  let selectedCalDate = dateKey(new Date());
  let calendarMap = loadCalendar();
  let activeDate = selectedCalDate;
  let tasks = (calendarMap[activeDate] || defaults).map((x) => ({ ...x }));

  const formMsg = document.getElementById("formMsg");
  const empty = document.getElementById("emptyState");
  const taskBody = document.getElementById("taskBody");
  const resCount = document.getElementById("resCount");
  const resList = document.getElementById("resList");
  const timeline = document.getElementById("timeline");
  const menuToggle = document.getElementById("menuToggle");
  const menuOverlay = document.getElementById("menuOverlay");
  const navEl = document.getElementById("mainNav");
  const langSelect = document.getElementById("langSelect");
  const langSelectDrawer = document.getElementById("langSelectDrawer");
  const themeToggle = document.getElementById("themeToggle");
  const themeToggleDrawer = document.getElementById("themeToggleDrawer");

  function t(key, vars) {
    const pack = (window.ZHOSPAR_I18N && window.ZHOSPAR_I18N[lang]) || window.ZHOSPAR_I18N.kk;
    let s = (pack && pack[key]) || key;
    if (vars) {
      Object.keys(vars).forEach((k) => {
        s = s.replace(new RegExp("\\{" + k + "\\}", "g"), String(vars[k]));
      });
    }
    return s;
  }

  function applyI18n() {
    document.documentElement.lang = lang === "kk" ? "kk" : lang;
    document.title = t("docTitle");
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
    });
    langSelect.value = lang;
    langSelectDrawer.value = lang;
    updateThemeButtons();
    updateDateLine();
    renderList();
    solve();
    if (document.querySelector('.page[data-page="how"].is-active')) resetLab();
    if (document.querySelector('.page[data-page="why"].is-active')) drawGrowthChart(tasks.length || 6);
    if (document.querySelector('.page[data-page="stats"].is-active')) renderStats();
    if (document.querySelector('.page[data-page="calendar"].is-active')) renderCalendar();
  }

  function setLang(next) {
    lang = ["kk", "ru", "en"].includes(next) ? next : "kk";
    localStorage.setItem(LANG_KEY, lang);
    applyI18n();
  }

  function applyTheme() {
    const isDark = theme === "dark";
    const color = isDark ? "#0a1220" : "#c5d8ec";
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.style.backgroundColor = color;
    document.body.style.backgroundColor = color;
    const meta = document.getElementById("metaTheme");
    if (meta) meta.setAttribute("content", color);
    updateThemeButtons();
  }

  function updateThemeButtons() {
    const isDark = theme === "dark";
    [themeToggle, themeToggleDrawer].forEach((btn) => {
      if (!btn) return;
      const icon = btn.querySelector(".theme-icon");
      const text = btn.querySelector(".theme-text");
      if (icon) icon.textContent = isDark ? "☀" : "☾";
      if (text) text.textContent = isDark ? t("themeLight") : t("themeDark");
      btn.setAttribute("aria-label", isDark ? t("themeLight") : t("themeDark"));
    });
    [document.getElementById("refreshBtn"), document.getElementById("refreshBtnDrawer")].forEach((btn) => {
      if (btn) btn.setAttribute("aria-label", t("refresh"));
    });
  }

  function toggleTheme() {
    theme = theme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, theme);
    applyTheme();
  }

  function localeTag() {
    return lang === "ru" ? "ru-RU" : lang === "en" ? "en-US" : "ru-RU";
  }

  const MONTHS_KK = [
    "қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым",
    "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан",
  ];
  const WEEKDAYS_KK = ["жексенбі", "дүйсенбі", "сейсенбі", "сәрсенбі", "бейсенбі", "жұма", "сенбі"];

  function formatLongDate(d) {
    if (lang === "kk") {
      return `${d.getDate()} ${MONTHS_KK[d.getMonth()]}, ${WEEKDAYS_KK[d.getDay()]}`;
    }
    return d.toLocaleDateString(localeTag(), { weekday: "long", day: "numeric", month: "long" });
  }

  function formatMonthYear(d) {
    if (lang === "kk") return `${MONTHS_KK[d.getMonth()]} ${d.getFullYear()}`;
    return d.toLocaleDateString(localeTag(), { month: "long", year: "numeric" });
  }

  function updateDateLine() {
    document.getElementById("todayDate").textContent = formatLongDate(new Date());
  }

  function dateKey(d) {
    const x = d instanceof Date ? d : new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  }
  function parseDateKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  function loadLegacyTasks() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch (_) {}
    return defaults.map((x) => ({ ...x }));
  }
  function seedWeek(map, today) {
    const samples = [studentDay, workDay, defaults];
    for (let i = 1; i <= 6; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = dateKey(d);
      if (map[key]) continue;
      const src = samples[i % samples.length];
      map[key] = src.slice(0, 2 + (i % 4)).map((x, idx) => ({
        ...x,
        id: `seed-${key}-${idx}`,
      }));
    }
    if (!map[today]) map[today] = loadLegacyTasks();
    return map;
  }
  function loadCalendar() {
    try {
      const raw = localStorage.getItem(CAL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
      }
    } catch (_) {}
    const today = dateKey(new Date());
    const map = seedWeek({}, today);
    localStorage.setItem(CAL_KEY, JSON.stringify(map));
    return map;
  }
  function save() {
    calendarMap[activeDate] = tasks.map((x) => ({ ...x }));
    localStorage.setItem(CAL_KEY, JSON.stringify(calendarMap));
    if (activeDate === dateKey(new Date())) {
      localStorage.setItem(KEY, JSON.stringify(tasks));
    }
  }
  function setActiveDate(key) {
    calendarMap[activeDate] = tasks.map((x) => ({ ...x }));
    activeDate = key;
    selectedCalDate = key;
    tasks = (calendarMap[activeDate] || []).map((x) => ({ ...x }));
    save();
    renderList();
    solve();
  }

  function timeToHours(value) {
    const [h, m] = String(value).split(":").map(Number);
    return h + (m || 0) / 60;
  }
  function hoursToLabel(h) {
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function showMsg(el, text, ok) {
    el.hidden = false;
    el.textContent = text;
    el.className = "msg " + (ok ? "ok" : "err");
  }

  function sortByEnd(list) {
    return list.slice().sort((a, b) => (a.end !== b.end ? a.end - b.end : a.start - b.start));
  }
  function schedule(list) {
    const sorted = sortByEnd(list);
    const selected = [];
    let lastEnd = -Infinity;
    for (const tsk of sorted) {
      if (tsk.start >= lastEnd) {
        selected.push(tsk);
        lastEnd = tsk.end;
      }
    }
    return selected;
  }
  function overlaps(a, b) {
    return !(a.end <= b.start || b.end <= a.start);
  }
  function bruteForce(list) {
    const items = list.slice(0, Math.min(list.length, 16));
    let best = [];
    let checked = 0;
    const total = 1 << items.length;
    for (let mask = 0; mask < total; mask++) {
      checked++;
      const subset = [];
      for (let i = 0; i < items.length; i++) if (mask & (1 << i)) subset.push(items[i]);
      let ok = true;
      for (let i = 0; i < subset.length && ok; i++) {
        for (let j = i + 1; j < subset.length; j++) {
          if (overlaps(subset[i], subset[j])) {
            ok = false;
            break;
          }
        }
      }
      if (ok && subset.length > best.length) best = subset;
    }
    return { selected: best, checked };
  }
  function countConflicts(list) {
    let c = 0;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) if (overlaps(list[i], list[j])) c++;
    }
    return c;
  }

  function drawTimeline(container, all, selectedIds) {
    container.innerHTML = "";
    if (!all.length) return;
    const minT = Math.min(...all.map((x) => x.start));
    const maxT = Math.max(...all.map((x) => x.end));
    const span = Math.max(maxT - minT, 0.5);
    const chosen = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
    all
      .slice()
      .sort((a, b) => a.start - b.start)
      .forEach((task) => {
        const bar = document.createElement("div");
        bar.className = "bar";
        if (!chosen.has(task.id)) bar.classList.add("is-dim");
        if (task._state === "current") bar.classList.add("is-current");
        if (task._state === "reject") bar.classList.add("is-reject");

        const meta = document.createElement("div");
        meta.className = "bar-meta";
        const title = document.createElement("span");
        title.className = "bar-title";
        title.textContent = task.title || task.id;
        const time = document.createElement("span");
        time.className = "bar-time";
        time.textContent = `${hoursToLabel(task.start)}–${hoursToLabel(task.end)}`;
        meta.appendChild(title);
        meta.appendChild(time);

        const track = document.createElement("div");
        track.className = "bar-track";
        const i = document.createElement("i");
        if (!chosen.has(task.id)) i.classList.add("dim");
        if (task._state === "current") i.classList.add("pulse");
        if (task._state === "reject") i.classList.add("reject");
        i.style.left = ((task.start - minT) / span) * 100 + "%";
        i.style.width = Math.max(((task.end - task.start) / span) * 100, 4) + "%";
        track.appendChild(i);

        bar.appendChild(meta);
        bar.appendChild(track);
        container.appendChild(bar);
      });
  }

  function renderList() {
    taskBody.innerHTML = "";
    tasks.forEach((task) => {
      const el = document.createElement("div");
      el.className = "task-item";
      el.innerHTML = `
        <div>
          <strong>${escapeHtml(task.title)}</strong>
          <span>${hoursToLabel(task.start)} – ${hoursToLabel(task.end)}</span>
        </div>
        <button type="button" data-remove="${escapeHtml(task.id)}">${escapeHtml(t("remove"))}</button>`;
      taskBody.appendChild(el);
    });
    empty.style.display = tasks.length ? "none" : "block";
    save();
    updateHome();
  }

  function renderResult(selected) {
    resCount.textContent = t("tasksCount", { n: selected.length });
    resList.innerHTML = "";
    if (!selected.length) {
      resList.innerHTML = `<li class="dim">${escapeHtml(t("noFit"))}</li>`;
      timeline.innerHTML = "";
      return;
    }
    selected.forEach((task) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${escapeHtml(task.title)}</span><b>${hoursToLabel(task.start)}–${hoursToLabel(task.end)}</b>`;
      resList.appendChild(li);
    });
    drawTimeline(timeline, tasks, new Set(selected.map((x) => x.id)));
  }

  function solve() {
    if (!tasks.length) {
      resCount.textContent = t("tasksCount", { n: 0 });
      resList.innerHTML = "";
      timeline.innerHTML = "";
      updateHome();
      return;
    }
    renderResult(schedule(tasks));
    updateHome();
  }

  function updateHome() {
    const selected = schedule(tasks);
    document.getElementById("homeTotal").textContent = String(tasks.length);
    document.getElementById("homeFit").textContent = String(selected.length);
    document.getElementById("homeConflict").textContent = String(countConflicts(tasks));
    const list = document.getElementById("homeSchedule");
    const emptyHome = document.getElementById("homeEmpty");
    list.innerHTML = "";
    if (!selected.length) {
      emptyHome.style.display = "block";
      return;
    }
    emptyHome.style.display = "none";
    selected.forEach((task) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${escapeHtml(task.title)}</span><b>${hoursToLabel(task.start)}–${hoursToLabel(task.end)}</b>`;
      list.appendChild(li);
    });
  }

  function buildAnimSteps(list) {
    const steps = [];
    if (!list.length) {
      steps.push({ text: t("listEmpty"), sorted: [], selected: [], highlight: null, status: {} });
      return steps;
    }
    const sorted = sortByEnd(list);
    steps.push({
      text: t("stepSort"),
      sorted: sorted.map((x) => x.id),
      selected: [],
      highlight: null,
      status: Object.fromEntries(sorted.map((x) => [x.id, "wait"])),
    });
    const selected = [];
    let lastEnd = -Infinity;
    sorted.forEach((task) => {
      const status = Object.fromEntries(sorted.map((x) => [x.id, "wait"]));
      selected.forEach((s) => (status[s.id] = "pick"));
      status[task.id] = "current";
      if (task.start >= lastEnd) {
        steps.push({
          text: t("stepPick", {
            title: task.title,
            start: hoursToLabel(task.start),
            end: hoursToLabel(task.end),
          }),
          sorted: sorted.map((x) => x.id),
          selected: selected.map((x) => x.id).concat(task.id),
          highlight: task.id,
          status: { ...status, [task.id]: "pick" },
        });
        selected.push(task);
        lastEnd = task.end;
      } else {
        steps.push({
          text: t("stepSkip", { title: task.title }),
          sorted: sorted.map((x) => x.id),
          selected: selected.map((x) => x.id),
          highlight: task.id,
          status: { ...status, [task.id]: "reject" },
        });
      }
    });
    steps.push({
      text: t("stepDone", { n: selected.length }),
      sorted: sorted.map((x) => x.id),
      selected: selected.map((x) => x.id),
      highlight: null,
      status: Object.fromEntries(
        sorted.map((x) => [x.id, selected.some((s) => s.id === x.id) ? "pick" : "reject"])
      ),
    });
    return steps;
  }

  function renderAnimFrame(step) {
    document.getElementById("stepIndex").textContent = t("stepOf", {
      a: animIndex + 1,
      b: animSteps.length,
    });
    document.getElementById("stepText").textContent = step.text;
    const sortedTrack = document.getElementById("sortedTrack");
    sortedTrack.innerHTML = "";
    step.sorted.forEach((id) => {
      const task = tasks.find((x) => x.id === id);
      const el = document.createElement("span");
      el.className = "token " + (step.status[id] || "wait");
      if (step.highlight === id) el.classList.add("focus");
      el.textContent = task ? task.title : id;
      sortedTrack.appendChild(el);
    });
    const pickTrack = document.getElementById("pickTrack");
    pickTrack.innerHTML = "";
    if (!step.selected.length) {
      pickTrack.innerHTML = `<span class="token">${escapeHtml(t("noneYet"))}</span>`;
    } else {
      step.selected.forEach((id) => {
        const task = tasks.find((x) => x.id === id);
        const el = document.createElement("span");
        el.className = "token pick";
        el.textContent = task ? task.title : id;
        pickTrack.appendChild(el);
      });
    }
    const decorated = tasks.map((x) => ({ ...x, _state: step.status[x.id] || "wait" }));
    drawTimeline(document.getElementById("labTimeline"), decorated, new Set(step.selected));
  }

  function stopAnim() {
    animPlaying = false;
    if (animTimer) clearTimeout(animTimer);
    animTimer = null;
  }
  function showStep(i) {
    if (!animSteps.length) return;
    animIndex = Math.max(0, Math.min(i, animSteps.length - 1));
    renderAnimFrame(animSteps[animIndex]);
  }
  function playAnim() {
    stopAnim();
    animSteps = buildAnimSteps(tasks);
    if (animIndex >= animSteps.length - 1) animIndex = 0;
    animPlaying = true;
    showStep(animIndex);
    const tick = () => {
      if (!animPlaying || animIndex >= animSteps.length - 1) {
        animPlaying = false;
        return;
      }
      animTimer = setTimeout(() => {
        showStep(animIndex + 1);
        tick();
      }, Number(document.getElementById("animSpeed").value) || 1100);
    };
    tick();
  }
  function resetLab() {
    stopAnim();
    animSteps = buildAnimSteps(tasks);
    animIndex = 0;
    if (animSteps.length) showStep(0);
  }

  function runCompare() {
    if (!tasks.length) {
      document.getElementById("verdictText").textContent = t("addTasksFirst");
      return;
    }
    const t0 = performance.now();
    const g = schedule(tasks);
    const t1 = performance.now();
    const b = bruteForce(tasks);
    const t2 = performance.now();
    document.getElementById("gCount").textContent = String(g.length);
    document.getElementById("gIds").textContent = g.map((x) => x.title).join(", ") || "—";
    document.getElementById("gTime").textContent = (t1 - t0).toFixed(3) + " " + t("ms");
    document.getElementById("bCount").textContent = String(b.selected.length);
    document.getElementById("bIds").textContent = b.selected.map((x) => x.title).join(", ") || "—";
    document.getElementById("bTime").textContent = (t2 - t1).toFixed(3) + " " + t("ms");
    document.getElementById("bChecked").textContent = b.checked.toLocaleString(localeTag());
    document.getElementById("verdictText").textContent = t("verdict", { n: g.length });
    drawGrowthChart(tasks.length);
  }

  function drawGrowthChart(n) {
    const chart = document.getElementById("growthChart");
    chart.innerHTML = "";
    const maxN = Math.max(8, Math.min(n + 4, 14));
    let maxVal = 1;
    const rows = [];
    for (let i = 1; i <= maxN; i++) {
      const greedy = i * Math.log2(i + 1);
      const brute = Math.pow(2, i) * i;
      rows.push({ i, greedy, brute });
      maxVal = Math.max(maxVal, brute);
    }
    rows.forEach((r) => {
      const row = document.createElement("div");
      row.className = "growth-row";
      row.innerHTML = `<span>n=${r.i}</span>`;
      const bars = document.createElement("div");
      bars.className = "growth-bars";
      const g = document.createElement("i");
      g.className = "g";
      g.style.width = Math.max(2, (r.greedy / maxVal) * 100) + "%";
      const b = document.createElement("i");
      b.className = "b";
      b.style.width = Math.max(2, (r.brute / maxVal) * 100) + "%";
      bars.appendChild(g);
      bars.appendChild(b);
      row.appendChild(bars);
      chart.appendChild(row);
    });
    const legend = document.createElement("p");
    legend.className = "chart-legend";
    legend.innerHTML = `<span class="lg"></span> ${escapeHtml(t("legendSmart"))} &nbsp; <span class="lb"></span> ${escapeHtml(t("legendBrute"))}`;
    chart.appendChild(legend);
  }

  function animateNumber(el, to, suffix, duration) {
    if (!el) return;
    const end = Number(to) || 0;
    const start = 0;
    const t0 = performance.now();
    const ms = duration || 900;
    function frame(now) {
      const p = Math.min(1, (now - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = Math.round(start + (end - start) * eased);
      el.textContent = suffix ? val + suffix : String(val);
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function collectStats() {
    const keys = Object.keys(calendarMap);
    let total = 0;
    let fit = 0;
    let conflict = 0;
    let busyHours = 0;
    const slots = { morning: 0, day: 0, evening: 0 };
    keys.forEach((key) => {
      const list = calendarMap[key] || [];
      total += list.length;
      const selected = schedule(list);
      fit += selected.length;
      conflict += countConflicts(list);
      list.forEach((task) => {
        const dur = Math.max(0, task.end - task.start);
        busyHours += dur;
        const mid = (task.start + task.end) / 2;
        if (mid < 12) slots.morning += dur;
        else if (mid < 17) slots.day += dur;
        else slots.evening += dur;
      });
    });
    const week = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = dateKey(d);
      const list = calendarMap[key] || [];
      week.push({
        key,
        label: d.toLocaleDateString(localeTag(), { weekday: "short" }),
        count: list.length,
        fit: schedule(list).length,
      });
    }
    const efficiency = total ? Math.round((fit / total) * 100) : 0;
    return { total, fit, conflict, busyHours, slots, week, efficiency };
  }

  function renderStats() {
    const s = collectStats();
    const ring = document.getElementById("ringEfficiency");
    if (ring) {
      ring.style.setProperty("--p", "0");
      requestAnimationFrame(() => ring.style.setProperty("--p", String(s.efficiency)));
    }
    animateNumber(document.getElementById("kpiEfficiency"), s.efficiency, "%");
    animateNumber(document.getElementById("kpiTotal"), s.total);
    animateNumber(document.getElementById("kpiFit"), s.fit);
    animateNumber(document.getElementById("kpiConflict"), s.conflict);
    animateNumber(document.getElementById("donutCenter"), Math.round(s.busyHours * 10) / 10);

    const circ = 2 * Math.PI * 46;
    const fitPart = s.total ? s.fit / s.total : 0;
    const conflictPart = s.total ? Math.min(s.conflict, s.total) / s.total : 0;
    const fitLen = circ * fitPart;
    const conflictLen = circ * conflictPart;
    const donutFit = document.getElementById("donutFit");
    const donutConflict = document.getElementById("donutConflict");
    if (donutFit) {
      donutFit.style.strokeDasharray = `${fitLen} ${circ}`;
      donutFit.style.strokeDashoffset = "0";
    }
    if (donutConflict) {
      donutConflict.style.strokeDasharray = `${conflictLen} ${circ}`;
      donutConflict.style.strokeDashoffset = String(-fitLen);
    }

    const hourBars = document.getElementById("hourBars");
    if (hourBars) {
      const maxSlot = Math.max(s.slots.morning, s.slots.day, s.slots.evening, 0.5);
      const rows = [
        ["slotMorning", s.slots.morning, "m"],
        ["slotDay", s.slots.day, "d"],
        ["slotEvening", s.slots.evening, "e"],
      ];
      hourBars.innerHTML = rows
        .map(([key, val, cls], i) => {
          const pct = Math.round((val / maxSlot) * 100);
          return `<div class="hbar-row" style="--delay:${i * 0.08}s">
            <span>${escapeHtml(t(key))}</span>
            <div class="hbar-track"><i class="${cls}" style="--w:${pct}%"></i></div>
            <b>${val.toFixed(1)}h</b>
          </div>`;
        })
        .join("");
    }

    const weekBars = document.getElementById("weekBars");
    if (weekBars) {
      const maxW = Math.max(...s.week.map((x) => x.count), 1);
      weekBars.innerHTML = s.week
        .map((day, i) => {
          const h = Math.max(8, Math.round((day.count / maxW) * 100));
          const isToday = day.key === dateKey(new Date());
          return `<div class="vbar ${isToday ? "today" : ""}" style="--delay:${i * 0.06}s">
            <div class="vbar-col"><i style="--h:${h}%"></i></div>
            <span>${escapeHtml(day.label)}</span>
            <b>${day.count}</b>
          </div>`;
        })
        .join("");
    }
  }

  function renderCalendar() {
    const weekdays = document.getElementById("calWeekdays");
    const grid = document.getElementById("calGrid");
    const label = document.getElementById("calMonthLabel");
    if (!grid || !weekdays || !label) return;

    weekdays.innerHTML = [0, 1, 2, 3, 4, 5, 6]
      .map((i) => `<span>${escapeHtml(t("wd" + i))}</span>`)
      .join("");

    const y = calCursor.getFullYear();
    const m = calCursor.getMonth();
    label.textContent = formatMonthYear(new Date(y, m, 1));

    const first = new Date(y, m, 1);
    let startPad = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const today = dateKey(new Date());
    let html = "";
    for (let i = 0; i < startPad; i++) html += `<button type="button" class="cal-day empty" disabled></button>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const key = dateKey(new Date(y, m, d));
      const list = calendarMap[key] || [];
      const count = list.length;
      const cls = [
        "cal-day",
        key === today ? "is-today" : "",
        key === selectedCalDate ? "is-selected" : "",
        count ? "has-tasks" : "",
      ]
        .filter(Boolean)
        .join(" ");
      html += `<button type="button" class="${cls}" data-date="${key}">
        <span class="num">${d}</span>
        ${count ? `<span class="dots">${"•".repeat(Math.min(count, 3))}</span>` : ""}
      </button>`;
    }
    grid.innerHTML = html;

    const selectedList = calendarMap[selectedCalDate] || [];
    const selectedLabel = document.getElementById("calSelectedLabel");
    if (selectedLabel) {
      selectedLabel.textContent = formatLongDate(parseDateKey(selectedCalDate));
    }
    const calDayList = document.getElementById("calDayList");
    const calDayEmpty = document.getElementById("calDayEmpty");
    if (calDayList) {
      calDayList.innerHTML = "";
      selectedList
        .slice()
        .sort((a, b) => a.start - b.start)
        .forEach((task) => {
          const li = document.createElement("li");
          li.innerHTML = `<span>${escapeHtml(task.title)}</span><b>${hoursToLabel(task.start)}–${hoursToLabel(task.end)}</b>`;
          calDayList.appendChild(li);
        });
    }
    if (calDayEmpty) calDayEmpty.style.display = selectedList.length ? "none" : "block";
  }

  function openMenu() {
    document.body.classList.add("menu-open");
    navEl.classList.add("open");
    menuOverlay.hidden = false;
    menuToggle.setAttribute("aria-expanded", "true");
  }
  function closeMenu() {
    document.body.classList.remove("menu-open");
    navEl.classList.remove("open");
    menuOverlay.hidden = true;
    menuToggle.setAttribute("aria-expanded", "false");
  }
  function toggleMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    if (navEl.classList.contains("open")) closeMenu();
    else openMenu();
  }

  const PAGES = ["today", "day", "calendar", "stats", "how", "why", "help"];
  function showPage(name) {
    const page = PAGES.includes(name) ? name : "today";
    document.querySelectorAll(".page").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.page === page);
    });
    document.querySelectorAll("[data-nav]").forEach((el) => {
      el.classList.toggle("active", el.getAttribute("data-nav") === page);
    });
    if (location.hash.replace("#", "") !== page) history.replaceState(null, "", "#" + page);
    window.scrollTo(0, 0);
    closeMenu();
    if (page === "why") drawGrowthChart(tasks.length || 6);
    if (page === "how") resetLab();
    if (page === "stats") renderStats();
    if (page === "calendar") renderCalendar();
  }

  document.getElementById("taskForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const title = document.getElementById("taskTitle").value.trim();
    const start = timeToHours(document.getElementById("taskStart").value);
    const end = timeToHours(document.getElementById("taskEnd").value);
    if (!title) return showMsg(formMsg, t("needTitle"), false);
    if (!(end > start)) return showMsg(formMsg, t("needTime"), false);
    tasks.push({ id: "t" + ++idSeq, title, start, end });
    e.target.reset();
    document.getElementById("taskStart").value = "09:00";
    document.getElementById("taskEnd").value = "10:30";
    showMsg(formMsg, t("added"), true);
    renderList();
    solve();
  });

  taskBody.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove]");
    if (!btn) return;
    tasks = tasks.filter((x) => x.id !== btn.getAttribute("data-remove"));
    renderList();
    solve();
  });

  document.getElementById("btnClear").addEventListener("click", () => {
    tasks = [];
    renderList();
    solve();
  });
  document.getElementById("btnSolve").addEventListener("click", solve);
  document.getElementById("btnAnimateFromPlanner").addEventListener("click", () => {
    showPage("how");
    playAnim();
  });
  document.getElementById("quickOptimize").addEventListener("click", (e) => {
    e.preventDefault();
    showPage("day");
    solve();
  });
  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.getAttribute("data-preset");
      tasks = (kind === "work" ? workDay : studentDay).map((x) => ({ ...x }));
      renderList();
      solve();
      showMsg(formMsg, t("loaded"), true);
    });
  });
  document.getElementById("btnPlay").addEventListener("click", playAnim);
  document.getElementById("btnPause").addEventListener("click", stopAnim);
  document.getElementById("btnStep").addEventListener("click", () => {
    stopAnim();
    if (!animSteps.length) animSteps = buildAnimSteps(tasks);
    showStep(Math.min(animIndex + 1, animSteps.length - 1));
  });
  document.getElementById("btnResetLab").addEventListener("click", resetLab);
  document.getElementById("btnCompare").addEventListener("click", runCompare);
  document.getElementById("contactForm").addEventListener("submit", (e) => {
    e.preventDefault();
    showMsg(document.getElementById("contactMsg"), t("sent"), true);
    e.target.reset();
  });

  document.getElementById("calPrev").addEventListener("click", () => {
    calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1);
    renderCalendar();
  });
  document.getElementById("calNext").addEventListener("click", () => {
    calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1);
    renderCalendar();
  });
  document.getElementById("calGrid").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-date]");
    if (!btn) return;
    selectedCalDate = btn.getAttribute("data-date");
    renderCalendar();
  });
  document.getElementById("calOpenDay").addEventListener("click", () => {
    setActiveDate(selectedCalDate);
    showPage("day");
  });
  document.getElementById("calGoToday").addEventListener("click", () => {
    const today = dateKey(new Date());
    selectedCalDate = today;
    calCursor = new Date();
    setActiveDate(today);
    renderCalendar();
  });

  menuToggle.addEventListener("click", toggleMenu);
  menuOverlay.addEventListener("click", closeMenu);
  themeToggle.addEventListener("click", toggleTheme);
  themeToggleDrawer.addEventListener("click", toggleTheme);
  langSelect.addEventListener("change", () => setLang(langSelect.value));
  langSelectDrawer.addEventListener("change", () => setLang(langSelectDrawer.value));

  document.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      showPage(el.getAttribute("data-nav"));
    });
  });
  window.addEventListener("hashchange", () => {
    showPage(location.hash.replace("#", "") || "today");
  });

  let refreshing = false;
  async function hardRefresh() {
    if (refreshing) return;
    refreshing = true;
    const btn = document.getElementById("refreshBtn");
    const btnDrawer = document.getElementById("refreshBtnDrawer");
    [btn, btnDrawer].forEach((el) => {
      if (el) el.classList.add("is-spinning");
    });
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          regs.map(async (reg) => {
            try {
              await reg.update();
            } catch (_) {}
            try {
              await reg.unregister();
            } catch (_) {}
          })
        );
      }
    } catch (_) {}
    const hash = location.hash || "#today";
    const base = location.href.split("#")[0].split("?")[0];
    location.replace(base + "?v=" + Date.now() + hash);
  }

  const refreshBtn = document.getElementById("refreshBtn");
  const refreshBtnDrawer = document.getElementById("refreshBtnDrawer");
  if (refreshBtn) refreshBtn.addEventListener("click", hardRefresh);
  if (refreshBtnDrawer) refreshBtnDrawer.addEventListener("click", hardRefresh);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  if (/\b[v_]=/.test(location.search) || location.search.indexOf("_r=") !== -1) {
    history.replaceState(null, "", location.pathname + location.hash);
  }

  applyTheme();
  applyI18n();
  showPage(location.hash.replace("#", "") || "today");
})();
