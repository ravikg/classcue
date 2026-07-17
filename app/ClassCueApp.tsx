"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Enrollment = {
  id: string;
  childId: string;
  name: string;
  subject: string;
  location: string | null;
  providerName: string | null;
};

type Child = {
  id: string;
  name: string;
  color: string;
  enrollments: Enrollment[];
};

type ClassSession = {
  id: string;
  childId: string;
  childName: string;
  childColor: string;
  enrollmentId: string;
  enrollmentName: string;
  providerName: string | null;
  location: string | null;
  localDate: string;
  plannedStartAt: string;
  plannedEndAt: string;
  timezone: string;
  status: string;
};

type Snapshot = {
  user: { displayName: string };
  household: { timezone: string; today: string };
  children: Child[];
  upcomingSessions: ClassSession[];
};

type Tab = "today" | "children" | "fees" | "more";
type Sheet = "child" | "enrollment" | null;

const navItems: { id: Tab; label: string; icon: string }[] = [
  { id: "today", label: "Today", icon: "⌂" },
  { id: "children", label: "Children", icon: "◎" },
  { id: "fees", label: "Fees", icon: "¤" },
  { id: "more", label: "More", icon: "•••" },
];

export function ClassCueApp({ displayName }: { displayName: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [tab, setTab] = useState<Tab>("today");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const response = await fetch("/api/bootstrap", { cache: "no-store" });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Unable to load ClassCue.");
    }
    setSnapshot((await response.json()) as Snapshot);
  }, []);

  useEffect(() => {
    load().catch((reason: Error) => setError(reason.message));
  }, [load]);

  const refresh = async () => {
    await load();
    setSheet(null);
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="wordmark"><span className="mini-mark">C</span>ClassCue</div>
        <button className="avatar-button" aria-label="Open account" onClick={() => setTab("more")}>
          {initials(displayName)}
        </button>
      </header>

      {error ? (
        <section className="error-panel">
          <strong>We couldn’t load your family.</strong>
          <p>{error}</p>
          <button className="secondary-button" onClick={() => load().catch(() => undefined)}>Try again</button>
        </section>
      ) : !snapshot ? (
        <LoadingState />
      ) : (
        <div className="app-content">
          {tab === "today" && <TodayView snapshot={snapshot} onAddChild={() => setSheet("child")} onAddClass={() => setSheet("enrollment")} />}
          {tab === "children" && <ChildrenView snapshot={snapshot} onAddChild={() => setSheet("child")} onAddClass={() => setSheet("enrollment")} />}
          {tab === "fees" && <ComingSoon title="Fees are the next domain" body="The data model is ready for mixed currencies, monthly fees, terms, packages, adjustments, and parent-confirmed payments." />}
          {tab === "more" && <MoreView snapshot={snapshot} />}
        </div>
      )}

      <nav className="bottom-nav" aria-label="Primary navigation">
        {navItems.map((item) => (
          <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>
            <span aria-hidden="true">{item.icon}</span>{item.label}
          </button>
        ))}
      </nav>

      {sheet === "child" && <ChildSheet onClose={() => setSheet(null)} onSaved={refresh} />}
      {sheet === "enrollment" && snapshot && <EnrollmentSheet children={snapshot.children} onClose={() => setSheet(null)} onSaved={refresh} />}
    </main>
  );
}

function TodayView({ snapshot, onAddChild, onAddClass }: { snapshot: Snapshot; onAddChild: () => void; onAddClass: () => void }) {
  const todaySessions = snapshot.upcomingSessions.filter((session) => session.localDate === snapshot.household.today);
  const nextSessions = snapshot.upcomingSessions.filter((session) => session.localDate >= snapshot.household.today).slice(0, 4);
  const firstName = snapshot.user.displayName.split(/\s|@/)[0];
  const displaySessions = todaySessions.length > 0 ? todaySessions : nextSessions;

  return (
    <>
      <section className="page-intro">
        <p className="eyebrow">{longDate(snapshot.household.today)}</p>
        <h1>{snapshot.children.length === 0 ? `Welcome, ${firstName}` : `Good ${dayPart()}, ${firstName}`}</h1>
        <p>{snapshot.children.length === 0 ? "Let’s put the first class on your family’s cue." : todaySessions.length > 0 ? `${todaySessions.length} ${todaySessions.length === 1 ? "class" : "classes"} need your attention today.` : "Nothing urgent today. Here’s what is coming next."}</p>
      </section>

      {snapshot.children.length === 0 ? (
        <section className="onboarding-card">
          <div className="onboarding-number">01</div>
          <div>
            <p className="eyebrow">Start with a child</p>
            <h2>Build the family view one class at a time.</h2>
            <p>Add a child first. ClassCue will then connect their class, weekly schedule, teacher, and future sessions.</p>
          </div>
          <button className="primary-button" onClick={onAddChild}>Add first child</button>
        </section>
      ) : (
        <>
          <section className="summary-strip" aria-label="Household summary">
            <div><strong>{todaySessions.length}</strong><span>Today</span></div>
            <div><strong>{snapshot.children.length}</strong><span>Children</span></div>
            <div><strong>{snapshot.children.reduce((sum, child) => sum + child.enrollments.length, 0)}</strong><span>Classes</span></div>
          </section>

          <div className="section-heading">
            <div><p className="eyebrow">{todaySessions.length > 0 ? "Today’s cue" : "Coming up"}</p><h2>{todaySessions.length > 0 ? "Classes by child" : "The next classes"}</h2></div>
            <button className="text-button" onClick={onAddClass}>+ Add class</button>
          </div>

          {displaySessions.length === 0 ? (
            <section className="empty-card"><h3>No class sessions yet</h3><p>Add a recurring class and ClassCue will prepare the next 90 days.</p><button className="primary-button" onClick={onAddClass}>Add a class</button></section>
          ) : (
            <section className="session-list">
              {displaySessions.map((session) => <SessionCard key={session.id} session={session} showDate={todaySessions.length === 0} />)}
            </section>
          )}
        </>
      )}
    </>
  );
}

function SessionCard({ session, showDate }: { session: ClassSession; showDate: boolean }) {
  return (
    <article className="session-card">
      <div className={`child-dot ${session.childColor}`}>{session.childName.slice(0, 1).toUpperCase()}</div>
      <div className="session-main">
        <div className="session-topline"><span>{session.childName}</span><span className="status-pill">Scheduled</span></div>
        <h3>{session.enrollmentName}</h3>
        <p>{showDate ? `${shortDate(session.localDate)} · ` : ""}{timeRange(session)}</p>
        <p>{[session.providerName, session.location].filter(Boolean).join(" · ") || "Location not added"}</p>
      </div>
      <button className="round-action" aria-label={`Open ${session.enrollmentName}`}>›</button>
    </article>
  );
}

function ChildrenView({ snapshot, onAddChild, onAddClass }: { snapshot: Snapshot; onAddChild: () => void; onAddClass: () => void }) {
  return (
    <>
      <div className="section-heading page-heading"><div><p className="eyebrow">Family</p><h1>Children</h1></div><button className="text-button" onClick={onAddChild}>+ Add child</button></div>
      {snapshot.children.length === 0 ? <section className="empty-card"><h3>No children added</h3><p>Add the first child to begin their schedule.</p><button className="primary-button" onClick={onAddChild}>Add child</button></section> : (
        <section className="children-list">
          {snapshot.children.map((child) => (
            <article className="child-card" key={child.id}>
              <div className="child-card-head"><div className={`child-dot large ${child.color}`}>{child.name.slice(0, 1).toUpperCase()}</div><div><h2>{child.name}</h2><p>{child.enrollments.length} active {child.enrollments.length === 1 ? "class" : "classes"}</p></div></div>
              <div className="class-chips">
                {child.enrollments.map((enrollment) => <span key={enrollment.id}>{enrollment.name}<small>{enrollment.providerName}</small></span>)}
                {child.enrollments.length === 0 && <p className="muted">No classes yet.</p>}
              </div>
              <button className="secondary-button" onClick={onAddClass}>Add a class for {child.name}</button>
            </article>
          ))}
        </section>
      )}
    </>
  );
}

function MoreView({ snapshot }: { snapshot: Snapshot }) {
  return (
    <>
      <section className="page-intro"><p className="eyebrow">Account</p><h1>More</h1><p>Household settings and support information.</p></section>
      <section className="settings-card">
        <div><span>Signed in as</span><strong>{snapshot.user.displayName}</strong></div>
        <div><span>Household timezone</span><strong>{snapshot.household.timezone}</strong></div>
        <div><span>Data ownership</span><strong>Private household</strong></div>
      </section>
      <a className="secondary-button full-width" href="/signout-with-chatgpt?return_to=/">Sign out</a>
    </>
  );
}

function ComingSoon({ title, body }: { title: string; body: string }) {
  return <><section className="page-intro"><p className="eyebrow">Planned stage</p><h1>Fees</h1></section><section className="coming-card"><span className="coming-icon">¤</span><h2>{title}</h2><p>{body}</p><div className="roadmap-line"><span className="done"></span><span className="done"></span><span></span><span></span></div><small>Foundation and scheduling are underway</small></section></>;
}

function ChildSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [color, setColor] = useState("blue");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/children", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), color }) });
    if (!response.ok) { const data = await response.json() as { error?: string }; setError(data.error ?? "Could not add child."); setSaving(false); return; }
    await onSaved();
  }

  return <Sheet title="Add a child" subtitle="Start the family view" onClose={onClose}><form onSubmit={submit} className="sheet-form"><label>Child’s name<input name="name" required maxLength={80} autoFocus placeholder="e.g. Maya" /></label><fieldset><legend>Profile colour</legend><div className="color-picker">{["blue", "coral", "green", "gold"].map((value) => <button type="button" key={value} className={`${value} ${color === value ? "selected" : ""}`} onClick={() => setColor(value)} aria-label={`Use ${value}`}><span>✓</span></button>)}</div></fieldset>{error && <p className="form-error">{error}</p>}<button className="primary-button" disabled={saving}>{saving ? "Adding…" : "Add child"}</button></form></Sheet>;
}

function EnrollmentSheet({ children, onClose, onSaved }: { children: Child[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const weekdays = useMemo(() => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null);
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/enrollments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, weekday: Number(form.weekday), durationMinutes: Number(form.durationMinutes) }) });
    if (!response.ok) { const data = await response.json() as { error?: string }; setError(data.error ?? "Could not add class."); setSaving(false); return; }
    await onSaved();
  }

  if (children.length === 0) return <Sheet title="Add a class" subtitle="A child is needed first" onClose={onClose}><p className="muted">Close this panel and add a child before creating their first class.</p></Sheet>;

  return <Sheet title="Add a recurring class" subtitle="Class details and weekly schedule" onClose={onClose}><form onSubmit={submit} className="sheet-form two-column"><label>Child<select name="childId" required>{children.map((child) => <option value={child.id} key={child.id}>{child.name}</option>)}</select></label><label>Subject<input name="subject" required maxLength={100} placeholder="Math tuition" /></label><label className="span-two">Institute or teacher business<input name="instituteName" required maxLength={120} placeholder="Bright Minds Centre" /></label><label>Teacher name<input name="teacherName" maxLength={100} placeholder="Mr. Ali" /></label><label>Teacher phone<input name="teacherPhone" maxLength={40} inputMode="tel" placeholder="+971…" /></label><label>Weekly day<select name="weekday" required>{weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label><label>Start time<input name="startTime" type="time" required defaultValue="16:00" /></label><label>Duration<select name="durationMinutes" defaultValue="60"><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option></select></label><label>Location<input name="location" maxLength={160} placeholder="Room 3 or online" /></label>{error && <p className="form-error span-two">{error}</p>}<button className="primary-button span-two" disabled={saving}>{saving ? "Creating sessions…" : "Add class and prepare sessions"}</button></form></Sheet>;
}

function Sheet({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div className="sheet-handle"></div><header><div><p className="eyebrow">{subtitle}</p><h2 id="sheet-title">{title}</h2></div><button className="close-button" onClick={onClose} aria-label="Close">×</button></header>{children}</section></div>;
}

function LoadingState() { return <section className="loading-state" role="status" aria-label="Loading ClassCue"><div></div><div></div><div></div></section>; }
function initials(name: string) { return name.split(/\s|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "P"; }
function dayPart() { const hour = new Date().getHours(); return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"; }
function longDate(value: string) { return new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${value}T12:00:00`)); }
function shortDate(value: string) { return new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`)); }
function timeRange(session: ClassSession) { const format = (value: string) => new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: session.timezone }).format(new Date(value)); return `${format(session.plannedStartAt)}–${format(session.plannedEndAt)}`; }
