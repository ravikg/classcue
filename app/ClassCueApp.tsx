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
  attendanceSummary: {
    recorded: number;
    attended: number;
    absent: number;
    attendanceRate: number | null;
    lateArrivals: number;
    averageMinutesLate: number | null;
  };
  recentAttendance: AttendanceHistory[];
  recentSessions: ClassSession[];
  makeupBalance: number;
};

type AttendanceHistory = {
  sessionId: string;
  enrollmentName: string;
  providerName: string | null;
  localDate: string;
  plannedStartAt: string;
  timezone: string;
  attendanceStatus: string;
  punctuality: string | null;
  minutesLate: number | null;
  note: string | null;
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
  source: string;
  reason: string | null;
  compensationStatus: string | null;
  scheduleWeekday: number | null;
  scheduleStartTime: string | null;
  scheduleDurationMinutes: number | null;
  linkedSessionId: string | null;
  linkedSessionLocalDate: string | null;
  linkType: string | null;
  attendanceStatus: string | null;
  punctuality: string | null;
  minutesLate: number | null;
  attendanceNote: string | null;
  canRecordAttendance: boolean;
  canManageSchedule: boolean;
  canChangeFutureRecurrence: boolean;
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
  const [attendanceSession, setAttendanceSession] = useState<ClassSession | null>(null);
  const [scheduleSession, setScheduleSession] = useState<ClassSession | null>(null);
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
    const timer = window.setTimeout(() => {
      load().catch((reason: Error) => setError(reason.message));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const refresh = async () => {
    await load();
    setSheet(null);
    setAttendanceSession(null);
    setScheduleSession(null);
  };

  const openAttendance = (session: ClassSession) => setAttendanceSession(session);

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
          {tab === "today" && <TodayView snapshot={snapshot} onAddChild={() => setSheet("child")} onAddClass={() => setSheet("enrollment")} onAttendance={openAttendance} onSchedule={setScheduleSession} />}
          {tab === "children" && <ChildrenView snapshot={snapshot} onAddChild={() => setSheet("child")} onAddClass={() => setSheet("enrollment")} onAttendance={openAttendance} />}
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
      {sheet === "enrollment" && snapshot && <EnrollmentSheet familyChildren={snapshot.children} onClose={() => setSheet(null)} onSaved={refresh} />}
      {attendanceSession && <AttendanceSheet session={attendanceSession} onClose={() => setAttendanceSession(null)} onSaved={refresh} />}
      {scheduleSession && <ScheduleChangeSheet session={scheduleSession} onClose={() => setScheduleSession(null)} onSaved={refresh} />}
    </main>
  );
}

function TodayView({ snapshot, onAddChild, onAddClass, onAttendance, onSchedule }: { snapshot: Snapshot; onAddChild: () => void; onAddClass: () => void; onAttendance: (session: ClassSession) => void; onSchedule: (session: ClassSession) => void }) {
  const todaySessions = snapshot.upcomingSessions.filter((session) => session.localDate === snapshot.household.today);
  const nextSessions = snapshot.upcomingSessions.filter((session) => session.localDate >= snapshot.household.today).slice(0, 4);
  const attendanceDue = todaySessions.filter((session) => session.canRecordAttendance && !session.attendanceStatus).length;
  const firstName = snapshot.user.displayName.split(/\s|@/)[0];
  const displaySessions = todaySessions.length > 0 ? todaySessions : nextSessions;

  return (
    <>
      <section className="page-intro">
        <p className="eyebrow">{longDate(snapshot.household.today)}</p>
        <h1>{snapshot.children.length === 0 ? `Welcome, ${firstName}` : `Good ${dayPart()}, ${firstName}`}</h1>
        <p>{snapshot.children.length === 0 ? "Let’s put the first class on your family’s cue." : attendanceDue > 0 ? `${attendanceDue} ${attendanceDue === 1 ? "class needs" : "classes need"} attendance now.` : todaySessions.length > 0 ? `${todaySessions.length} ${todaySessions.length === 1 ? "class is" : "classes are"} on today’s schedule.` : "Nothing urgent today. Here’s what is coming next."}</p>
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
              {displaySessions.map((session) => <SessionCard key={session.id} session={session} showDate={todaySessions.length === 0} onAttendance={onAttendance} onSchedule={onSchedule} />)}
            </section>
          )}
        </>
      )}
    </>
  );
}

function SessionCard({ session, showDate, onAttendance, onSchedule }: { session: ClassSession; showDate: boolean; onAttendance: (session: ClassSession) => void; onSchedule: (session: ClassSession) => void }) {
  const recorded = Boolean(session.attendanceStatus);
  return (
    <article className={`session-card ${recorded ? "recorded" : ""} ${session.status !== "scheduled" ? "changed" : ""}`}>
      <div className={`child-dot ${session.childColor}`}>{session.childName.slice(0, 1).toUpperCase()}</div>
      <div className="session-main">
        <div className="session-topline"><span>{session.childName}</span><span className={`status-pill ${recorded ? attendanceTone(session) : statusTone(session.status)}`}>{recorded ? attendanceLabel(session) : statusLabel(session.status)}</span></div>
        <h3>{session.enrollmentName}</h3>
        <p>{showDate ? `${shortDate(session.localDate)} · ` : ""}{timeRange(session)}</p>
        <p>{[session.providerName, session.location].filter(Boolean).join(" · ") || "Location not added"}</p>
        {session.reason && <p className="change-note">{session.reason}</p>}
        {session.compensationStatus === "pending" && <p className="balance-note">Makeup still owed</p>}
        {session.linkedSessionLocalDate && <p className="balance-note">{session.linkType === "makeup" ? "Makeup" : "Replacement"}: {shortDate(session.linkedSessionLocalDate)}</p>}
      </div>
      <div className="session-actions">
        {session.canRecordAttendance && <button className={`attendance-action ${recorded ? "edit" : ""}`} onClick={() => onAttendance(session)} aria-label={`${recorded ? "Edit" : "Record"} attendance for ${session.enrollmentName}`}>{recorded ? "Edit" : "Record"}</button>}
        {session.canManageSchedule && <button className="manage-action" onClick={() => onSchedule(session)}>{session.compensationStatus === "pending" ? "Add makeup" : "Manage"}</button>}
        {!session.canRecordAttendance && !session.canManageSchedule && !recorded && <span className="future-cue">Updated</span>}
      </div>
    </article>
  );
}

function ChildrenView({ snapshot, onAddChild, onAddClass, onAttendance }: { snapshot: Snapshot; onAddChild: () => void; onAddClass: () => void; onAttendance: (session: ClassSession) => void }) {
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
              <div className="attendance-stats" aria-label={`${child.name} attendance summary`}>
                <div><strong>{child.attendanceSummary.attendanceRate === null ? "—" : `${child.attendanceSummary.attendanceRate}%`}</strong><span>Attendance</span></div>
                <div><strong>{child.attendanceSummary.lateArrivals}</strong><span>Late arrivals</span></div>
                <div><strong>{child.attendanceSummary.averageMinutesLate === null ? "—" : `${child.attendanceSummary.averageMinutesLate}m`}</strong><span>Average late</span></div>
              </div>
              {child.makeupBalance > 0 && <div className="makeup-balance"><strong>{child.makeupBalance} {child.makeupBalance === 1 ? "makeup" : "makeups"} owed</strong><span>Cancelled sessions awaiting compensation</span></div>}
              {child.recentSessions.length > 0 && (
                <div className="attendance-history">
                  <div className="mini-heading"><strong>Recent sessions</strong><span>{child.attendanceSummary.recorded} recorded</span></div>
                  {child.recentSessions.slice(0, 4).map((session) => (
                    <button key={session.id} className="history-row" onClick={() => onAttendance(session)} disabled={!session.canRecordAttendance}>
                      <span><strong>{session.enrollmentName}</strong><small>{shortDate(session.localDate)} · {timeRange(session)}</small></span>
                      <span className={`history-status ${session.attendanceStatus ? attendanceTone(session) : "pending"}`}>{session.attendanceStatus ? attendanceLabel(session) : "Record"}</span>
                    </button>
                  ))}
                </div>
              )}
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

function EnrollmentSheet({ familyChildren, onClose, onSaved }: { familyChildren: Child[]; onClose: () => void; onSaved: () => Promise<void> }) {
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

  if (familyChildren.length === 0) return <Sheet title="Add a class" subtitle="A child is needed first" onClose={onClose}><p className="muted">Close this panel and add a child before creating their first class.</p></Sheet>;

  return <Sheet title="Add a recurring class" subtitle="Class details and weekly schedule" onClose={onClose}><form onSubmit={submit} className="sheet-form two-column"><label>Child<select name="childId" required>{familyChildren.map((child) => <option value={child.id} key={child.id}>{child.name}</option>)}</select></label><label>Subject<input name="subject" required maxLength={100} placeholder="Math tuition" /></label><label className="span-two">Institute or teacher business<input name="instituteName" required maxLength={120} placeholder="Bright Minds Centre" /></label><label>Teacher name<input name="teacherName" maxLength={100} placeholder="Mr. Ali" /></label><label>Teacher phone<input name="teacherPhone" maxLength={40} inputMode="tel" placeholder="+971…" /></label><label>Weekly day<select name="weekday" required>{weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label><label>Start time<input name="startTime" type="time" required defaultValue="16:00" /></label><label>Duration<select name="durationMinutes" defaultValue="60"><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option></select></label><label>Location<input name="location" maxLength={160} placeholder="Room 3 or online" /></label>{error && <p className="form-error span-two">{error}</p>}<button className="primary-button span-two" disabled={saving}>{saving ? "Creating sessions…" : "Add class and prepare sessions"}</button></form></Sheet>;
}

function AttendanceSheet({ session, onClose, onSaved }: { session: ClassSession; onClose: () => void; onSaved: () => Promise<void> }) {
  const initialChoice = session.attendanceStatus === "absent" ? "absent" : session.punctuality === "late" ? "late" : "on_time";
  const [choice, setChoice] = useState<"on_time" | "late" | "absent">(initialChoice);
  const [minutesLate, setMinutesLate] = useState(session.minutesLate ?? 5);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/sessions/${session.id}/attendance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        attendanceStatus: choice === "absent" ? "absent" : "attended",
        punctuality: choice === "absent" ? null : choice,
        minutesLate: choice === "late" ? minutesLate : null,
        note: form.get("note"),
      }),
    });
    if (!response.ok) {
      const data = await response.json() as { error?: string };
      setError(data.error ?? "Could not save attendance."); setSaving(false); return;
    }
    await onSaved();
  }

  return (
    <Sheet title={`${session.childName} · ${session.enrollmentName}`} subtitle="Attendance and punctuality" onClose={onClose}>
      <form onSubmit={submit} className="sheet-form attendance-form">
        <div className="attendance-context">
          <div><span>{shortDate(session.localDate)}</span><strong>{timeRange(session)}</strong></div>
          <div><span>Session status</span><strong>Scheduled</strong></div>
        </div>
        <fieldset>
          <legend>What happened?</legend>
          <div className="attendance-options">
            <button type="button" className={choice === "on_time" ? "selected" : ""} aria-pressed={choice === "on_time"} onClick={() => setChoice("on_time")}><span>✓</span><strong>On time</strong><small>Attended as planned</small></button>
            <button type="button" className={choice === "late" ? "selected late" : ""} aria-pressed={choice === "late"} onClick={() => setChoice("late")}><span>+m</span><strong>Late</strong><small>Capture minutes</small></button>
            <button type="button" className={choice === "absent" ? "selected absent" : ""} aria-pressed={choice === "absent"} onClick={() => setChoice("absent")}><span>×</span><strong>Absent</strong><small>Class took place</small></button>
          </div>
        </fieldset>
        {choice === "late" && (
          <div className="minutes-panel">
            <label>Minutes late<input type="number" min={1} max={360} value={minutesLate} onChange={(event) => setMinutesLate(Number(event.target.value))} required /></label>
            <div className="minute-presets" aria-label="Quick minute choices">{[5, 10, 15, 20].map((minutes) => <button type="button" key={minutes} className={minutesLate === minutes ? "active" : ""} onClick={() => setMinutesLate(minutes)}>{minutes}m</button>)}</div>
          </div>
        )}
        <label>Optional note<textarea name="note" maxLength={500} defaultValue={session.attendanceNote ?? ""} placeholder={choice === "late" ? "e.g. traffic near the centre" : "Add context if useful"} /></label>
        <div className="separation-note"><strong>Schedule stays separate</strong><p>This records attendance and punctuality only. It will not change the recurring class or session status.</p></div>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button" disabled={saving}>{saving ? "Saving…" : session.attendanceStatus ? "Update attendance" : choice === "late" ? `Save ${minutesLate} minutes late` : choice === "absent" ? "Save absent" : "Save on time"}</button>
      </form>
    </Sheet>
  );
}

function ScheduleChangeSheet({ session, onClose, onSaved }: { session: ClassSession; onClose: () => void; onSaved: () => Promise<void> }) {
  const resolvingPendingMakeup = session.status === "cancelled" && session.compensationStatus === "pending";
  const canChangeFuture = session.canChangeFutureRecurrence;
  const [scope, setScope] = useState<"single" | "future">("single");
  const [changeType, setChangeType] = useState<"cancel" | "reschedule" | "holiday">("cancel");
  const [compensation, setCompensation] = useState<"none" | "pending" | "makeup">(resolvingPendingMakeup ? "makeup" : "none");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minimumDate] = useState(() => todayInZone(session.timezone));
  const [defaultReplacementDate] = useState(() => futureReplacementDate(session));
  const needsReplacement = changeType === "reschedule" || (changeType === "cancel" && compensation === "makeup");
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null);
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const url = scope === "single"
      ? `/api/sessions/${session.id}/change`
      : `/api/enrollments/${session.enrollmentId}/schedule`;
    const body = scope === "single"
      ? {
          changeType,
          compensation: changeType === "cancel" ? compensation : "none",
          reason: form.reason,
          replacementDate: form.replacementDate,
          replacementTime: form.replacementTime,
          replacementLocation: form.replacementLocation,
        }
      : {
          effectiveSessionId: session.id,
          weekday: Number(form.weekday),
          startTime: form.startTime,
          durationMinutes: Number(form.durationMinutes),
          location: form.location,
        };
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) {
      const data = await response.json() as { error?: string };
      setError(data.error ?? "Could not update the schedule."); setSaving(false); return;
    }
    await onSaved();
  }

  return (
    <Sheet title={`${session.childName} · ${session.enrollmentName}`} subtitle="Schedule change" onClose={onClose}>
      <form onSubmit={submit} className="sheet-form schedule-form">
        <div className="attendance-context">
          <div><span>Current session</span><strong>{shortDate(session.localDate)}</strong></div>
          <div><span>Current time</span><strong>{timeRange(session)}</strong></div>
        </div>
        {!resolvingPendingMakeup && <fieldset>
          <legend>What should change?</legend>
          <div className="scope-options">
            <button type="button" className={scope === "single" ? "selected" : ""} onClick={() => setScope("single")}><strong>This session only</strong><small>Keep the weekly schedule</small></button>
            {canChangeFuture && <button type="button" className={scope === "future" ? "selected" : ""} onClick={() => setScope("future")}><strong>This and future sessions</strong><small>Start a new schedule version</small></button>}
          </div>
        </fieldset>}

        {scope === "single" ? (
          <>
            {resolvingPendingMakeup ? <div className="future-preview"><strong>Schedule the owed makeup</strong><p>This will clear the pending balance and link the new session to the original cancellation.</p></div> : <label>Change type<select value={changeType} onChange={(event) => setChangeType(event.target.value as typeof changeType)}><option value="cancel">Cancelled</option><option value="reschedule">Rescheduled</option><option value="holiday">Holiday / no class</option></select></label>}
            <label>{resolvingPendingMakeup ? "Note" : "Reason"}<textarea name="reason" required maxLength={300} defaultValue={resolvingPendingMakeup ? session.reason ?? "Makeup scheduled" : undefined} placeholder={resolvingPendingMakeup ? "Context for the makeup" : "Why did this session change?"} /></label>
            {!resolvingPendingMakeup && changeType === "cancel" && <label>Compensation<select value={compensation} onChange={(event) => setCompensation(event.target.value as typeof compensation)}><option value="none">No compensation</option><option value="pending">Makeup owed — date not known</option><option value="makeup">Add the makeup session now</option></select></label>}
            {needsReplacement && <div className="replacement-panel"><strong>{changeType === "reschedule" ? "Replacement session" : "Makeup session"}</strong><div className="replacement-grid"><label>Date<input name="replacementDate" type="date" min={minimumDate} defaultValue={defaultReplacementDate} required /></label><label>Start time<input name="replacementTime" type="time" defaultValue={localStartTime(session)} required /></label><label className="span-two">Location<input name="replacementLocation" maxLength={160} defaultValue={session.location ?? ""} placeholder="Same location or a new one" /></label></div></div>}
            <div className="separation-note"><strong>The original stays visible</strong><p>ClassCue records this exception and keeps attendance separate. A replacement or makeup is linked back to this session.</p></div>
          </>
        ) : (
          <>
            <div className="future-preview"><strong>Effective {shortDate(session.localDate)}</strong><p>Earlier sessions stay unchanged. Future recurring sessions are regenerated from this date; manual exceptions remain intact.</p></div>
            <label>New weekly day<select name="weekday" defaultValue={session.scheduleWeekday ?? 0}>{weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>
            <label>New start time<input name="startTime" type="time" required defaultValue={session.scheduleStartTime ?? localStartTime(session)} /></label>
            <label>Duration<select name="durationMinutes" defaultValue={session.scheduleDurationMinutes ?? 60}><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option></select></label>
            <label>Location<input name="location" maxLength={160} defaultValue={session.location ?? ""} /></label>
          </>
        )}
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button" disabled={saving}>{saving ? "Updating schedule…" : scope === "future" ? "Confirm future schedule" : "Save session change"}</button>
      </form>
    </Sheet>
  );
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
function attendanceLabel(session: Pick<ClassSession, "attendanceStatus" | "punctuality" | "minutesLate">) { if (session.attendanceStatus === "absent") return "Absent"; if (session.punctuality === "late") return `${session.minutesLate ?? 0} min late`; return "On time"; }
function attendanceTone(session: Pick<ClassSession, "attendanceStatus" | "punctuality">) { if (session.attendanceStatus === "absent") return "absent"; if (session.punctuality === "late") return "late"; return "on-time"; }
function statusLabel(status: string) { return ({ scheduled: "Scheduled", makeup: "Makeup", cancelled: "Cancelled", rescheduled: "Rescheduled", holiday: "Holiday" } as Record<string, string>)[status] ?? status; }
function statusTone(status: string) { return status === "cancelled" ? "absent" : status === "rescheduled" ? "late" : status === "holiday" ? "holiday" : status === "makeup" ? "makeup" : ""; }
function todayInZone(timezone: string) { return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: timezone }).format(new Date()); }
function futureReplacementDate(session: ClassSession) { return session.canChangeFutureRecurrence ? session.localDate : todayInZone(session.timezone); }
function localStartTime(session: ClassSession) { return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: session.timezone }).format(new Date(session.plannedStartAt)); }
