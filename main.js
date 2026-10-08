// Behaviour of the one-page site: the navbar trail, reveals on scroll, the
// Hawkes strips under section titles, abstract toggles, example tabs and the
// figure lightbox.

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// External links and PDFs open in a new tab ---------------------------------

document.querySelectorAll('a[href^="http"], a[href$=".pdf"]').forEach((link) => {
  link.target = "_blank";
  link.rel = "noopener noreferrer";
});

// Smooth scrolling, once loaded ----------------------------------------------
// Links to a section (e.g. the old teaching.html) should land on it at once;
// fonts loading may still move it a little, so re-align if nobody scrolled.

const landedAt = window.scrollY;
window.addEventListener("load", () => {
  const target = location.hash && document.getElementById(location.hash.slice(1));
  if (target && window.scrollY === landedAt) target.scrollIntoView();
  updateNav();
  requestAnimationFrame(() => document.documentElement.classList.add("smooth"));
});

// Navbar trail ----------------------------------------------------------------
// Every element with [data-nav] is a place in the page. The last place whose
// top has crossed the reading line is where the reader is; its ancestors give
// the path. The navbar highlights the top-level item and writes one "|_" line
// per deeper level under it, typing the labels as they change.

const places = [...document.querySelectorAll("[data-nav]")];
const navItems = [...document.querySelectorAll(".nav-tree > li")];
const mobileTrail = document.querySelector(".nav-trail");

function pathTo(place) {
  const path = [];
  for (let p = place; p; p = p.parentElement.closest("[data-nav]")) path.unshift(p);
  return path;
}

function whereAmI() {
  const page = document.documentElement;
  const atBottom = window.innerHeight + window.scrollY >= page.scrollHeight - 4;
  // at the very bottom, the last place on screen wins
  const line = atBottom ? window.innerHeight : window.innerHeight * 0.3;
  let here = places[0];
  for (const place of places) if (place.getBoundingClientRect().top <= line) here = place;
  return pathTo(here);
}

// erase what differs, then type the rest
function retype(label, text) {
  clearTimeout(label.typing);
  if (reduceMotion.matches) {
    label.textContent = text;
    return;
  }
  const step = () => {
    const shown = label.textContent;
    if (!text.startsWith(shown)) label.textContent = shown.slice(0, -1);
    else if (shown.length < text.length) label.textContent = text.slice(0, shown.length + 1);
    else return;
    label.typing = setTimeout(step, text.startsWith(label.textContent) ? 32 : 14);
  };
  step();
}

function makeLine(depth) {
  const line = document.createElement("li");
  line.className = "trail-line";
  line.style.setProperty("--depth", depth);
  line.innerHTML = '<a><span class="branch" aria-hidden="true">|_</span> <span class="label"></span></a>';
  return line;
}

function removeLine(line) {
  line.classList.add("is-leaving");
  line.classList.remove("is-in", "is-leaf");
  setTimeout(() => line.remove(), reduceMotion.matches ? 0 : 450);
}

function setTrail(list, sub) {
  const lines = [...list.children].filter((line) => !line.classList.contains("is-leaving"));
  lines.slice(sub.length).forEach(removeLine);

  sub.forEach((place, depth) => {
    let line = lines[depth];
    if (!line) {
      line = makeLine(depth + 1);
      list.append(line);
      void line.offsetHeight; // start the transition from the folded state
      line.classList.add("is-in");
    }
    if (line.dataset.id === place.id) return;
    line.dataset.id = place.id;
    line.firstChild.href = "#" + place.id;
    retype(line.querySelector(".label"), place.dataset.nav);
  });

  const kept = [...list.children].filter((line) => !line.classList.contains("is-leaving"));
  kept.forEach((line, k) => line.classList.toggle("is-leaf", k === kept.length - 1));
}

let here = "";

function updateNav() {
  const [top, ...sub] = whereAmI();
  const key = [top, ...sub].map((place) => place.id).join("/");
  if (key === here) return;
  here = key;

  navItems.forEach((item) => {
    const active = item.dataset.for === top.id;
    item.classList.toggle("is-active", active);
    const link = item.querySelector(":scope > a");
    if (active) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
    setTrail(item.querySelector(".trail"), active ? sub : []);
  });
  if (mobileTrail) setTrail(mobileTrail, sub);
}

let queued = false;
function scheduleNav() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    updateNav();
    followMatch();
  });
}

window.addEventListener("scroll", scheduleNav, { passive: true });
window.addEventListener("resize", scheduleNav);
if ("ResizeObserver" in window) new ResizeObserver(scheduleNav).observe(document.querySelector("main"));
updateNav();

// Hawkes strips -----------------------------------------------------------------
// Each section title sits on a freshly sampled self-exciting point process:
// the conditional intensity on top, the events as a rug below. The strip
// unrolls from left to right, like time. Clicking it draws another sample.

const SVG_NS = "http://www.w3.org/2000/svg";
const HAWKES = { mu: 0.12, alpha: 0.9, beta: 1.5, T: 100 };

function poisson(mean) {
  let n = 0;
  let p = Math.exp(-mean);
  let sum = p;
  const u = Math.random();
  while (u > sum) {
    n++;
    p *= mean / n;
    sum += p;
  }
  return n;
}

// cluster representation: immigrants at rate mu, each event has
// Poisson(alpha / beta) children, delayed by Exp(beta)
function sampleHawkes({ mu, alpha, beta, T }) {
  const pending = Array.from({ length: poisson(mu * T) }, () => Math.random() * T);
  const events = [];
  while (pending.length) {
    const t = pending.pop();
    if (t > T) continue;
    events.push(t);
    for (let k = poisson(alpha / beta); k > 0; k--) pending.push(t - Math.log(1 - Math.random()) / beta);
  }
  return events.sort((a, b) => a - b);
}

function svgEl(name, attrs) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

function drawHawkes(holder) {
  const { mu, alpha, beta, T } = HAWKES;
  const W = 1000, TOP = 4, BASE = 42, RUG = [49, 62];
  let events;
  do events = sampleHawkes(HAWKES);
  while (events.length < 12 || events.length > 48);

  // intensity: exponential decay between events, a jump of alpha at each one
  const points = [[0, mu]];
  let t = 0;
  let excess = 0;
  const decayTo = (next) => {
    const steps = Math.max(1, Math.ceil((next - t) * 3));
    for (let k = 1; k <= steps; k++) {
      const s = t + ((next - t) * k) / steps;
      points.push([s, mu + excess * Math.exp(-beta * (s - t))]);
    }
    excess *= Math.exp(-beta * (next - t));
    t = next;
  };
  for (const event of events) {
    decayTo(event);
    excess += alpha;
    points.push([event, mu + excess]);
  }
  decayTo(T);

  const peak = Math.max(...points.map(([, level]) => level));
  const x = (time) => ((time / T) * W).toFixed(1);
  const y = (level) => (BASE - (level / peak) * (BASE - TOP)).toFixed(1);
  const curve = "M" + points.map(([s, level]) => `${x(s)},${y(level)}`).join("L");

  const svg = svgEl("svg", { viewBox: `0 0 ${W} 64`, preserveAspectRatio: "none" });
  svg.append(
    svgEl("path", { class: "area", d: `${curve}L${W},${BASE}L0,${BASE}Z` }),
    svgEl("path", { class: "curve", d: curve, "vector-effect": "non-scaling-stroke" }),
    svgEl("line", { class: "base", x1: 0, x2: W, y1: BASE, y2: BASE, "vector-effect": "non-scaling-stroke" }),
    ...events.map((event) =>
      svgEl("line", { class: "tick", x1: x(event), x2: x(event), y1: RUG[0], y2: RUG[1], "vector-effect": "non-scaling-stroke" })
    )
  );
  holder.replaceChildren(svg);
}

document.querySelectorAll(".hawkes").forEach((holder) => {
  drawHawkes(holder);
  holder.addEventListener("click", () => {
    holder.classList.remove("is-visible");
    drawHawkes(holder);
    void holder.offsetWidth;
    holder.classList.add("is-visible");
  });
});

// Reveal on scroll ------------------------------------------------------------

document.querySelectorAll("[data-stagger]").forEach((group) => {
  [...group.children].forEach((child, i) => child.style.setProperty("--i", i));
});

const revealed = document.querySelectorAll(".reveal, .hawkes");
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px" }
  );
  revealed.forEach((el) => observer.observe(el));
} else {
  revealed.forEach((el) => el.classList.add("is-visible"));
}

// Abstract toggles --------------------------------------------------------------
// Wide screens: the abstract opens in a panel of the left column, under the
// navbar, next to the project it belongs to. Narrow screens (the navbar is then
// a bar at the top): it unfolds inside the project, below the card.

document.querySelectorAll(".project-card .collapsible").forEach((panel) => {
  panel.closest(".project")?.append(panel);
});

const wideLayout = window.matchMedia("(min-width: 861px)");
const dock = document.querySelector(".abstract-dock");
const dockNum = dock?.querySelector(".project-num");
const dockTitle = dock?.querySelector(".dock-title");
const dockText = dock?.querySelector(".abstract");
const abstractButtons = [...document.querySelectorAll("button[aria-expanded][aria-controls]")];
let dockOwner = null; // the Abstract button whose text is in the panel

// the navbar can grow a little with its trail: the panel starts right under it
const navbar = document.querySelector(".navbar");
if (navbar && "ResizeObserver" in window) {
  new ResizeObserver(() =>
    document.documentElement.style.setProperty("--nav-h", navbar.offsetHeight + "px")
  ).observe(navbar);
}

abstractButtons.forEach((button) => (button.dataset.panel = button.getAttribute("aria-controls")));

function inlinePanel(button) {
  return document.getElementById(button.dataset.panel);
}

function syncControls() {
  abstractButtons.forEach((button) =>
    button.setAttribute("aria-controls", dock && wideLayout.matches ? dock.id : button.dataset.panel)
  );
}

function resetAbstracts() {
  dockOwner = null;
  dock?.classList.remove("is-open");
  abstractButtons.forEach((button) => {
    button.setAttribute("aria-expanded", "false");
    inlinePanel(button)?.classList.remove("is-open");
  });
  refreshDock();
}

// the panel only shows while its project is on screen
const onScreen = new Set();
function refreshDock() {
  if (!dock) return;
  const away = !dockOwner || !onScreen.has(dockOwner.closest(".project"));
  dock.classList.toggle("is-away", away);
  // the navbar is compact exactly while an abstract is visible under it
  navbar?.classList.toggle("is-abstract-open", !away);
}

if (dock && "IntersectionObserver" in window) {
  const watcher = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) onScreen.add(entry.target);
      else onScreen.delete(entry.target);
    }
    refreshDock();
  });
  document.querySelectorAll(".project").forEach((project) => watcher.observe(project));
}

function openInDock(button) {
  const project = button.closest(".project");
  dockOwner = button;
  dockNum.textContent = project.querySelector(".project-num").textContent;
  dockTitle.textContent = project.querySelector("h4").textContent;
  dockText.textContent = inlinePanel(button).querySelector(".abstract").textContent.trim();
  dock.querySelector(".dock-body").scrollTop = 0;
  button.setAttribute("aria-expanded", "true");
  dock.classList.add("is-open");
  // a project that is only just visible should not hide its own abstract
  onScreen.add(project);
  refreshDock();
}

function closeDock() {
  const owner = dockOwner;
  resetAbstracts();
  if (owner && dock.contains(document.activeElement)) owner.focus({ preventScroll: true });
}

abstractButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (dock && wideLayout.matches) {
      const wasOwner = button === dockOwner;
      resetAbstracts();
      if (!wasOwner) openInDock(button);
      return;
    }
    const panel = inlinePanel(button);
    const open = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(open));
    panel.classList.toggle("is-open", open);
  });
});

dock?.querySelector(".dock-close").addEventListener("click", closeDock);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !dockOwner || activeKey) return;
  if (document.querySelector(".lightbox")?.open) return;
  closeDock();
});

syncControls();
wideLayout.addEventListener("change", () => {
  resetAbstracts();
  syncControls();
});

// Example tabs ------------------------------------------------------------------

document.querySelectorAll('[role="tablist"]').forEach((list) => {
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  const select = (tab) => {
    tabs.forEach((other) => {
      const selected = other === tab;
      other.setAttribute("aria-selected", String(selected));
      other.tabIndex = selected ? 0 : -1;
      document.getElementById(other.getAttribute("aria-controls")).hidden = !selected;
    });
  };
  list.addEventListener("click", (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (tab) select(tab);
  });
  list.addEventListener("keydown", (event) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    const i = tabs.indexOf(document.activeElement);
    if (!step || i < 0) return;
    event.preventDefault();
    const next = tabs[(i + step + tabs.length) % tabs.length];
    select(next);
    next.focus();
  });
});

// Project keywords --------------------------------------------------------------
// Each project lists five keywords. Clicking one works like find-in-page: the
// projects sharing it stay lit, the others fade, and a small bar counts them,
// lists them and steps through them. Clicking it again, ×, or Escape clears.

const projectList = document.querySelector("#projects");
const projects = [...document.querySelectorAll(".project")];
const finder = document.querySelector(".finder");
const finderKeyword = finder.querySelector(".finder-kw");
const finderCount = finder.querySelector(".finder-count");
const finderList = finder.querySelector(".finder-list");
const [previousButton, nextButton] = finder.querySelectorAll("[data-step]");

const keyOf = (text) => text.trim().toLowerCase();
const labels = new Map(); // key -> label as first written
const sharedBy = new Map(); // key -> projects listing it

projects.forEach((project) => {
  project.querySelectorAll(".keywords li").forEach((item) => {
    const label = item.textContent.trim();
    const key = keyOf(label);
    if (!labels.has(key)) labels.set(key, label);
    if (!sharedBy.has(key)) sharedBy.set(key, []);
    sharedBy.get(key).push(project);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "kw";
    button.dataset.key = key;
    button.setAttribute("aria-pressed", "false");
    button.textContent = label;
    item.replaceChildren(button);
  });
});

const chips = [...document.querySelectorAll(".kw")];
chips.forEach((chip) => {
  const count = sharedBy.get(chip.dataset.key).length;
  chip.title = count > 1 ? `Shared by ${count} projects` : "Only in this project";
  if (count > 1) chip.insertAdjacentHTML("beforeend", `<span class="kw-count" aria-hidden="true">${count}</span>`);
});

// The research interests of the About section use the same keywords: clicking
// one starts the search and jumps to the first project that lists it.
const interestChips = [...document.querySelectorAll(".interests .chips li")].flatMap((item) => {
  const label = item.textContent.trim();
  const key = keyOf(label);
  if (!sharedBy.has(key)) return []; // no project lists it: stays a plain label
  const count = sharedBy.get(key).length;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "interest";
  button.dataset.key = key;
  button.setAttribute("aria-pressed", "false");
  button.title = count > 1 ? `Jump to the ${count} projects on this` : "Jump to the project on this";
  button.append(label);
  button.insertAdjacentHTML("beforeend", `<span class="kw-count" aria-hidden="true">${count}</span>`);
  item.replaceChildren(button);
  return [button];
});

const keyButtons = [...chips, ...interestChips]; // everything that reflects the current search

let activeKey = null;
let matches = [];
let current = -1;
let openedFrom = null;
let holdUntil = 0; // while a step scrolls, don't let the passing view pick the current match

function setCurrent(index, scroll) {
  current = index;
  projects.forEach((project) => project.classList.toggle("is-current", project === matches[index]));
  finderCount.textContent = `${index + 1} / ${matches.length}`;
  [...finderList.children].forEach((item, i) =>
    item.firstChild.setAttribute("aria-current", String(i === index))
  );
  // on phones the list scrolls sideways: keep the current one in sight
  const item = finderList.children[index];
  if (item) finderList.scrollLeft = item.offsetLeft - finderList.offsetLeft - 8;
  if (!scroll) return;
  holdUntil = performance.now() + 1500;
  matches[index].scrollIntoView({ block: "start" });
}

function findKeyword(key, from, scroll = false) {
  activeKey = key;
  matches = sharedBy.get(key);
  projectList.classList.add("is-finding");
  projects.forEach((project) => project.classList.toggle("is-match", matches.includes(project)));
  keyButtons.forEach((chip) => {
    const hit = chip.dataset.key === key;
    chip.classList.toggle("is-hit", hit);
    chip.setAttribute("aria-pressed", String(hit));
  });

  finderKeyword.textContent = labels.get(key);
  finderList.replaceChildren(
    ...matches.map((project, i) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.innerHTML = `<span class="finder-num">${project.querySelector(".project-num").textContent}</span> `;
      button.append(project.dataset.nav);
      button.addEventListener("click", () => setCurrent(i, true));
      item.append(button);
      return item;
    })
  );
  previousButton.disabled = nextButton.disabled = matches.length < 2;
  finder.hidden = false;
  setCurrent(Math.max(0, matches.indexOf(from)), scroll);
}

function clearKeyword() {
  if (!activeKey) return;
  const refocus = finder.contains(document.activeElement);
  activeKey = null;
  matches = [];
  projectList.classList.remove("is-finding");
  projects.forEach((project) => project.classList.remove("is-match", "is-current"));
  keyButtons.forEach((chip) => {
    chip.classList.remove("is-hit");
    chip.setAttribute("aria-pressed", "false");
  });
  finder.hidden = true;
  if (refocus && openedFrom) openedFrom.focus({ preventScroll: true });
}

chips.forEach((chip) =>
  chip.addEventListener("click", () => {
    if (chip.dataset.key === activeKey) return clearKeyword();
    openedFrom = chip;
    findKeyword(chip.dataset.key, chip.closest(".project"));
  })
);

interestChips.forEach((chip) =>
  chip.addEventListener("click", () => {
    if (chip.dataset.key === activeKey) return clearKeyword();
    openedFrom = chip;
    findKeyword(chip.dataset.key, null, true);
  })
);

finder.querySelectorAll("[data-step]").forEach((button) =>
  button.addEventListener("click", () => {
    const step = Number(button.dataset.step);
    setCurrent((current + step + matches.length) % matches.length, true);
  })
);
finder.querySelector("[data-close]").addEventListener("click", clearKeyword);

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !activeKey) return;
  if (document.querySelector(".lightbox")?.open) return;
  clearKeyword();
});

// the match under the reading line becomes the current one
function followMatch() {
  if (!activeKey || performance.now() < holdUntil) return;
  const line = window.innerHeight * 0.3;
  const index = matches.findIndex((project) => {
    const box = project.getBoundingClientRect();
    return box.top <= line && box.bottom > line;
  });
  if (index >= 0 && index !== current) setCurrent(index, false);
}

window.addEventListener("scrollend", () => (holdUntil = 0));

// the bar steps aside while the projects are off screen
if ("IntersectionObserver" in window) {
  new IntersectionObserver(([entry]) => finder.classList.toggle("is-away", !entry.isIntersecting)).observe(projectList);
}

// Figure lightbox -----------------------------------------------------------------

const lightbox = document.querySelector(".lightbox");
if (lightbox && typeof lightbox.showModal === "function") {
  const image = lightbox.querySelector("img");
  const caption = lightbox.querySelector("figcaption");

  document.querySelectorAll(".zoomable img").forEach((figure) => {
    figure.tabIndex = 0;
    figure.setAttribute("role", "button");
    figure.setAttribute("aria-label", `Enlarge: ${figure.alt}`);
    const open = () => {
      image.src = figure.currentSrc || figure.src;
      image.alt = figure.alt;
      caption.textContent = figure.closest("figure").querySelector("figcaption")?.textContent ?? "";
      lightbox.showModal();
    };
    figure.addEventListener("click", open);
    figure.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      open();
    });
  });

  lightbox.addEventListener("click", () => lightbox.close());
}
