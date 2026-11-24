(function () {
  const KEY = "zhospar_tasks_v1";
  const defaults = [
    { id: "A", start: 1, end: 3 },
    { id: "B", start: 2, end: 5 },
    { id: "C", start: 3, end: 6 },
  ];
  const busyDay = [
    { id: "A", start: 1, end: 4 },
    { id: "B", start: 2, end: 3 },
    { id: "C", start: 3, end: 5 },
    { id: "D", start: 5, end: 7 },
    { id: "E", start: 4, end: 6 },
    { id: "F", start: 7, end: 9 },
  ];

  let tasks = load();
  let animTimer = null;
  let animSteps = [];
  let animIndex = 0;
  let animPlaying = false;

  const body = document.getElementById("taskBody");
  const empty = document.getElementById("emptyState");
  const formMsg = document.getElementById("formMsg");
  const resCount = document.getElementById("resCount");
  const resList = document.getElementById("resList");
  const timeline = document.getElementById("timeline");

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

  function showMsg(el, text, ok) {
    el.hidden = false;
    el.textContent = text;
    el.className = "msg " + (ok ? "ok" : "err");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function sortByEnd(list) {
    return list.slice().sort((a, b) => {
      if (a.end !== b.end) return a.end - b.end;
      return a.start - b.start;
    });
  }

  /** Interval scheduling: sort by end, greedy pick */
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

  /** Brute-force: all non-overlapping subsets, max count (then lexicographic ids) */
  function bruteForce(list) {
    const n = list.length;
    const limit = Math.min(n, 16);
    const items = list.slice(0, limit);
    let best = [];
    let checked = 0;
    const total = 1 << items.length;

    for (let mask = 0; mask < total; mask++) {
      checked++;
      const subset = [];
      let ok = true;
      for (let i = 0; i < items.length; i++) {
        if (mask & (1 << i)) subset.push(items[i]);
      }
      for (let i = 0; i < subset.length && ok; i++) {
        for (let j = i + 1; j < subset.length; j++) {
          if (overlaps(subset[i], subset[j])) {
            ok = false;
            break;
          }
        }
      }
      if (!ok) continue;
      if (
        subset.length > best.length ||
        (subset.length === best.length &&
          subset.map((x) => x.id).join(",") < best.map((x) => x.id).join(","))
      ) {
        best = subset;
      }
    }
    return { selected: best, checked, truncated: n > 16 };
  }

  function renderList() {
    body.innerHTML = "";
    tasks.forEach((t) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${escapeHtml(t.id)}</strong></td>
        <td>${t.start}</td>
        <td>${t.end}</td>
        <td class="row-actions">
          <button type="button" data-remove="${escapeHtml(t.id)}">Өшіру</button>
        </td>`;
      body.appendChild(tr);
    });
    empty.classList.toggle("hidden", tasks.length > 0);
    save();
  }

  function drawTimeline(container, all, selectedIds) {
    container.innerHTML = "";
    if (!all.length) return;
    const minT = Math.min(...all.map((t) => t.start));
    const maxT = Math.max(...all.map((t) => t.end));
    const span = Math.max(maxT - minT, 1);
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
        i.style.width = Math.max(width, 8) + "%";
        i.textContent = `${t.id} ${t.start}–${t.end}`;
        bar.appendChild(i);
        container.appendChild(bar);
      });
  }

  function renderResult(selected) {
    resCount.textContent = String(selected.length);
    resList.innerHTML = "";
    if (!selected.length) {
      resList.innerHTML = '<li class="empty-li">Таңдалған тапсырма жоқ</li>';
      timeline.innerHTML = "";
      return;
    }
    selected.forEach((t) => {
      const li = document.createElement("li");
      li.textContent = `${t.id} (${t.start}–${t.end})`;
      resList.appendChild(li);
    });
    drawTimeline(timeline, tasks, new Set(selected.map((t) => t.id)));
  }

  function solve() {
    if (!tasks.length) {
      resCount.textContent = "0";
      resList.innerHTML = '<li class="empty-li">Тізім бос</li>';
      timeline.innerHTML = "";
      return;
    }
    renderResult(schedule(tasks));
  }

  // ---------- Animation engine ----------
  function buildAnimSteps(list) {
    const steps = [];
    if (!list.length) {
      steps.push({
        text: "Тізім бос — есептейтін ештеңе жоқ.",
        sorted: [],
        selected: [],
        highlight: null,
        status: {},
      });
      return steps;
    }

    const sorted = sortByEnd(list);
    steps.push({
      text: "1-қадам: тапсырмаларды аяқталу уақыты бойынша сұрыптаймыз (ерте аяқталатыны алда).",
      sorted: sorted.map((t) => t.id),
      selected: [],
      highlight: null,
      status: Object.fromEntries(sorted.map((t) => [t.id, "wait"])),
    });

    const selected = [];
    let lastEnd = -Infinity;
    sorted.forEach((t, idx) => {
      const status = Object.fromEntries(sorted.map((x) => [x.id, "wait"]));
      selected.forEach((s) => (status[s.id] = "pick"));
      status[t.id] = "current";

      if (t.start >= lastEnd) {
        steps.push({
          text: `${idx + 2}-қадам: ${t.id} [${t.start}, ${t.end}) қаралуда — lastEnd=${lastEnd === -Infinity ? "−∞" : lastEnd}, ${t.start} ≥ ${lastEnd === -Infinity ? "−∞" : lastEnd} → ТАҢДАЛАДЫ.`,
          sorted: sorted.map((x) => x.id),
          selected: selected.map((x) => x.id).concat(t.id),
          highlight: t.id,
          status: { ...status, [t.id]: "pick" },
          current: t,
        });
        selected.push(t);
        lastEnd = t.end;
      } else {
        steps.push({
          text: `${idx + 2}-қадам: ${t.id} [${t.start}, ${t.end}) қаралуда — ${t.start} < lastEnd=${lastEnd} → ҚАҚТЫҒЫС, өткізіледі.`,
          sorted: sorted.map((x) => x.id),
          selected: selected.map((x) => x.id),
          highlight: t.id,
          status: { ...status, [t.id]: "reject" },
          current: t,
        });
      }
    });

    steps.push({
      text: `Дайын: ${selected.length} тапсырма — ${selected.map((t) => t.id).join(", ") || "жоқ"}. Greedy O(n log n).`,
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
      const el = document.createElement("span");
      el.className = "token " + (step.status[id] || "wait");
      if (step.highlight === id) el.classList.add("focus");
      const task = tasks.find((t) => t.id === id);
      el.textContent = task ? `${id} (${task.start}–${task.end})` : id;
      sortedTrack.appendChild(el);
    });

    const pickTrack = document.getElementById("pickTrack");
    pickTrack.innerHTML = "";
    if (!step.selected.length) {
      pickTrack.innerHTML = '<span class="token wait">Әлі таңдалмаған</span>';
    } else {
      step.selected.forEach((id) => {
        const el = document.createElement("span");
        el.className = "token pick";
        el.textContent = id;
        pickTrack.appendChild(el);
      });
    }

    const decorated = tasks.map((t) => ({
      ...t,
      _state: step.status[t.id] || "wait",
    }));
    drawTimeline(document.getElementById("labTimeline"), decorated, new Set(step.selected));
  }

  function stopAnim() {
    animPlaying = false;
    if (animTimer) {
      clearTimeout(animTimer);
      animTimer = null;
    }
  }

  function showStep(i) {
    if (!animSteps.length) return;
    animIndex = Math.max(0, Math.min(i, animSteps.length - 1));
    renderAnimFrame(animSteps[animIndex]);
  }

  function playAnim() {
    stopAnim();
    animSteps = buildAnimSteps(tasks);
    if (!animSteps.length) return;
    if (animIndex >= animSteps.length - 1) animIndex = 0;
    animPlaying = true;
    showStep(animIndex);

    const tick = () => {
      if (!animPlaying) return;
      if (animIndex >= animSteps.length - 1) {
        animPlaying = false;
        return;
      }
      const delay = Number(document.getElementById("animSpeed").value) || 1100;
      animTimer = setTimeout(() => {
        showStep(animIndex + 1);
        tick();
      }, delay);
    };
    tick();
  }

  function resetLab() {
    stopAnim();
    animSteps = buildAnimSteps(tasks);
    animIndex = 0;
    if (animSteps.length) showStep(0);
  }

  // ---------- Compare ----------
  function runCompare() {
    if (!tasks.length) {
      document.getElementById("verdictText").textContent = "Алдымен тапсырма қосыңыз.";
      return;
    }

    const t0 = performance.now();
    const g = schedule(tasks);
    const t1 = performance.now();
    const b = bruteForce(tasks);
    const t2 = performance.now();

    document.getElementById("gCount").textContent = String(g.length);
    document.getElementById("gIds").textContent = g.map((x) => x.id).join(", ") || "—";
    document.getElementById("gTime").textContent = (t1 - t0).toFixed(3) + " мс";

    document.getElementById("bCount").textContent = String(b.selected.length);
    document.getElementById("bIds").textContent = b.selected.map((x) => x.id).join(", ") || "—";
    document.getElementById("bTime").textContent = (t2 - t1).toFixed(3) + " мс";
    document.getElementById("bChecked").textContent =
      b.checked.toLocaleString("kk-KZ") + (b.truncated ? " (n>16 қысқартылған)" : "");

    const same = g.length === b.selected.length;
    const faster = t1 - t0 <= t2 - t1;
    document.getElementById("verdictText").textContent = same
      ? `Екі тәсіл де ${g.length} тапсырма тапты. Greedy әлдеқайда жылдам${faster ? "" : ""} — O(n log n) қарсы O(2ⁿ·n).`
      : "Нәтиже саны әртүрлі (шектеулі brute-force демо).";

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
      g.title = `Greedy ~ ${r.greedy.toFixed(0)}`;
      const b = document.createElement("i");
      b.className = "b";
      b.style.width = Math.max(2, (r.brute / maxVal) * 100) + "%";
      b.title = `Brute ~ ${r.brute.toFixed(0)}`;
      bars.appendChild(g);
      bars.appendChild(b);
      row.appendChild(bars);
      chart.appendChild(row);
    });
    const legend = document.createElement("p");
    legend.className = "chart-legend";
    legend.innerHTML = "<span class='lg'></span> Greedy (n log n) &nbsp; <span class='lb'></span> Brute-force (2ⁿ·n)";
    chart.appendChild(legend);
  }

  // ---------- Events ----------
  document.getElementById("taskForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = document.getElementById("taskId").value.trim();
    const start = Number(document.getElementById("taskStart").value);
    const end = Number(document.getElementById("taskEnd").value);

    if (!id) {
      showMsg(formMsg, "ID міндетті", false);
      return;
    }
    if (tasks.some((t) => t.id.toLowerCase() === id.toLowerCase())) {
      showMsg(formMsg, "Бұл ID бар", false);
      return;
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      showMsg(formMsg, "Басталу < аяқталу болуы керек", false);
      return;
    }

    tasks.push({ id, start, end });
    e.target.reset();
    showMsg(formMsg, "Қосылды", true);
    renderList();
    solve();
    resetLab();
  });

  body.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove]");
    if (!btn) return;
    const id = btn.getAttribute("data-remove");
    tasks = tasks.filter((t) => t.id !== id);
    renderList();
    solve();
    resetLab();
  });

  document.getElementById("btnClear").addEventListener("click", () => {
    tasks = [];
    renderList();
    solve();
    resetLab();
  });

  document.getElementById("btnSolve").addEventListener("click", solve);

  document.getElementById("btnAnimateFromPlanner").addEventListener("click", () => {
    showPage("lab");
    playAnim();
  });

  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.getAttribute("data-preset");
      tasks = (kind === "busy" ? busyDay : defaults).map((x) => ({ ...x }));
      renderList();
      solve();
      resetLab();
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
    const msg = document.getElementById("contactMsg");
    showMsg(msg, "Өтініш қабылданды. Жақында хабарласамыз.", true);
    e.target.reset();
  });

  // ---------- Page router (бір уақытта бір бет) ----------
  const PAGES = ["home", "features", "planner", "lab", "compare", "contact"];
  const navEl = document.getElementById("mainNav");
  const menuToggle = document.getElementById("menuToggle");

  function showPage(name) {
    const page = PAGES.includes(name) ? name : "home";
    document.querySelectorAll(".page").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.page === page);
    });
    document.querySelectorAll("[data-nav]").forEach((el) => {
      el.classList.toggle("active", el.getAttribute("data-nav") === page);
    });
    if (location.hash.replace("#", "") !== page) {
      history.replaceState(null, "", "#" + page);
    }
    window.scrollTo(0, 0);
    navEl.classList.remove("open");
    if (page === "compare") drawGrowthChart(tasks.length || 6);
    if (page === "lab") resetLab();
  }

  document.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      showPage(el.getAttribute("data-nav"));
    });
  });

  menuToggle.addEventListener("click", () => {
    navEl.classList.toggle("open");
  });

  window.addEventListener("hashchange", () => {
    showPage(location.hash.replace("#", "") || "home");
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  renderList();
  solve();
  resetLab();
  showPage(location.hash.replace("#", "") || "home");
})();
