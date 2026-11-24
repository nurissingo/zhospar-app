(function () {
  const KEY = "zhospar_tasks_v2";
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

  let tasks = load();
  let animTimer = null;
  let animSteps = [];
  let animIndex = 0;
  let animPlaying = false;
  let idSeq = Date.now();

  const formMsg = document.getElementById("formMsg");
  const empty = document.getElementById("emptyState");
  const taskBody = document.getElementById("taskBody");
  const resCount = document.getElementById("resCount");
  const resList = document.getElementById("resList");
  const timeline = document.getElementById("timeline");
  const menuToggle = document.getElementById("menuToggle");
  const menuClose = document.getElementById("menuClose");
  const menuOverlay = document.getElementById("menuOverlay");
  const navEl = document.getElementById("mainNav");

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch (_) {}
    return defaults.map((x) => ({ ...x }));
  }
  function save() {
    localStorage.setItem(KEY, JSON.stringify(tasks));
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
    for (const t of sorted) {
      if (t.start >= lastEnd) {
        selected.push(t);
        lastEnd = t.end;
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
    return { selected: best, checked, truncated: list.length > 16 };
  }

  function countConflicts(list) {
    let c = 0;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (overlaps(list[i], list[j])) c++;
      }
    }
    return c;
  }

  function drawTimeline(container, all, selectedIds) {
    container.innerHTML = "";
    if (!all.length) return;
    const minT = Math.min(...all.map((t) => t.start));
    const maxT = Math.max(...all.map((t) => t.end));
    const span = Math.max(maxT - minT, 0.5);
    const chosen = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);

    all
      .slice()
      .sort((a, b) => a.start - b.start)
      .forEach((t) => {
        const bar = document.createElement("div");
        bar.className = "bar";
        const left = ((t.start - minT) / span) * 100;
        const width = ((t.end - t.start) / span) * 100;
        const i = document.createElement("i");
        if (!chosen.has(t.id)) i.classList.add("dim");
        if (t._state === "current") i.classList.add("pulse");
        if (t._state === "reject") i.classList.add("reject");
        i.style.left = left + "%";
        i.style.width = Math.max(width, 10) + "%";
        i.textContent = t.title || t.id;
        bar.appendChild(i);
        container.appendChild(bar);
      });
  }

  function renderList() {
    taskBody.innerHTML = "";
    tasks.forEach((t) => {
      const el = document.createElement("div");
      el.className = "task-item";
      el.innerHTML = `
        <div>
          <strong>${escapeHtml(t.title)}</strong>
          <span>${hoursToLabel(t.start)} – ${hoursToLabel(t.end)}</span>
        </div>
        <button type="button" data-remove="${escapeHtml(t.id)}">Өшіру</button>`;
      taskBody.appendChild(el);
    });
    empty.style.display = tasks.length ? "none" : "block";
    save();
    updateHome();
  }

  function renderResult(selected) {
    resCount.textContent = selected.length + " іс";
    resList.innerHTML = "";
    if (!selected.length) {
      resList.innerHTML = '<li class="dim">Қазір сыятын іс жоқ</li>';
      timeline.innerHTML = "";
      return;
    }
    selected.forEach((t) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${escapeHtml(t.title)}</span><b>${hoursToLabel(t.start)}–${hoursToLabel(t.end)}</b>`;
      resList.appendChild(li);
    });
    drawTimeline(timeline, tasks, new Set(selected.map((t) => t.id)));
  }

  function solve() {
    if (!tasks.length) {
      resCount.textContent = "0 іс";
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
    selected.forEach((t) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${escapeHtml(t.title)}</span><b>${hoursToLabel(t.start)}–${hoursToLabel(t.end)}</b>`;
      list.appendChild(li);
    });
  }

  // Animation
  function buildAnimSteps(list) {
    const steps = [];
    if (!list.length) {
      steps.push({ text: "Тізім бос.", sorted: [], selected: [], highlight: null, status: {} });
      return steps;
    }
    const sorted = sortByEnd(list);
    steps.push({
      text: "Алдымен істерді аяқталу уақыты бойынша реттейміз — ерте бітетіні алда.",
      sorted: sorted.map((t) => t.id),
      selected: [],
      highlight: null,
      status: Object.fromEntries(sorted.map((t) => [t.id, "wait"])),
    });
    const selected = [];
    let lastEnd = -Infinity;
    sorted.forEach((t) => {
      const status = Object.fromEntries(sorted.map((x) => [x.id, "wait"]));
      selected.forEach((s) => (status[s.id] = "pick"));
      status[t.id] = "current";
      if (t.start >= lastEnd) {
        steps.push({
          text: `«${t.title}» (${hoursToLabel(t.start)}–${hoursToLabel(t.end)}) қақтығыспайды → күнге қосамыз.`,
          sorted: sorted.map((x) => x.id),
          selected: selected.map((x) => x.id).concat(t.id),
          highlight: t.id,
          status: { ...status, [t.id]: "pick" },
        });
        selected.push(t);
        lastEnd = t.end;
      } else {
        steps.push({
          text: `«${t.title}» басқа іспен қабаттасады → өткіземіз.`,
          sorted: sorted.map((x) => x.id),
          selected: selected.map((x) => x.id),
          highlight: t.id,
          status: { ...status, [t.id]: "reject" },
        });
      }
    });
    steps.push({
      text: `Дайын: бүгінге ${selected.length} іс сыйды.`,
      sorted: sorted.map((t) => t.id),
      selected: selected.map((t) => t.id),
      highlight: null,
      status: Object.fromEntries(
        sorted.map((t) => [t.id, selected.some((s) => s.id === t.id) ? "pick" : "reject"])
      ),
    });
    return steps;
  }

  function renderAnimFrame(step) {
    document.getElementById("stepIndex").textContent = `Қадам ${animIndex + 1} / ${animSteps.length}`;
    document.getElementById("stepText").textContent = step.text;
    const sortedTrack = document.getElementById("sortedTrack");
    sortedTrack.innerHTML = "";
    step.sorted.forEach((id) => {
      const task = tasks.find((t) => t.id === id);
      const el = document.createElement("span");
      el.className = "token " + (step.status[id] || "wait");
      if (step.highlight === id) el.classList.add("focus");
      el.textContent = task ? task.title : id;
      sortedTrack.appendChild(el);
    });
    const pickTrack = document.getElementById("pickTrack");
    pickTrack.innerHTML = "";
    if (!step.selected.length) {
      pickTrack.innerHTML = '<span class="token">Әлі таңдалмаған</span>';
    } else {
      step.selected.forEach((id) => {
        const task = tasks.find((t) => t.id === id);
        const el = document.createElement("span");
        el.className = "token pick";
        el.textContent = task ? task.title : id;
        pickTrack.appendChild(el);
      });
    }
    const decorated = tasks.map((t) => ({ ...t, _state: step.status[t.id] || "wait" }));
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
      document.getElementById("verdictText").textContent = "Алдымен іс қосыңыз.";
      return;
    }
    const t0 = performance.now();
    const g = schedule(tasks);
    const t1 = performance.now();
    const b = bruteForce(tasks);
    const t2 = performance.now();
    document.getElementById("gCount").textContent = String(g.length);
    document.getElementById("gIds").textContent = g.map((x) => x.title).join(", ") || "—";
    document.getElementById("gTime").textContent = (t1 - t0).toFixed(3) + " мс";
    document.getElementById("bCount").textContent = String(b.selected.length);
    document.getElementById("bIds").textContent = b.selected.map((x) => x.title).join(", ") || "—";
    document.getElementById("bTime").textContent = (t2 - t1).toFixed(3) + " мс";
    document.getElementById("bChecked").textContent = b.checked.toLocaleString("kk-KZ");
    document.getElementById("verdictText").textContent =
      `Екеуі де ${g.length} іс тапты. Ақылды тәсіл әлдеқайда жылдам — күнделікті қолдануға ыңғайлы.`;
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
    legend.innerHTML =
      "<span class='lg'></span> Ақылды тәсіл &nbsp; <span class='lb'></span> Барлығын тексеру";
    chart.appendChild(legend);
  }

  // Menu
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

  // Router
  const PAGES = ["today", "day", "how", "why", "help"];
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
  }

  // Events
  document.getElementById("taskForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const title = document.getElementById("taskTitle").value.trim();
    const start = timeToHours(document.getElementById("taskStart").value);
    const end = timeToHours(document.getElementById("taskEnd").value);
    if (!title) return showMsg(formMsg, "Атауын жазыңыз", false);
    if (!(end > start)) return showMsg(formMsg, "Аяқталу басталудан кейін болуы керек", false);
    tasks.push({ id: "t" + ++idSeq, title, start, end });
    e.target.reset();
    document.getElementById("taskStart").value = "09:00";
    document.getElementById("taskEnd").value = "10:30";
    showMsg(formMsg, "Қосылды", true);
    renderList();
    solve();
  });

  taskBody.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove]");
    if (!btn) return;
    tasks = tasks.filter((t) => t.id !== btn.getAttribute("data-remove"));
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
      showMsg(formMsg, "Мысал жүктелді", true);
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
    showMsg(document.getElementById("contactMsg"), "Жіберілді. Жақында жауап береміз.", true);
    e.target.reset();
  });

  menuToggle.addEventListener("click", toggleMenu);
  menuClose.addEventListener("click", (e) => {
    e.preventDefault();
    closeMenu();
  });
  menuOverlay.addEventListener("click", closeMenu);

  document.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      showPage(el.getAttribute("data-nav"));
    });
  });
  window.addEventListener("hashchange", () => {
    showPage(location.hash.replace("#", "") || "today");
  });

  const dateEl = document.getElementById("todayDate");
  dateEl.textContent = new Date().toLocaleDateString("kk-KZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  renderList();
  solve();
  showPage(location.hash.replace("#", "") || "today");
})();
