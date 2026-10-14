/** Reverse-prompt copywriter — pure templates, persona & tone aware.
 *  Groq hookup point: swap buildMessage() output for an LLM rewrite if
 *  settings.groqKey is set (keep these as offline fallback). */

const CAT_LABEL = {
  code: "coding", docs: "that document", study: "studying", design: "designing",
  ai: "your AI session", browse: "browsing", comms: "messages", social: "social",
  media: "videos", other: "work",
};

function tone(profile, gentle, mid, direct) {
  const t = profile.tone ?? 45;
  return t <= 33 ? gentle : t >= 67 ? direct : mid;
}
function personaPrefix(profile) {
  switch (profile.persona) {
    case "mentor": return "Mentor view: ";
    case "clone": return `${profile.cloneName || "Your tutor"}'s buddy: `;
    case "support": return "Gentle check-in: ";
    default: return "";
  }
}

export function buildMessage(event, profile = {}) {
  const name = (profile.name || "friend").trim() || "friend";
  const p = (g, m, d) => personaPrefix(profile) + tone(profile, g, m, d);
  const d = event;

  switch (event.type) {
    case "morning_hello":
      return { mood: "celebrate", text: p(
        `good morning, ${name} ☀️ I'm here for the day. Want me to keep an eye on your focus?`,
        `Morning, ${name}. On watch — I'll speak up when it's useful.`,
        `Morning. Watching. Go.`) };
    case "focus_streak":
      return { mood: "celebrate", text: p(
        `${d.minutes} minutes straight on ${CAT_LABEL[d.cat] ?? d.cat}, ${name}! 🎉 you're in the zone — I'll guard the door.`,
        `${d.minutes} min focused on ${CAT_LABEL[d.cat] ?? d.cat}. Streak noted — keep going or bank a break soon.`,
        `${d.minutes} min focus. Solid. Break in 10 or push to 50 — your call.`) };
    case "deep_focus":
      return { mood: "stretch", text: p(
        `almost an hour of deep work 🫧 amazing — and your eyes deserve 2 minutes of far-away looking. Tiny stretch with me?`,
        `${d.minutes} min deep focus. Science says: 2-min break now protects the next hour. Stretch?`,
        `${d.minutes} min. Take 2. Then continue.`) };
    case "doc_grind":
      return { mood: "watching", text: p(
        `you've been in “${d.title}” for ${d.minutes} minutes 📖 want me to quiz you on it, or summarize where you are?`,
        `${d.minutes} min in “${d.title}”. Offer: quiz or summary — both make it stick.`,
        `${d.minutes} min, one doc. Quiz or summary?`) };
    case "rapid_switching":
      return { mood: "dizzy", text: p(
        `whoa — ${d.switches} switches in three minutes 💫 feeling scattered, ${name}? pick ONE thing and I'll hold the rest.`,
        `${d.switches} context switches in 3 min. Pick one task; I'll park the others.`,
        `${d.switches} switches/3min. Scattered. One thing. Now.`) };
    case "social_drift":
      return { mood: "cheeky", text: p(
        `${d.minutes} minutes of ${CAT_LABEL[d.cat]} 📱 no judgment… okay tiny judgment 😏 back to it, or is this an official break?`,
        `${d.minutes} min on ${CAT_LABEL[d.cat]}. Break or drift? If break — enjoy it properly. If drift — I saved your place.`,
        `${d.minutes} min ${CAT_LABEL[d.cat]}. Break over. Back.`) };
    case "late_night":
      return { mood: "sleepy", text: p(
        `psst ${name} — it's past ${d.hour}:00 🌙 every hour now costs two tomorrow. one stretch, then we land this?`,
        `Past ${d.hour}:00. Sleep beats grind at this hour — shall I queue tomorrow's first task?`,
        `${d.hour}:00+. Sleep. I'll queue tomorrow. Night.`) };
    case "idle_return":
      return { mood: "loved", text: p(
        `welcome back, ${name} 💜 you were away ${d.awayMin} min — I kept everything right where you left it.`,
        `Back after ${d.awayMin} min. Nothing missed. Resuming watch.`,
        `Back (${d.awayMin}m). Continue.`) };
    default:
      return { mood: "watching", text: p(`I'm here, ${name} 🫧`, `Watching quietly.`, `Here.`) };
  }
}
