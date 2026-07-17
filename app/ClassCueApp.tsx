"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Enrollment = {
  id: string;
  childId: string;
  name: string;
  subject: string;
  location: string | null;
  onlineUrl: string | null;
  timezone: string;
  version: number;
  providerName: string | null;
};

type ContactLink = { enrollmentId: string; enrollmentName: string; childName: string; role: string; isPrimary: boolean; enrollmentStatus: string };
type Contact = { id: string; providerId: string | null; providerName: string | null; name: string; phone: string | null; email: string | null; notes: string | null; links: ContactLink[] };
type ArchivedEnrollment = { id: string; childId: string; childName: string; name: string; subject: string; location: string | null; onlineUrl: string | null; timezone: string; version: number; providerName: string | null; archivedAt: string };

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

type FeePayment = {
  id: string;
  amountMinor: number;
  currency: string;
  paidAt: string;
  method: string;
  reference: string | null;
  note: string | null;
};

type FeeCharge = {
  id: string;
  arrangementId: string;
  enrollmentId: string;
  enrollmentName: string;
  childId: string;
  childName: string;
  childColor: string;
  providerName: string | null;
  model: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  suggestedAmountMinor: number;
  confirmedAmountMinor: number;
  paidAmountMinor: number;
  outstandingAmountMinor: number;
  currency: string;
  status: string;
  displayStatus: string;
  calculation: { basis?: string; explanation?: string; sessionCount?: number; sessionsIncluded?: number | null; previousPaidAmountMinor?: number | null };
  payments: FeePayment[];
  adjustments: { id: string; amountMinor: number; reason: string; createdAt: string }[];
};

type FeeArrangement = {
  id: string;
  enrollmentId: string;
  enrollmentName: string;
  childId: string;
  childName: string;
  model: string;
  currency: string;
  baseAmountMinor: number;
  sessionsIncluded: number | null;
  compensationPolicy: string;
  purchasedSessions: number;
  usedSessions: number;
  compensatedSessions: number;
  sessionBalance: number;
};

type FeesSnapshot = {
  arrangements: FeeArrangement[];
  charges: FeeCharge[];
  dueCharges: FeeCharge[];
  paidCharges: FeeCharge[];
  totals: { currency: string; dueAmountMinor: number; paidAmountMinor: number }[];
  childSummaries: { childId: string; currency: string; dueAmountMinor: number; paidAmountMinor: number }[];
};

type ReminderRule = {
  id: string;
  type: string;
  leadMinutes: number;
  repeatIntervalMinutes: number | null;
  enabled: boolean;
  enrollmentId: string | null;
  feeArrangementId: string | null;
  targetName: string;
};

type ReminderJob = {
  id: string;
  type: string;
  scheduledFor: string;
  status: string;
  sentAt: string | null;
  title: string;
  body: string;
  shareText: string;
  relatedRecordType: string;
  relatedRecordId: string;
};

type Suggestion = {
  id: string;
  type: string;
  explanation: string;
  source: string;
  status: string;
  createdAt: string;
  evidence: Record<string, unknown>;
  proposedAction: Record<string, unknown>;
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
  onlineUrl: string | null;
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
  household: { name: string; timezone: string; today: string };
  children: Child[];
  upcomingSessions: ClassSession[];
  fees: FeesSnapshot;
  reminders: { rules: ReminderRule[]; dueJobs: ReminderJob[]; upcomingJobs: ReminderJob[]; deliveryHistory: ReminderJob[] };
  suggestions: Suggestion[];
  contacts: Contact[];
  archivedEnrollments: ArchivedEnrollment[];
  ai: { configured: boolean; model: string };
};

type Tab = "today" | "children" | "fees" | "more";
type Sheet = "child" | "enrollment" | null;
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

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
  const [feeSetupOpen, setFeeSetupOpen] = useState(false);
  const [paymentCharge, setPaymentCharge] = useState<FeeCharge | null>(null);
  const [adjustCharge, setAdjustCharge] = useState<FeeCharge | null>(null);
  const [newChargeArrangement, setNewChargeArrangement] = useState<FeeArrangement | null>(null);
  const [reminderSetupOpen, setReminderSetupOpen] = useState(false);
  const [editingChild, setEditingChild] = useState<Child | null>(null);
  const [managingEnrollment, setManagingEnrollment] = useState<Enrollment | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | "new" | null>(null);
  const [householdSettingsOpen, setHouseholdSettingsOpen] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushConfigured, setPushConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [generatingInsights, setGeneratingInsights] = useState(false);

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
      setNotificationPermission("Notification" in window ? Notification.permission : "unsupported");
      inspectPushSubscription().then((state) => { setPushEnabled(state.enabled); setPushConfigured(state.configured); }).catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const initialize = window.setTimeout(() => {
      setIsStandalone(window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
      setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
    }, 0);
    const beforeInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    const installed = () => { setInstallPrompt(null); setIsStandalone(true); };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", installed);
    return () => { window.clearTimeout(initialize); window.removeEventListener("beforeinstallprompt", beforeInstall); window.removeEventListener("appinstalled", installed); };
  }, []);

  useEffect(() => {
    if (notificationPermission !== "granted") return;
    const check = () => deliverDueNotifications().then((delivered) => delivered > 0 ? load() : undefined).catch(() => undefined);
    const timer = window.setTimeout(check, 250);
    const interval = window.setInterval(check, 60_000);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); };
  }, [load, notificationPermission]);

  const refresh = async () => {
    await load();
    setSheet(null);
    setAttendanceSession(null);
    setScheduleSession(null);
    setFeeSetupOpen(false);
    setPaymentCharge(null);
    setAdjustCharge(null);
    setNewChargeArrangement(null);
    setReminderSetupOpen(false);
    setEditingChild(null);
    setManagingEnrollment(null);
    setEditingContact(null);
    setHouseholdSettingsOpen(false);
  };

  const openAttendance = (session: ClassSession) => setAttendanceSession(session);

  async function enableNotifications() {
    setActionError(null);
    if (!("Notification" in window) || !("serviceWorker" in navigator)) { setNotificationPermission("unsupported"); return; }
    try {
      if (isIOS && !isStandalone) { setActionError("On iPhone or iPad, add ClassCue to your Home Screen first, then enable notifications from the installed app."); return; }
      const registration = await navigator.serviceWorker.register("/classcue-sw.js");
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === "granted") {
        const configResponse = await fetch("/api/push-subscriptions", { cache: "no-store" });
        const config = await configResponse.json() as { configured?: boolean; publicKey?: string | null; error?: string };
        setPushConfigured(Boolean(config.configured));
        if (!configResponse.ok) throw new Error(config.error ?? "Notification setup could not be loaded.");
        if (!config.configured || !config.publicKey || !("PushManager" in window)) throw new Error("Closed-app notifications are not configured yet.");
        const existing = await registration.pushManager.getSubscription();
        const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64urlToUint8Array(config.publicKey) });
        const saved = await fetch("/api/push-subscriptions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...subscription.toJSON(), endpoint: subscription.endpoint, deviceLabel: deviceLabel() }) });
        if (!saved.ok) { const data = await saved.json() as { error?: string }; throw new Error(data.error ?? "This device could not be registered."); }
        setPushEnabled(true);
        await deliverDueNotifications();
        await load();
      }
    } catch (reason) { setActionError(reason instanceof Error ? `${reason.message} Your in-app reminder inbox still works.` : "Notifications could not be enabled on this device. Your in-app reminder inbox still works."); }
  }

  async function disableNotifications() {
    setActionError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push-subscriptions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "unsubscribe", endpoint: subscription.endpoint }) });
        await subscription.unsubscribe();
      }
      setPushEnabled(false);
    } catch { setActionError("This device could not be removed. Try again from the same browser."); }
  }

  async function toggleReminder(rule: ReminderRule) {
    setActionError(null);
    const response = await fetch(`/api/reminder-rules/${rule.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: !rule.enabled }) });
    if (!response.ok) { const data = await response.json() as { error?: string }; setActionError(data.error ?? "Could not update this reminder."); return; }
    await load();
  }

  async function actOnReminder(job: ReminderJob, status: "delivered" | "dismissed") {
    setActionError(null);
    const response = await fetch(`/api/reminder-jobs/${job.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    if (!response.ok) { const data = await response.json() as { error?: string }; setActionError(data.error ?? "Could not update this reminder."); return; }
    await load();
  }

  async function reviewSuggestion(suggestion: Suggestion, decision: "accept" | "dismiss") {
    setActionError(null);
    const response = await fetch(`/api/suggestions/${suggestion.id}/review`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) });
    if (!response.ok) { const data = await response.json() as { error?: string }; setActionError(data.error ?? "Could not review this suggestion."); return; }
    await load();
  }

  async function generateAIInsights() {
    setActionError(null);
    setGeneratingInsights(true);
    try {
      const response = await fetch("/api/suggestions/generate", { method: "POST" });
      const data = await response.json() as { error?: string };
      if (!response.ok) { setActionError(data.error ?? "AI insights could not be generated."); return; }
      await load();
    } finally { setGeneratingInsights(false); }
  }

  async function restoreEnrollment(enrollment: ArchivedEnrollment) {
    setActionError(null);
    const response = await fetch(`/api/enrollments/${enrollment.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "restore" }) });
    if (!response.ok) { const data = await response.json() as { error?: string }; setActionError(data.error ?? "Could not restore this class."); return; }
    await load();
  }

  async function installApp() {
    setActionError(null);
    if (!installPrompt) return;
    try { await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); }
    catch { setActionError("ClassCue could not open the install prompt. You can still use it in this browser."); }
  }

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
          {actionError && <div className="action-alert" role="alert"><span>{actionError}</span><button onClick={() => setActionError(null)} aria-label="Dismiss message">×</button></div>}
          {tab === "today" && <TodayView snapshot={snapshot} onAddChild={() => setSheet("child")} onAddClass={() => setSheet("enrollment")} onAttendance={openAttendance} onSchedule={setScheduleSession} onPayment={setPaymentCharge} onReminderAction={actOnReminder} />}
          {tab === "children" && <ChildrenView snapshot={snapshot} onAddChild={() => setSheet("child")} onAddClass={() => setSheet("enrollment")} onAttendance={openAttendance} onEditChild={setEditingChild} onManageEnrollment={setManagingEnrollment} />}
          {tab === "fees" && <FeesView snapshot={snapshot} onSetup={() => setFeeSetupOpen(true)} onPayment={setPaymentCharge} onAdjust={setAdjustCharge} onNewCharge={setNewChargeArrangement} />}
          {tab === "more" && <MoreView snapshot={snapshot} notificationPermission={notificationPermission} pushEnabled={pushEnabled} pushConfigured={pushConfigured} onEnableNotifications={enableNotifications} onDisableNotifications={disableNotifications} onSetupReminder={() => setReminderSetupOpen(true)} onToggleReminder={toggleReminder} onReminderAction={actOnReminder} onReviewSuggestion={reviewSuggestion} onGenerateInsights={generateAIInsights} generatingInsights={generatingInsights} onAddContact={() => setEditingContact("new")} onEditContact={setEditingContact} onHouseholdSettings={() => setHouseholdSettingsOpen(true)} onRestore={restoreEnrollment} installAvailable={Boolean(installPrompt)} isStandalone={isStandalone} isIOS={isIOS} onInstall={installApp} />}
        </div>
      )}

      <nav className="bottom-nav" aria-label="Primary navigation">
        {navItems.map((item) => (
          <button key={item.id} className={tab === item.id ? "active" : ""} aria-current={tab === item.id ? "page" : undefined} onClick={() => setTab(item.id)}>
            <span aria-hidden="true">{item.icon}</span>{item.label}
          </button>
        ))}
      </nav>

      {sheet === "child" && <ChildSheet onClose={() => setSheet(null)} onSaved={refresh} />}
      {sheet === "enrollment" && snapshot && <EnrollmentSheet familyChildren={snapshot.children} contacts={snapshot.contacts} onClose={() => setSheet(null)} onSaved={refresh} />}
      {attendanceSession && <AttendanceSheet session={attendanceSession} onClose={() => setAttendanceSession(null)} onSaved={refresh} />}
      {scheduleSession && <ScheduleChangeSheet session={scheduleSession} onClose={() => setScheduleSession(null)} onSaved={refresh} />}
      {feeSetupOpen && snapshot && <FeeSetupSheet snapshot={snapshot} onClose={() => setFeeSetupOpen(false)} onSaved={refresh} />}
      {paymentCharge && <PaymentSheet charge={paymentCharge} today={snapshot?.household.today ?? ""} onClose={() => setPaymentCharge(null)} onSaved={refresh} />}
      {adjustCharge && <FeeAdjustmentSheet charge={adjustCharge} onClose={() => setAdjustCharge(null)} onSaved={refresh} />}
      {newChargeArrangement && snapshot && <NewChargeSheet arrangement={newChargeArrangement} today={snapshot.household.today} onClose={() => setNewChargeArrangement(null)} onSaved={refresh} />}
      {reminderSetupOpen && snapshot && <ReminderSetupSheet snapshot={snapshot} onClose={() => setReminderSetupOpen(false)} onSaved={refresh} />}
      {editingChild && <EditChildSheet child={editingChild} onClose={() => setEditingChild(null)} onSaved={refresh} />}
      {managingEnrollment && snapshot && <ManageEnrollmentSheet enrollment={managingEnrollment} contacts={snapshot.contacts} onClose={() => setManagingEnrollment(null)} onSaved={refresh} />}
      {editingContact && <ContactSheet contact={editingContact === "new" ? null : editingContact} onClose={() => setEditingContact(null)} onSaved={refresh} />}
      {householdSettingsOpen && snapshot && <HouseholdSettingsSheet household={snapshot.household} onClose={() => setHouseholdSettingsOpen(false)} onSaved={refresh} />}
    </main>
  );
}

function TodayView({ snapshot, onAddChild, onAddClass, onAttendance, onSchedule, onPayment, onReminderAction }: { snapshot: Snapshot; onAddChild: () => void; onAddClass: () => void; onAttendance: (session: ClassSession) => void; onSchedule: (session: ClassSession) => void; onPayment: (charge: FeeCharge) => void; onReminderAction: (job: ReminderJob, status: "delivered" | "dismissed") => Promise<void> }) {
  const todaySessions = snapshot.upcomingSessions.filter((session) => session.localDate === snapshot.household.today);
  const nextSessions = snapshot.upcomingSessions.filter((session) => session.localDate >= snapshot.household.today).slice(0, 4);
  const attendanceDue = todaySessions.filter((session) => session.canRecordAttendance && !session.attendanceStatus).length;
  const firstName = snapshot.user.displayName.split(/\s|@/)[0];
  const displaySessions = todaySessions.length > 0 ? todaySessions : nextSessions;
  const urgentFees = snapshot.fees.dueCharges.filter((charge) => charge.dueDate <= snapshot.household.today);

  return (
    <>
      <section className="page-intro">
        <p className="eyebrow">{longDate(snapshot.household.today)}</p>
        <h1>{snapshot.children.length === 0 ? `Welcome, ${firstName}` : `Good ${dayPart()}, ${firstName}`}</h1>
        <p>{snapshot.children.length === 0 ? "Let’s put the first class on your family’s cue." : attendanceDue > 0 ? `${attendanceDue} ${attendanceDue === 1 ? "class needs" : "classes need"} attendance now.` : urgentFees.length > 0 ? `${urgentFees.length} ${urgentFees.length === 1 ? "fee needs" : "fees need"} attention.` : todaySessions.length > 0 ? `${todaySessions.length} ${todaySessions.length === 1 ? "class is" : "classes are"} on today’s schedule.` : "Nothing urgent today. Here’s what is coming next."}</p>
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

          {snapshot.reminders.dueJobs.length > 0 && <section className="today-reminders"><div className="section-heading"><div><p className="eyebrow">Reminder inbox</p><h2>Ready now</h2></div></div>{snapshot.reminders.dueJobs.slice(0, 3).map((job) => <ReminderCue key={job.id} job={job} onAction={onReminderAction} />)}</section>}

          {snapshot.fees.dueCharges.length > 0 && (
            <section className="today-fees">
              <div className="section-heading"><div><p className="eyebrow">Fees to watch</p><h2>Due and overdue</h2></div></div>
              {snapshot.fees.dueCharges.slice(0, 2).map((charge) => <FeeCue key={charge.id} charge={charge} onPayment={onPayment} />)}
            </section>
          )}

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
        <p>{[session.providerName, session.location ?? session.onlineUrl].filter(Boolean).join(" · ") || "Location not added"}</p>
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

function ChildrenView({ snapshot, onAddChild, onAddClass, onAttendance, onEditChild, onManageEnrollment }: { snapshot: Snapshot; onAddChild: () => void; onAddClass: () => void; onAttendance: (session: ClassSession) => void; onEditChild: (child: Child) => void; onManageEnrollment: (enrollment: Enrollment) => void }) {
  return (
    <>
      <div className="section-heading page-heading"><div><p className="eyebrow">Family</p><h1>Children</h1></div><button className="text-button" onClick={onAddChild}>+ Add child</button></div>
      {snapshot.children.length === 0 ? <section className="empty-card"><h3>No children added</h3><p>Add the first child to begin their schedule.</p><button className="primary-button" onClick={onAddChild}>Add child</button></section> : (
        <section className="children-list">
          {snapshot.children.map((child) => (
            <article className="child-card" key={child.id}>
              <div className="child-card-head"><div className={`child-dot large ${child.color}`}>{child.name.slice(0, 1).toUpperCase()}</div><div><h2>{child.name}</h2><p>{child.enrollments.length} active {child.enrollments.length === 1 ? "class" : "classes"}</p></div><button className="icon-text-button" onClick={() => onEditChild(child)}>Edit</button></div>
              <div className="class-chips">
                {child.enrollments.map((enrollment) => <button key={enrollment.id} onClick={() => onManageEnrollment(enrollment)}>{enrollment.name}<small>{enrollment.providerName}</small><em>Manage</em></button>)}
                {child.enrollments.length === 0 && <p className="muted">No classes yet.</p>}
              </div>
              <div className="attendance-stats" aria-label={`${child.name} attendance summary`}>
                <div><strong>{child.attendanceSummary.attendanceRate === null ? "—" : `${child.attendanceSummary.attendanceRate}%`}</strong><span>Attendance</span></div>
                <div><strong>{child.attendanceSummary.lateArrivals}</strong><span>Late arrivals</span></div>
                <div><strong>{child.attendanceSummary.averageMinutesLate === null ? "—" : `${child.attendanceSummary.averageMinutesLate}m`}</strong><span>Average late</span></div>
              </div>
              {snapshot.fees.childSummaries.filter((summary) => summary.childId === child.id).map((summary) => (
                <div className="child-fee-summary" key={summary.currency}><span>{summary.currency} fees</span><strong>{formatMoney(summary.dueAmountMinor, summary.currency)} due · {formatMoney(summary.paidAmountMinor, summary.currency)} paid</strong></div>
              ))}
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

function MoreView({ snapshot, notificationPermission, pushEnabled, pushConfigured, onEnableNotifications, onDisableNotifications, onSetupReminder, onToggleReminder, onReminderAction, onReviewSuggestion, onGenerateInsights, generatingInsights, onAddContact, onEditContact, onHouseholdSettings, onRestore, installAvailable, isStandalone, isIOS, onInstall }: { snapshot: Snapshot; notificationPermission: NotificationPermission | "unsupported"; pushEnabled: boolean; pushConfigured: boolean; onEnableNotifications: () => Promise<void>; onDisableNotifications: () => Promise<void>; onSetupReminder: () => void; onToggleReminder: (rule: ReminderRule) => Promise<void>; onReminderAction: (job: ReminderJob, status: "delivered" | "dismissed") => Promise<void>; onReviewSuggestion: (suggestion: Suggestion, decision: "accept" | "dismiss") => Promise<void>; onGenerateInsights: () => Promise<void>; generatingInsights: boolean; onAddContact: () => void; onEditContact: (contact: Contact) => void; onHouseholdSettings: () => void; onRestore: (enrollment: ArchivedEnrollment) => Promise<void>; installAvailable: boolean; isStandalone: boolean; isIOS: boolean; onInstall: () => Promise<void> }) {
  return (
    <>
      <section className="page-intro"><p className="eyebrow">Reminders and account</p><h1>More</h1><p>Control what ClassCue brings to your attention. Nothing is shared or changed without your action.</p></section>
      <section className={`install-card ${isStandalone ? "installed" : ""}`}>
        <div className="install-icon">C</div><div><span>Phone access</span><strong>{isStandalone ? "Installed on this device" : "Keep ClassCue on your home screen"}</strong><p>{isStandalone ? "ClassCue opens like an app from your phone." : isIOS && !installAvailable ? "In Safari, tap Share, then Add to Home Screen." : "Install for faster, full-screen access without finding the browser tab."}</p></div>
        {installAvailable && !isStandalone && <button className="primary-button" onClick={() => onInstall()}>Install ClassCue</button>}
      </section>
      <section className={`notification-card ${pushEnabled ? "granted" : notificationPermission}`}>
        <div className="notification-icon">◉</div><div><span>Phone notifications</span><strong>{pushEnabled ? "Enabled on this device" : notificationPermission === "denied" ? "Blocked in browser settings" : notificationPermission === "unsupported" ? "Not supported on this device" : !pushConfigured ? "Service setup pending" : "Not enabled yet"}</strong><p>{pushEnabled ? "ClassCue can notify this device when the app is closed." : "Your in-app reminder inbox remains available even without phone notifications."}</p></div>
        {pushEnabled ? <button className="text-button" onClick={() => onDisableNotifications()}>Turn off</button> : notificationPermission !== "denied" && notificationPermission !== "unsupported" && <button className="primary-button" onClick={() => onEnableNotifications()}>Enable notifications</button>}
      </section>

      <div className="section-heading more-section-heading"><div><p className="eyebrow">Your rules</p><h2>Reminder timing</h2></div><button className="text-button" onClick={onSetupReminder}>+ Configure</button></div>
      {snapshot.reminders.rules.length === 0 ? <section className="empty-card compact"><h3>No reminder rules yet</h3><p>Set class, fee-due, or repeating overdue reminders independently.</p><button className="primary-button" onClick={onSetupReminder}>Set first reminder</button></section> : <section className="reminder-rule-list">{snapshot.reminders.rules.map((rule) => <article className="reminder-rule-card" key={rule.id}><div><span>{reminderTypeLabel(rule.type)}</span><strong>{rule.targetName}</strong><small>{reminderTimingLabel(rule)}</small></div><button className={`toggle-button ${rule.enabled ? "on" : ""}`} role="switch" aria-checked={rule.enabled} onClick={() => onToggleReminder(rule)}><span></span>{rule.enabled ? "On" : "Off"}</button></article>)}</section>}

      {snapshot.reminders.dueJobs.length > 0 && <><div className="section-heading more-section-heading"><div><p className="eyebrow">Inbox</p><h2>Ready now</h2></div></div><section className="reminder-inbox">{snapshot.reminders.dueJobs.map((job) => <ReminderCue key={job.id} job={job} onAction={onReminderAction} />)}</section></>}
      {snapshot.reminders.upcomingJobs.length > 0 && <><div className="section-heading more-section-heading"><div><p className="eyebrow">Scheduled</p><h2>Coming reminders</h2></div></div><section className="upcoming-reminders">{snapshot.reminders.upcomingJobs.slice(0, 6).map((job) => <article key={job.id}><div><strong>{job.title}</strong><p>{job.body}</p></div><time>{dateTimeLabel(job.scheduledFor)}</time></article>)}</section></>}

      <div className="section-heading more-section-heading"><div><p className="eyebrow">Review first</p><h2>ClassCue insights</h2></div>{snapshot.ai.configured && <button className="text-button" disabled={generatingInsights} onClick={() => onGenerateInsights()}>{generatingInsights ? "Reviewing…" : "Refresh AI insights"}</button>}</div>
      {!snapshot.ai.configured && <section className="empty-card compact"><h3>AI insights are ready to connect</h3><p>ClassCue’s safe rule-based suggestions still work. Add an OpenAI API key to enable private, model-generated fee and attendance insights.</p></section>}
      {snapshot.suggestions.length > 0 && <section className="suggestion-list">{snapshot.suggestions.map((suggestion) => { const generated = suggestion.source.startsWith("openai:"); const changesRecord = suggestion.proposedAction.action === "save_reminder"; return <article className="suggestion-card" key={suggestion.id}><div className="suggestion-label"><span>{generated ? "AI-generated insight" : "Data-based suggestion"}</span><small>{generated ? `${suggestion.source.slice(7)} · parent review required` : "ClassCue rule engine"}</small></div>{typeof suggestion.evidence.targetName === "string" && <strong>{suggestion.evidence.targetName}</strong>}<p>{suggestion.explanation}</p>{Array.isArray(suggestion.evidence.evidence) && <ul>{suggestion.evidence.evidence.slice(0, 3).map((item) => <li key={String(item)}>{String(item)}</li>)}</ul>}<div className="suggestion-actions"><button className="primary-button" onClick={() => onReviewSuggestion(suggestion, "accept")}>{changesRecord ? "Review and apply" : "Mark reviewed"}</button><button className="secondary-button" onClick={() => onReviewSuggestion(suggestion, "dismiss")}>Dismiss</button></div></article>; })}</section>}

      {snapshot.reminders.deliveryHistory.length > 0 && <><div className="section-heading more-section-heading"><div><p className="eyebrow">History</p><h2>Recent reminders</h2></div></div><section className="delivery-history">{snapshot.reminders.deliveryHistory.slice(0, 6).map((job) => <div key={job.id}><span className={job.status}>{job.status === "delivered" ? "✓" : "×"}</span><div><strong>{job.title}</strong><small>{dateTimeLabel(job.sentAt ?? job.scheduledFor)}</small></div></div>)}</section></>}

      <div className="section-heading more-section-heading"><div><p className="eyebrow">Reuse across classes</p><h2>Contacts</h2></div><button className="text-button" onClick={onAddContact}>+ Add contact</button></div>
      {snapshot.contacts.length === 0 ? <section className="empty-card compact"><h3>No saved contacts</h3><p>Save teachers, administrators, and payment support once, then link them to any class.</p><button className="primary-button" onClick={onAddContact}>Add contact</button></section> : <section className="contact-list">{snapshot.contacts.map((contact) => <button className="contact-card" key={contact.id} onClick={() => onEditContact(contact)}><span className="contact-avatar">{initials(contact.name)}</span><span><strong>{contact.name}</strong><small>{contact.providerName ?? contact.email ?? contact.phone}</small><em>{contact.links.filter((link) => link.enrollmentStatus === "active").length} active {contact.links.filter((link) => link.enrollmentStatus === "active").length === 1 ? "class" : "classes"}</em></span><b>›</b></button>)}</section>}

      {snapshot.archivedEnrollments.length > 0 && <><div className="section-heading more-section-heading"><div><p className="eyebrow">History preserved</p><h2>Archived classes</h2></div></div><section className="archive-list">{snapshot.archivedEnrollments.map((enrollment) => <article key={enrollment.id}><div><strong>{enrollment.childName} · {enrollment.name}</strong><small>{enrollment.providerName ?? "Provider not added"} · archived {dateTimeLabel(enrollment.archivedAt)}</small></div><button className="secondary-button" onClick={() => onRestore(enrollment)}>Restore</button></article>)}</section></>}

      <div className="section-heading more-section-heading"><div><p className="eyebrow">Privacy</p><h2>Your family data</h2></div></div>
      <section className="data-care-card"><strong>Private and parent controlled</strong><p>ClassCue stores your household records under your signed-in account. It does not process payments, message contacts, or share reminders automatically.</p><div><span>✓ Suggestions require acceptance</span><span>✓ Native sharing requires your tap</span><span>✓ Private pages are never cached offline</span></div></section>

      <div className="section-heading more-section-heading"><div><p className="eyebrow">Account</p><h2>Household</h2></div></div>
      <section className="settings-card">
        <div><span>Signed in as</span><strong>{snapshot.user.displayName}</strong></div>
        <div><span>Household</span><strong>{snapshot.household.name}</strong></div>
        <div><span>Household timezone</span><strong>{snapshot.household.timezone}</strong></div>
        <div><span>Data ownership</span><strong>Private household</strong></div>
      </section>
      <button className="secondary-button full-width" onClick={onHouseholdSettings}>Edit household settings</button>
      <a className="secondary-button full-width" href="/signout-with-chatgpt?return_to=/">Sign out</a>
    </>
  );
}

function ReminderCue({ job, onAction }: { job: ReminderJob; onAction: (job: ReminderJob, status: "delivered" | "dismissed") => Promise<void> }) {
  return <article className={`reminder-cue ${job.type}`}><div><span>{reminderTypeLabel(job.type)}</span><strong>{job.title}</strong><p>{job.body}</p></div><div className="reminder-actions"><button onClick={() => shareReminder(job)}>Share</button><button onClick={() => onAction(job, "dismissed")}>Dismiss</button><button className="done" onClick={() => onAction(job, "delivered")}>Done</button></div></article>;
}

function FeesView({ snapshot, onSetup, onPayment, onAdjust, onNewCharge }: { snapshot: Snapshot; onSetup: () => void; onPayment: (charge: FeeCharge) => void; onAdjust: (charge: FeeCharge) => void; onNewCharge: (arrangement: FeeArrangement) => void }) {
  const availableEnrollments = snapshot.children.flatMap((child) => child.enrollments).filter((enrollment) => !snapshot.fees.arrangements.some((arrangement) => arrangement.enrollmentId === enrollment.id));
  return (
    <>
      <div className="section-heading page-heading"><div><p className="eyebrow">Money, clearly explained</p><h1>Fees</h1></div>{availableEnrollments.length > 0 && <button className="text-button" onClick={onSetup}>+ Add fee</button>}</div>
      {snapshot.children.flatMap((child) => child.enrollments).length === 0 ? (
        <section className="empty-card"><h3>Add a class first</h3><p>A fee arrangement belongs to one child’s class.</p></section>
      ) : snapshot.fees.arrangements.length === 0 ? (
        <section className="onboarding-card fee-onboarding"><div className="onboarding-number">03</div><div><p className="eyebrow">Set up the first fee</p><h2>Know what is due—and why.</h2><p>Choose monthly, term, package, or per-session fees. ClassCue keeps currencies separate and preserves every adjustment.</p></div><button className="primary-button" onClick={onSetup}>Add fee arrangement</button></section>
      ) : (
        <>
          <section className="fee-total-grid" aria-label="Fee totals by currency">
            {snapshot.fees.totals.map((total) => <div key={total.currency}><span>{total.currency}</span><strong>{formatMoney(total.dueAmountMinor, total.currency)}</strong><small>due</small><p>{formatMoney(total.paidAmountMinor, total.currency)} paid</p></div>)}
            {snapshot.fees.totals.length === 0 && <div><span>Ready</span><strong>—</strong><small>No charges yet</small></div>}
          </section>

          <div className="section-heading fee-section-heading"><div><p className="eyebrow">Action needed</p><h2>Due and overdue</h2></div></div>
          {snapshot.fees.dueCharges.length === 0 ? <section className="settled-card"><span>✓</span><div><strong>Nothing due</strong><p>All recorded fees are settled.</p></div></section> : <section className="fee-list">{snapshot.fees.dueCharges.map((charge) => <FeeCard key={charge.id} charge={charge} onPayment={onPayment} onAdjust={onAdjust} />)}</section>}

          <div className="section-heading fee-section-heading"><div><p className="eyebrow">Class arrangements</p><h2>How each class is billed</h2></div></div>
          <section className="arrangement-list">
            {snapshot.fees.arrangements.map((arrangement) => (
              <article className="arrangement-card" key={arrangement.id}>
                <div><span>{arrangement.childName}</span><h3>{arrangement.enrollmentName}</h3><p>{feeModelLabel(arrangement.model)} · {formatMoney(arrangement.baseAmountMinor, arrangement.currency)}{arrangement.model === "per_session" ? " per session" : ""}</p></div>
                {arrangement.model === "package" && <div className={`credit-balance ${arrangement.sessionBalance <= 1 ? "low" : ""}`}><strong>{arrangement.sessionBalance}</strong><span>sessions left</span><small>{arrangement.purchasedSessions} bought · {arrangement.usedSessions} used</small></div>}
                <button className="manage-action" onClick={() => onNewCharge(arrangement)}>Add next fee</button>
              </article>
            ))}
          </section>

          {snapshot.fees.paidCharges.length > 0 && <><div className="section-heading fee-section-heading"><div><p className="eyebrow">History</p><h2>Recently paid</h2></div></div><section className="fee-list paid-list">{snapshot.fees.paidCharges.slice(0, 6).map((charge) => <FeeCard key={charge.id} charge={charge} onPayment={onPayment} onAdjust={onAdjust} />)}</section></>}
        </>
      )}
    </>
  );
}

function FeeCue({ charge, onPayment }: { charge: FeeCharge; onPayment: (charge: FeeCharge) => void }) {
  return <article className={`fee-cue ${charge.displayStatus}`}><div className={`child-dot ${charge.childColor}`}>{charge.childName.slice(0, 1).toUpperCase()}</div><div><span>{charge.childName} · {charge.enrollmentName}</span><strong>{formatMoney(charge.outstandingAmountMinor, charge.currency)}</strong><small>{charge.displayStatus === "overdue" ? `Overdue since ${shortDate(charge.dueDate)}` : `Due ${shortDate(charge.dueDate)}`}</small></div><button className="attendance-action" onClick={() => onPayment(charge)}>Pay</button></article>;
}

function FeeCard({ charge, onPayment, onAdjust }: { charge: FeeCharge; onPayment: (charge: FeeCharge) => void; onAdjust: (charge: FeeCharge) => void }) {
  const isDue = charge.status === "due";
  return (
    <article className={`fee-card ${charge.displayStatus}`}>
      <div className="fee-card-head"><div><span>{charge.childName} · {charge.enrollmentName}</span><h3>{periodLabel(charge)}</h3><p>{feeModelLabel(charge.model)} · {charge.providerName ?? "Provider not added"}</p></div><span className={`fee-status ${charge.displayStatus}`}>{charge.displayStatus}</span></div>
      <div className="fee-amount-row"><div><span>{isDue ? "Outstanding" : "Paid"}</span><strong>{formatMoney(isDue ? charge.outstandingAmountMinor : charge.paidAmountMinor, charge.currency)}</strong></div><div><span>Confirmed fee</span><strong>{formatMoney(charge.confirmedAmountMinor, charge.currency)}</strong></div></div>
      <div className="calculation-note"><strong>How ClassCue calculated it</strong><p>{charge.calculation.explanation ?? "Configured fee amount."}{charge.suggestedAmountMinor !== charge.confirmedAmountMinor ? ` Parent confirmed ${formatMoney(charge.confirmedAmountMinor, charge.currency)}.` : ""}</p></div>
      {charge.adjustments[0] && <p className="adjustment-line">Latest adjustment: {charge.adjustments[0].reason}</p>}
      {charge.payments[0] && <p className="payment-line">Last payment: {formatMoney(charge.payments[0].amountMinor, charge.currency)} · {paymentMethodLabel(charge.payments[0].method)} · {shortDate(charge.payments[0].paidAt)}</p>}
      <div className="fee-actions">{isDue && <button className="primary-button" onClick={() => onPayment(charge)}>Record payment</button>}<button className="secondary-button" onClick={() => onAdjust(charge)}>Adjust amount</button><button className="share-action" onClick={() => shareFee(charge)}>Share</button></div>
    </article>
  );
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

function EnrollmentSheet({ familyChildren, contacts, onClose, onSaved }: { familyChildren: Child[]; contacts: Contact[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teacherContactId, setTeacherContactId] = useState("");
  const weekdays = useMemo(() => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null);
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/enrollments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, weekday: Number(form.weekday), durationMinutes: Number(form.durationMinutes) }) });
    if (!response.ok) { const data = await response.json() as { error?: string }; setError(data.error ?? "Could not add class."); setSaving(false); return; }
    await onSaved();
  }

  if (familyChildren.length === 0) return <Sheet title="Add a class" subtitle="A child is needed first" onClose={onClose}><p className="muted">Close this panel and add a child before creating their first class.</p></Sheet>;

  return <Sheet title="Add a recurring class" subtitle="Class details and weekly schedule" onClose={onClose}><form onSubmit={submit} className="sheet-form two-column"><label>Child<select name="childId" required>{familyChildren.map((child) => <option value={child.id} key={child.id}>{child.name}</option>)}</select></label><label>Subject<input name="subject" required maxLength={100} placeholder="Math tuition" /></label><label className="span-two">Institute or teacher business<input name="instituteName" required maxLength={120} placeholder="Bright Minds Centre" /></label>{contacts.length > 0 && <label className="span-two">Reuse a saved teacher<select name="teacherContactId" value={teacherContactId} onChange={(event) => setTeacherContactId(event.target.value)}><option value="">Add new teacher details below</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}{contact.providerName ? ` · ${contact.providerName}` : ""}</option>)}</select></label>}{!teacherContactId && <><label>Teacher name<input name="teacherName" maxLength={100} placeholder="Mr. Ali" /></label><label>Teacher phone<input name="teacherPhone" maxLength={40} inputMode="tel" placeholder="+971…" /></label></>}<label>Weekly day<select name="weekday" required>{weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label><label>Start time<input name="startTime" type="time" required defaultValue="16:00" /></label><label>Duration<select name="durationMinutes" defaultValue="60"><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option></select></label><label>Location<input name="location" maxLength={160} placeholder="Room 3 or address" /></label><label>Online-class link<input name="onlineUrl" type="url" maxLength={500} placeholder="https://…" /></label>{error && <p className="form-error span-two">{error}</p>}<button className="primary-button span-two" disabled={saving}>{saving ? "Creating sessions…" : "Add class and prepare sessions"}</button></form></Sheet>;
}

function EditChildSheet({ child, onClose, onSaved }: { child: Child; onClose: () => void; onSaved: () => Promise<void> }) {
  const [color, setColor] = useState(child.color);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/children/${child.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), color }) });
    if (!response.ok) { const data = await response.json() as { error?: string }; setError(data.error ?? "Could not update this child."); setSaving(false); return; }
    await onSaved();
  }
  return <Sheet title={`Edit ${child.name}`} subtitle="Child profile" onClose={onClose}><form onSubmit={submit} className="sheet-form"><label>Child’s name<input name="name" required maxLength={80} defaultValue={child.name} autoFocus /></label><fieldset><legend>Profile colour</legend><div className="color-picker">{["blue", "coral", "green", "gold"].map((value) => <button type="button" key={value} className={`${value} ${color === value ? "selected" : ""}`} onClick={() => setColor(value)} aria-label={`Use ${value}`}><span>✓</span></button>)}</div></fieldset>{error && <p className="form-error">{error}</p>}<button className="primary-button" disabled={saving}>{saving ? "Saving…" : "Save child profile"}</button></form></Sheet>;
}

function ContactSheet({ contact, onClose, onSaved }: { contact: Contact | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null);
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch(contact ? `/api/contacts/${contact.id}` : "/api/contacts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) { const data = await response.json() as { error?: string }; setError(data.error ?? "Could not save this contact."); setSaving(false); return; }
    await onSaved();
  }
  async function archive() {
    if (!contact || !window.confirm(`Archive ${contact.name}? Their details stay in historical class records.`)) return;
    setSaving(true); setError(null);
    const response = await fetch(`/api/contacts/${contact.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "archive" }) });
    if (!response.ok) { const data = await response.json() as { error?: string }; setError(data.error ?? "Could not archive this contact."); setSaving(false); return; }
    await onSaved();
  }
  return <Sheet title={contact ? contact.name : "Add a contact"} subtitle="Reusable across classes" onClose={onClose}><form onSubmit={submit} className="sheet-form"><label>Name<input name="name" required maxLength={100} defaultValue={contact?.name} autoFocus /></label><label>Institute or business<input name="providerName" maxLength={120} defaultValue={contact?.providerName ?? ""} placeholder="Optional" /></label><div className="money-grid"><label>Phone<input name="phone" maxLength={40} inputMode="tel" defaultValue={contact?.phone ?? ""} placeholder="+971…" /></label><label>Email<input name="email" type="email" maxLength={160} defaultValue={contact?.email ?? ""} placeholder="name@example.com" /></label></div><label>Notes<textarea name="notes" maxLength={500} defaultValue={contact?.notes ?? ""} placeholder="Payment instructions, preferred contact time, or other support details" /></label>{contact && contact.links.length > 0 && <div className="linked-records"><strong>Linked classes</strong>{contact.links.map((link) => <span key={`${link.enrollmentId}-${link.role}`}>{link.childName} · {link.enrollmentName}<small>{contactRoleLabel(link.role)}{link.isPrimary ? " · primary" : ""}{link.enrollmentStatus === "archived" ? " · archived" : ""}</small></span>)}</div>}{error && <p className="form-error">{error}</p>}<button className="primary-button" disabled={saving}>{saving ? "Saving…" : contact ? "Save contact" : "Add contact"}</button>{contact && <button type="button" className="danger-button" disabled={saving} onClick={archive}>Archive contact</button>}</form></Sheet>;
}

function ManageEnrollmentSheet({ enrollment, contacts, onClose, onSaved }: { enrollment: Enrollment; contacts: Contact[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const links = contacts.flatMap((contact) => contact.links.filter((link) => link.enrollmentId === enrollment.id).map((link) => ({ ...link, contact })));
  const available = contacts.filter((contact) => !links.some((link) => link.contact.id === contact.id));
  async function updateDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null);
    const response = await fetch(`/api/enrollments/${enrollment.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...Object.fromEntries(new FormData(event.currentTarget)), version: enrollment.version }) });
    if (!response.ok) { const data = await response.json() as { error?: string }; setError(data.error ?? "Could not update this class."); setSaving(false); return; }
    await onSaved();
  }
  async function link(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null);
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch(`/api/enrollments/${enrollment.id}/contacts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, isPrimary: form.isPrimary === "on" }) });
    if (!response.ok) { const data = await response.json() as { error?: string }; setError(data.error ?? "Could not link this contact."); setSaving(false); return; }
    await onSaved();
  }
  async function unlink(item: typeof links[number]) {
    setSaving(true); setError(null);
    const response = await fetch(`/api/enrollments/${enrollment.id}/contacts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "unlink", contactId: item.contact.id, role: item.role }) });
    if (!response.ok) { const data = await response.json() as { error?: string }; setError(data.error ?? "Could not remove this contact."); setSaving(false); return; }
    await onSaved();
  }
  async function makePrimary(item: typeof links[number]) {
    setSaving(true); setError(null);
    const response = await fetch(`/api/enrollments/${enrollment.id}/contacts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contactId: item.contact.id, role: "teacher", isPrimary: true }) });
    if (!response.ok) { const data = await response.json() as { error?: string }; setError(data.error ?? "Could not set the primary teacher."); setSaving(false); return; }
    await onSaved();
  }
  async function archive() {
    if (!window.confirm(`Archive ${enrollment.name}? Future recurring sessions will stop, while attendance and payment history stay available.`)) return;
    setSaving(true); setError(null);
    const response = await fetch(`/api/enrollments/${enrollment.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "archive" }) });
    if (!response.ok) { const data = await response.json() as { error?: string }; setError(data.error ?? "Could not archive this class."); setSaving(false); return; }
    await onSaved();
  }
  return <Sheet title={enrollment.name} subtitle="Class details and contacts" onClose={onClose}><div className="management-stack"><form onSubmit={updateDetails} className="sheet-form"><label>Display name<input name="displayName" required maxLength={100} defaultValue={enrollment.name} /></label><label>Subject<input name="subject" required maxLength={100} defaultValue={enrollment.subject} /></label><label>Institute or teacher business<input name="providerName" required maxLength={120} defaultValue={enrollment.providerName ?? ""} /></label><label>Location<input name="location" maxLength={160} defaultValue={enrollment.location ?? ""} placeholder="Studio, room, or address" /></label><label>Online-class link<input name="onlineUrl" type="url" maxLength={500} defaultValue={enrollment.onlineUrl ?? ""} placeholder="https://…" /></label><button className="primary-button" disabled={saving}>{saving ? "Saving…" : "Save class details"}</button></form><section className="manage-contacts"><div className="mini-heading"><strong>Class contacts</strong><span>{links.length}</span></div>{links.length === 0 ? <p className="muted">No contacts linked yet.</p> : links.map((item) => <div className="linked-contact" key={`${item.contact.id}-${item.role}`}><span><strong>{item.contact.name}</strong><small>{contactRoleLabel(item.role)}{item.isPrimary ? " · primary" : ""}</small></span><div>{item.role === "teacher" && !item.isPrimary && <button onClick={() => makePrimary(item)} disabled={saving}>Make primary</button>}<button onClick={() => unlink(item)} disabled={saving}>Remove</button></div></div>)}{available.length > 0 && <form onSubmit={link} className="link-contact-form"><label>Saved contact<select name="contactId" required>{available.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label><label>Role<select name="role" defaultValue="teacher"><option value="teacher">Teacher</option><option value="administration">Administration</option><option value="payment_support">Payment support</option><option value="other">Other support</option></select></label><label className="check-row"><input name="isPrimary" type="checkbox" defaultChecked /><span>Primary teacher<small>Used in class reminders</small></span></label><button className="secondary-button" disabled={saving}>Link contact</button></form>}{contacts.length === 0 && <p className="muted">Add a reusable contact from More, then return here to link it.</p>}</section>{error && <p className="form-error">{error}</p>}<div className="archive-zone"><strong>Archive this class</strong><p>Future recurring sessions stop. Attendance, fees, payments, and contact history remain available.</p><button className="danger-button" disabled={saving} onClick={archive}>Archive class</button></div></div></Sheet>;
}

function HouseholdSettingsSheet({ household, onClose, onSaved }: { household: Snapshot["household"]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null);
    const response = await fetch("/api/household", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
    if (!response.ok) { const data = await response.json() as { error?: string }; setError(data.error ?? "Could not update household settings."); setSaving(false); return; }
    await onSaved();
  }
  return <Sheet title="Household settings" subtitle="Defaults for your family" onClose={onClose}><form onSubmit={submit} className="sheet-form"><label>Household name<input name="name" required maxLength={100} defaultValue={household.name} /></label><label>Default timezone<input name="timezone" required maxLength={80} defaultValue={household.timezone} list="classcue-timezones" /><datalist id="classcue-timezones"><option value="Asia/Dubai" /><option value="Asia/Kolkata" /><option value="Europe/London" /><option value="America/New_York" /><option value="Australia/Sydney" /></datalist></label><div className="calculation-note"><strong>For new classes and Today</strong><p>Changing this default updates the household’s Today date and new classes. Existing class schedules keep their own timezone.</p></div>{error && <p className="form-error">{error}</p>}<button className="primary-button" disabled={saving}>{saving ? "Saving…" : "Save household settings"}</button></form></Sheet>;
}

function FeeSetupSheet({ snapshot, onClose, onSaved }: { snapshot: Snapshot; onClose: () => void; onSaved: () => Promise<void> }) {
  const [model, setModel] = useState("monthly");
  const [currency, setCurrency] = useState("AED");
  const [override, setOverride] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enrollments = snapshot.children.flatMap((child) => child.enrollments.map((enrollment) => ({ ...enrollment, childName: child.name }))).filter((enrollment) => !snapshot.fees.arrangements.some((arrangement) => arrangement.enrollmentId === enrollment.id));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null);
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/fee-arrangements", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, model, currency, sessionsIncluded: form.sessionsIncluded || null, confirmedAmount: override ? form.confirmedAmount : null, adjustmentReason: override ? form.adjustmentReason : null }) });
    if (!response.ok) { const data = await response.json() as { error?: string }; setError(data.error ?? "Could not add this fee arrangement."); setSaving(false); return; }
    await onSaved();
  }

  if (enrollments.length === 0) return <Sheet title="Add fee arrangement" subtitle="Every active class is covered" onClose={onClose}><p className="muted">There are no classes without an active fee arrangement.</p></Sheet>;
  return (
    <Sheet title="Add fee arrangement" subtitle="Terms and first amount due" onClose={onClose}>
      <form onSubmit={submit} className="sheet-form fee-form">
        <label>Child and class<select name="enrollmentId" required>{enrollments.map((enrollment) => <option key={enrollment.id} value={enrollment.id}>{enrollment.childName} · {enrollment.name}</option>)}</select></label>
        <fieldset><legend>How is this class charged?</legend><div className="model-options">{[["monthly", "Monthly"], ["term", "Term"], ["package", "Package"], ["per_session", "Per session"]].map(([value, label]) => <button type="button" key={value} className={model === value ? "selected" : ""} onClick={() => setModel(value)}><strong>{label}</strong><small>{feeModelHint(value)}</small></button>)}</div></fieldset>
        <div className="money-grid"><label>Currency<input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase().slice(0, 3))} required pattern="[A-Z]{3}" maxLength={3} /></label><label>{model === "per_session" ? "Rate per session" : model === "package" ? "Package price" : "Configured amount"}<input name="amount" type="number" inputMode="decimal" min={moneyStep(currency)} step={moneyStep(currency)} required placeholder="0.00" /></label></div>
        {(model === "monthly" || model === "package") && <label>{model === "package" ? "Sessions purchased" : "Expected sessions this month"}<input name="sessionsIncluded" type="number" min={1} max={1000} required /></label>}
        <label>Missed-class policy<select name="compensationPolicy" defaultValue="manual"><option value="none">No compensation</option><option value="makeup">Makeup class</option><option value="credit">Session credit</option><option value="manual">Decide case by case</option></select></label>
        <div className="replacement-grid"><label>Period starts<input name="periodStart" type="date" defaultValue={monthStart(snapshot.household.today)} required /></label><label>Period ends<input name="periodEnd" type="date" defaultValue={monthEnd(snapshot.household.today)} required /></label><label className="span-two">Payment due<input name="dueDate" type="date" defaultValue={snapshot.household.today} required /></label></div>
        <label className="check-row"><input type="checkbox" checked={override} onChange={(event) => setOverride(event.target.checked)} /><span><strong>Use a different first amount</strong><small>For a discount, carry-forward, or another agreed adjustment</small></span></label>
        {override && <div className="adjustment-panel"><label>Confirmed first amount<input name="confirmedAmount" type="number" inputMode="decimal" min={moneyStep(currency)} step={moneyStep(currency)} required /></label><label>Why is it different?<textarea name="adjustmentReason" required maxLength={300} placeholder="e.g. three-month prepayment discount" /></label></div>}
        <div className="calculation-note"><strong>Parent-controlled suggestion</strong><p>ClassCue calculates the first due amount from these terms. Any different confirmed amount keeps its explanation in history.</p></div>
        {error && <p className="form-error">{error}</p>}<button className="primary-button" disabled={saving}>{saving ? "Saving fee…" : "Save arrangement and first fee"}</button>
      </form>
    </Sheet>
  );
}

function PaymentSheet({ charge, today, onClose, onSaved }: { charge: FeeCharge; today: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null);
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch(`/api/fee-charges/${charge.id}/payments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    if (!response.ok) { const data = await response.json() as { error?: string }; setError(data.error ?? "Could not record this payment."); setSaving(false); return; }
    await onSaved();
  }
  return <Sheet title={`${charge.childName} · ${charge.enrollmentName}`} subtitle="Record a payment" onClose={onClose}><form onSubmit={submit} className="sheet-form"><div className="payment-hero"><span>Outstanding</span><strong>{formatMoney(charge.outstandingAmountMinor, charge.currency)}</strong><small>{periodLabel(charge)}</small></div><label>Amount paid<input name="amount" type="number" inputMode="decimal" min={moneyStep(charge.currency)} max={minorToInput(charge.outstandingAmountMinor, charge.currency)} step={moneyStep(charge.currency)} defaultValue={minorToInput(charge.outstandingAmountMinor, charge.currency)} required /></label><div className="replacement-grid"><label>Payment date<input name="paidAt" type="date" defaultValue={today} required /></label><label>Method<select name="method" defaultValue="bank_transfer"><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="online">Online payment</option><option value="other">Other</option></select></label></div><label>Reference<input name="reference" maxLength={120} placeholder="Transfer or receipt reference" /></label><label>Optional note<textarea name="note" maxLength={500} placeholder="Anything useful about this payment" /></label><div className="calculation-note"><strong>Partial payments are supported</strong><p>If this is less than the outstanding amount, the fee remains due with the remaining balance visible.</p></div>{error && <p className="form-error">{error}</p>}<button className="primary-button" disabled={saving}>{saving ? "Recording…" : "Record payment"}</button></form></Sheet>;
}

function FeeAdjustmentSheet({ charge, onClose, onSaved }: { charge: FeeCharge; onClose: () => void; onSaved: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null);
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch(`/api/fee-charges/${charge.id}/adjust`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    if (!response.ok) { const data = await response.json() as { error?: string }; setError(data.error ?? "Could not adjust this fee."); setSaving(false); return; }
    await onSaved();
  }
  return <Sheet title="Confirm a different amount" subtitle={`${charge.childName} · ${periodLabel(charge)}`} onClose={onClose}><form onSubmit={submit} className="sheet-form"><div className="attendance-context"><div><span>Suggested</span><strong>{formatMoney(charge.suggestedAmountMinor, charge.currency)}</strong></div><div><span>Currently confirmed</span><strong>{formatMoney(charge.confirmedAmountMinor, charge.currency)}</strong></div></div><label>New confirmed amount<input name="confirmedAmount" type="number" inputMode="decimal" min={minorToInput(Math.max(1, charge.paidAmountMinor), charge.currency)} step={moneyStep(charge.currency)} defaultValue={minorToInput(charge.confirmedAmountMinor, charge.currency)} required /></label><label>Adjustment reason<textarea name="reason" required maxLength={300} placeholder="Discount, cancellation credit, longer prepayment, or correction" /></label><div className="separation-note"><strong>The original suggestion stays visible</strong><p>This adds an adjustment entry; it does not erase the earlier calculation or payments.</p></div>{error && <p className="form-error">{error}</p>}<button className="primary-button" disabled={saving}>{saving ? "Saving adjustment…" : "Confirm adjusted amount"}</button></form></Sheet>;
}

function NewChargeSheet({ arrangement, today, onClose, onSaved }: { arrangement: FeeArrangement; today: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null);
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch(`/api/fee-arrangements/${arrangement.id}/charges`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    if (!response.ok) { const data = await response.json() as { error?: string }; setError(data.error ?? "Could not create the next fee."); setSaving(false); return; }
    await onSaved();
  }
  return <Sheet title={`${arrangement.childName} · ${arrangement.enrollmentName}`} subtitle="Add the next fee" onClose={onClose}><form onSubmit={submit} className="sheet-form"><div className="future-preview"><strong>{feeModelLabel(arrangement.model)} suggestion</strong><p>{arrangement.model === "per_session" ? "ClassCue counts scheduled and makeup sessions in the selected period." : arrangement.model === "monthly" || arrangement.model === "term" ? "ClassCue uses the previous paid amount when available, otherwise the configured amount." : `ClassCue uses the ${arrangement.sessionsIncluded ?? 0}-session package price.`}</p></div><div className="replacement-grid"><label>Period starts<input name="periodStart" type="date" defaultValue={monthStart(today)} required /></label><label>Period ends<input name="periodEnd" type="date" defaultValue={monthEnd(today)} required /></label><label className="span-two">Payment due<input name="dueDate" type="date" defaultValue={today} required /></label></div><p className="muted">After the fee is created, its calculation is visible and you can confirm a different amount with a reason.</p>{error && <p className="form-error">{error}</p>}<button className="primary-button" disabled={saving}>{saving ? "Calculating…" : "Create suggested fee"}</button></form></Sheet>;
}

function ReminderSetupSheet({ snapshot, onClose, onSaved }: { snapshot: Snapshot; onClose: () => void; onSaved: () => Promise<void> }) {
  const [type, setType] = useState<"class" | "fee_due" | "fee_overdue">("class");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enrollments = snapshot.children.flatMap((child) => child.enrollments.map((enrollment) => ({ ...enrollment, childName: child.name })));
  const feeTargets = snapshot.fees.arrangements;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null);
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const body = { type, enrollmentId: type === "class" ? form.enrollmentId : null, feeArrangementId: type === "class" ? null : form.feeArrangementId, leadMinutes: type === "fee_overdue" ? 0 : Number(form.leadMinutes), repeatIntervalMinutes: type === "fee_overdue" ? Number(form.repeatIntervalMinutes) : null };
    const response = await fetch("/api/reminder-rules", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) { const data = await response.json() as { error?: string }; setError(data.error ?? "Could not save this reminder."); setSaving(false); return; }
    await onSaved();
  }
  return <Sheet title="Configure a reminder" subtitle="Independent timing for each class or fee" onClose={onClose}><form onSubmit={submit} className="sheet-form reminder-form"><fieldset><legend>Reminder type</legend><div className="model-options reminder-type-options"><button type="button" className={type === "class" ? "selected" : ""} onClick={() => setType("class")}><strong>Upcoming class</strong><small>Time, place, and teacher</small></button><button type="button" className={type === "fee_due" ? "selected" : ""} onClick={() => setType("fee_due")}><strong>Fee due</strong><small>Before or on due date</small></button><button type="button" className={type === "fee_overdue" ? "selected" : ""} onClick={() => setType("fee_overdue")}><strong>Overdue fee</strong><small>Repeat until paid</small></button></div></fieldset>{type === "class" ? <label>Child and class<select name="enrollmentId" required>{enrollments.map((enrollment) => <option key={enrollment.id} value={enrollment.id}>{enrollment.childName} · {enrollment.name}</option>)}</select></label> : feeTargets.length > 0 ? <label>Child and fee<select name="feeArrangementId" required>{feeTargets.map((arrangement) => <option key={arrangement.id} value={arrangement.id}>{arrangement.childName} · {arrangement.enrollmentName}</option>)}</select></label> : <p className="form-error">Add a fee arrangement before configuring fee reminders.</p>}{type !== "fee_overdue" && <label>Notify me<select name="leadMinutes" defaultValue={type === "class" ? 60 : 1440}>{type === "class" ? <><option value="15">15 minutes before</option><option value="30">30 minutes before</option><option value="60">1 hour before</option><option value="120">2 hours before</option><option value="1440">1 day before</option></> : <><option value="0">On the due date</option><option value="1440">1 day before</option><option value="4320">3 days before</option><option value="10080">7 days before</option></>}</select></label>}{type === "fee_overdue" && <label>Repeat<select name="repeatIntervalMinutes" defaultValue="4320"><option value="1440">Every day</option><option value="4320">Every 3 days</option><option value="10080">Every 7 days</option><option value="20160">Every 14 days</option><option value="43200">Every 30 days</option></select></label>}<div className="calculation-note"><strong>Parent controlled</strong><p>Saving creates or updates this one rule. ClassCue never shares a reminder or changes another record automatically.</p></div>{error && <p className="form-error">{error}</p>}<button className="primary-button" disabled={saving || (type !== "class" && feeTargets.length === 0)}>{saving ? "Scheduling…" : "Save reminder rule"}</button></form></Sheet>;
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
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>("input, select, textarea, button, a[href]");
    first?.focus();
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [onClose]);
  return <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} className="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" aria-describedby="sheet-subtitle"><div className="sheet-handle"></div><header><div><p className="eyebrow" id="sheet-subtitle">{subtitle}</p><h2 id="sheet-title">{title}</h2></div><button className="close-button" onClick={onClose} aria-label={`Close ${title}`}>×</button></header>{children}</section></div>;
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
function feeModelLabel(model: string) { return ({ monthly: "Monthly", term: "Term", package: "Prepaid package", per_session: "Per session" } as Record<string, string>)[model] ?? model; }
function feeModelHint(model: string) { return ({ monthly: "One amount each month", term: "One amount for a term", package: "Prepaid session balance", per_session: "Rate × classes in period" } as Record<string, string>)[model] ?? ""; }
function paymentMethodLabel(method: string) { return ({ cash: "Cash", bank_transfer: "Bank transfer", card: "Card", online: "Online", other: "Other" } as Record<string, string>)[method] ?? method; }
function contactRoleLabel(role: string) { return ({ teacher: "Teacher", administration: "Administration", payment_support: "Payment support", other: "Other support" } as Record<string, string>)[role] ?? role; }
function currencyDecimals(currency: string) { return ["BHD", "JOD", "KWD", "OMR", "TND"].includes(currency) ? 3 : ["JPY", "KRW", "VND"].includes(currency) ? 0 : 2; }
function formatMoney(amountMinor: number, currency: string) { const decimals = currencyDecimals(currency); return new Intl.NumberFormat("en", { style: "currency", currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(amountMinor / 10 ** decimals); }
function minorToInput(amountMinor: number, currency: string) { const decimals = currencyDecimals(currency); return (amountMinor / 10 ** decimals).toFixed(decimals); }
function moneyStep(currency: string) { return currencyDecimals(currency) === 0 ? "1" : currencyDecimals(currency) === 3 ? "0.001" : "0.01"; }
function monthStart(value: string) { return `${value.slice(0, 7)}-01`; }
function monthEnd(value: string) { const [year, month] = value.split("-").map(Number); return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10); }
function periodLabel(charge: Pick<FeeCharge, "periodStart" | "periodEnd">) { const start = shortDate(charge.periodStart); const end = shortDate(charge.periodEnd); return charge.periodStart === charge.periodEnd ? start : `${start} – ${end}`; }
async function shareFee(charge: FeeCharge) { const text = `${charge.childName} · ${charge.enrollmentName}: ${formatMoney(charge.outstandingAmountMinor || charge.confirmedAmountMinor, charge.currency)} ${charge.status === "paid" ? "paid" : `due ${shortDate(charge.dueDate)}`}.`; if (navigator.share) await navigator.share({ title: "ClassCue fee reminder", text }).catch(() => undefined); else await navigator.clipboard?.writeText(text).catch(() => undefined); }
function reminderTypeLabel(type: string) { return ({ class: "Upcoming class", fee_due: "Fee due", fee_overdue: "Overdue fee" } as Record<string, string>)[type] ?? type; }
function reminderTimingLabel(rule: ReminderRule) { if (rule.type === "fee_overdue") return `Repeats every ${Math.round((rule.repeatIntervalMinutes ?? 1440) / 1440)} ${Math.round((rule.repeatIntervalMinutes ?? 1440) / 1440) === 1 ? "day" : "days"} until paid`; if (rule.leadMinutes === 0) return "On the due date"; if (rule.leadMinutes < 60) return `${rule.leadMinutes} minutes before`; if (rule.leadMinutes < 1440) return `${rule.leadMinutes / 60} ${rule.leadMinutes === 60 ? "hour" : "hours"} before`; return `${rule.leadMinutes / 1440} ${rule.leadMinutes === 1440 ? "day" : "days"} before`; }
function dateTimeLabel(value: string) { return new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
async function shareReminder(job: ReminderJob) { if (navigator.share) await navigator.share({ title: job.title, text: job.shareText }).catch(() => undefined); else await navigator.clipboard?.writeText(job.shareText).catch(() => undefined); }
async function inspectPushSubscription(): Promise<{ enabled: boolean; configured: boolean }> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return { enabled: false, configured: false };
  const response = await fetch("/api/push-subscriptions", { cache: "no-store" });
  if (!response.ok) return { enabled: false, configured: false };
  const data = await response.json() as { configured?: boolean };
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  return { enabled: Boolean(subscription), configured: Boolean(data.configured) };
}
function base64urlToUint8Array(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const decoded = atob((value + padding).replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}
function deviceLabel() {
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return `${mobile ? "Phone or tablet" : "Computer"} · ${navigator.platform || "browser"}`.slice(0, 100);
}
async function deliverDueNotifications() {
  if (!("Notification" in window) || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return 0;
  const registration = await navigator.serviceWorker.register("/classcue-sw.js");
  const response = await fetch("/api/reminder-jobs/due", { cache: "no-store" });
  if (!response.ok) return 0;
  const data = await response.json() as { jobs: ReminderJob[] };
  let delivered = 0;
  for (const job of data.jobs) {
    await registration.showNotification(job.title, { body: job.body, tag: job.id, data: { url: `/?reminder=${job.id}` } });
    const marked = await fetch(`/api/reminder-jobs/${job.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "delivered" }) });
    if (marked.ok) delivered += 1;
  }
  return delivered;
}
