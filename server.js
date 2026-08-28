require("dotenv").config();

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const { google } = require("googleapis");

const app = express();
const PORT = Number(process.env.PORT || 3000);

const REQUIRED_ENV = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "SESSION_SECRET"
];

const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length) {
  console.error("Missing environment variables:", missing.join(", "));
  console.error("Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
  "https://www.googleapis.com/auth/calendar.readonly"
];

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: false
  }
}));

app.use(express.static(path.join(__dirname, "public")));

function authUrl(state) {
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    include_granted_scopes: true,
    state
  });
}

function makeClient(tokens) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  client.setCredentials(tokens);
  return client;
}

async function getAuthenticatedClient(req) {
  if (!req.session.tokens) return null;
  const client = makeClient(req.session.tokens);

  client.on("tokens", (newTokens) => {
    req.session.tokens = { ...req.session.tokens, ...newTokens };
  });

  return client;
}

app.get("/auth/google", (req, res) => {
  const state = crypto.randomBytes(24).toString("hex");
  req.session.oauthState = state;
  res.redirect(authUrl(state));
});

app.get("/oauth2callback", async (req, res) => {
  try {
    if (!req.query.code || !req.query.state || req.query.state !== req.session.oauthState) {
      return res.status(400).send("OAuth state/code invalid. Please restart the login.");
    }

    const { tokens } = await oauth2Client.getToken(req.query.code);
    req.session.tokens = tokens;
    delete req.session.oauthState;

    res.redirect("/");
  } catch (error) {
    console.error(error.response?.data || error);
    res.status(500).send("Google OAuth failed. Check the terminal for details.");
  }
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/status", async (req, res) => {
  if (!req.session.tokens) {
    return res.json({ authenticated: false });
  }

  try {
    const auth = await getAuthenticatedClient(req);
    const oauth2 = google.oauth2({ version: "v2", auth });
    const { data } = await oauth2.userinfo.get();
    res.json({
      authenticated: true,
      user: {
        name: data.name || "",
        email: data.email || "",
        picture: data.picture || ""
      }
    });
  } catch (error) {
    console.error(error.response?.data || error);
    req.session.tokens = null;
    res.json({ authenticated: false });
  }
});

app.get("/api/dashboard", async (req, res) => {
  if (!req.session.tokens) {
    return res.status(401).json({ error: "NOT_AUTHENTICATED" });
  }

  try {
    const auth = await getAuthenticatedClient(req);
    const classroom = google.classroom({ version: "v1", auth });
    const calendar = google.calendar({ version: "v3", auth });

    const coursesResponse = await classroom.courses.list({
      courseStates: ["ACTIVE"],
      pageSize: 100
    });

    const courses = coursesResponse.data.courses || [];

    const coursework = [];
    for (const course of courses) {
      try {
        const response = await classroom.courses.courseWork.list({
          courseId: course.id,
          courseWorkStates: ["PUBLISHED"],
          orderBy: "dueDate asc",
          pageSize: 100
        });

        for (const work of response.data.courseWork || []) {
          coursework.push({
            id: work.id,
            courseId: course.id,
            courseName: course.name,
            title: work.title || "Sans titre",
            description: work.description || "",
            due: work.dueDate ? {
              year: work.dueDate.year,
              month: work.dueDate.month,
              day: work.dueDate.day,
              hours: work.dueTime?.hours || 23,
              minutes: work.dueTime?.minutes || 59
            } : null,
            link: work.alternateLink || null,
            state: work.state || null
          });
        }
      } catch (error) {
        // A course can be visible while its coursework is restricted.
        console.warn(`Could not read coursework for course ${course.id}:`, error.response?.data?.error?.message || error.message);
      }
    }

    const now = new Date();
    const future = new Date(now);
    future.setDate(future.getDate() + 60);

    let events = [];
    try {
      const eventsResponse = await calendar.events.list({
        calendarId: "primary",
        timeMin: now.toISOString(),
        timeMax: future.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 100
      });
      events = (eventsResponse.data.items || []).map((event) => ({
        id: event.id,
        title: event.summary || "Sans titre",
        start: event.start?.dateTime || event.start?.date || null,
        end: event.end?.dateTime || event.end?.date || null,
        link: event.htmlLink || null
      }));
    } catch (error) {
      console.warn("Could not read Calendar:", error.response?.data?.error?.message || error.message);
    }

    coursework.sort((a, b) => {
      if (!a.due && !b.due) return 0;
      if (!a.due) return 1;
      if (!b.due) return -1;
      return dueTimestamp(a.due) - dueTimestamp(b.due);
    });

    res.json({
      generatedAt: new Date().toISOString(),
      courses: courses.map((c) => ({ id: c.id, name: c.name, section: c.section || "" })),
      coursework,
      events
    });
  } catch (error) {
    console.error(error.response?.data || error);
    const message = error.response?.data?.error?.message || error.message || "Google API error";
    res.status(error.code === 401 ? 401 : 500).json({ error: message });
  }
});

function dueTimestamp(due) {
  // Classroom due dates are school-local dates. This is deliberately a simple
  // V1 display conversion; timezone-aware handling can be improved later.
  return new Date(
    Number(due.year),
    Number(due.month) - 1,
    Number(due.day),
    Number(due.hours || 23),
    Number(due.minutes || 59)
  ).getTime();
}

app.get("*splat", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`V-Student V1 running at http://localhost:${PORT}`);
});
