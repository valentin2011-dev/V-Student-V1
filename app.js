const $ = (id) => document.getElementById(id);

let dashboard = null;

async function api(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function formatDue(due) {
  if (!due) return "Aucune date";
  const date = new Date(due.year, due.month - 1, due.day, due.hours || 23, due.minutes || 59);
  const now = new Date();
  const diff = date - now;
  const dateText = date.toLocaleDateString("fr-FR", { weekday:"short", day:"numeric", month:"short" });
  const timeText = date.toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" });
  return `${dateText} · ${timeText}`;
}

function isUrgent(due) {
  if (!due) return false;
  const date = new Date(due.year, due.month - 1, due.day, due.hours || 23, due.minutes || 59);
  return date - new Date() < 1000 * 60 * 60 * 48;
}

function renderHomework(items) {
  const list = $("homework-list");
  if (!items.length) {
    list.innerHTML = '<div class="empty">Aucun devoir à venir 🎉</div>';
    return;
  }
  list.innerHTML = items.slice(0, 15).map((item) => `
    <article class="item">
      <div class="item-row">
        <div>
          <div class="item-title">${escapeHtml(item.title)}</div>
          <div class="item-meta">${escapeHtml(item.courseName)}</div>
        </div>
        <div class="due ${isUrgent(item.due) ? "urgent" : ""}">
          ${escapeHtml(formatDue(item.due))}
        </div>
      </div>
      ${item.link ? `<div style="margin-top:10px"><a class="item-link" target="_blank" rel="noopener" href="${escapeHtml(item.link)}">Ouvrir dans Classroom ↗</a></div>` : ""}
    </article>
  `).join("");
}

function formatEventDate(value) {
  if (!value) return "Date inconnue";
  const date = new Date(value);
  return date.toLocaleString("fr-FR", {
    weekday:"short", day:"numeric", month:"short",
    hour: value.includes("T") ? "2-digit" : undefined,
    minute: value.includes("T") ? "2-digit" : undefined
  });
}

function renderCalendar(events) {
  const list = $("calendar-list");
  if (!events.length) {
    list.innerHTML = '<div class="empty">Aucun événement dans les 60 prochains jours.</div>';
    return;
  }
  list.innerHTML = events.slice(0, 12).map((event) => `
    <article class="item">
      <div class="item-title">${escapeHtml(event.title)}</div>
      <div class="item-meta">${escapeHtml(formatEventDate(event.start))}</div>
      ${event.link ? `<div style="margin-top:8px"><a class="item-link" target="_blank" rel="noopener" href="${escapeHtml(event.link)}">Ouvrir Calendar ↗</a></div>` : ""}
    </article>
  `).join("");
}

function renderCourses(courses) {
  const list = $("courses-list");
  if (!courses.length) {
    list.innerHTML = '<div class="empty">Aucun cours récupéré.</div>';
    return;
  }
  list.innerHTML = courses.map((course) => `
    <div class="course">
      <strong>${escapeHtml(course.name)}</strong>
      <small>${escapeHtml(course.section || "Cours")}</small>
    </div>
  `).join("");
}

async function load() {
  $("error").classList.add("hidden");
  $("refresh").textContent = "Synchronisation…";
  try {
    dashboard = await api("/api/dashboard");

    $("stat-homework").textContent = dashboard.coursework.length;
    $("stat-courses").textContent = dashboard.courses.length;

    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekCount = dashboard.coursework.filter((x) => {
      if (!x.due) return false;
      const d = new Date(x.due.year, x.due.month - 1, x.due.day);
      return d <= weekEnd;
    }).length;
    $("stat-week").textContent = weekCount;

    $("updated").textContent = `Dernière synchro · ${new Date(dashboard.generatedAt).toLocaleTimeString("fr-FR", {hour:"2-digit", minute:"2-digit"})}`;
    renderHomework(dashboard.coursework);
    renderCalendar(dashboard.events);
    renderCourses(dashboard.courses);
  } catch (error) {
    console.error(error);
    $("error").textContent = "Impossible de récupérer les données Google : " + error.message;
    $("error").classList.remove("hidden");
  } finally {
    $("refresh").textContent = "↻ Actualiser";
  }
}

async function init() {
  const status = await api("/api/status");

  if (!status.authenticated) {
    $("login-view").classList.remove("hidden");
    $("app-view").classList.add("hidden");
    return;
  }

  $("login-view").classList.add("hidden");
  $("app-view").classList.remove("hidden");
  $("user-chip").textContent = status.user.email;
  $("user-chip").classList.remove("hidden");
  $("logout").classList.remove("hidden");

  const firstName = (status.user.name || "").split(" ")[0];
  $("first-name").textContent = firstName ? ` ${firstName}` : "";

  await load();
}

$("refresh").addEventListener("click", load);
$("logout").addEventListener("click", async () => {
  await api("/auth/logout", { method:"POST" });
  location.reload();
});

init().catch((error) => {
  console.error(error);
  $("error").textContent = error.message;
  $("error").classList.remove("hidden");
});
