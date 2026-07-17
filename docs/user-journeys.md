# ClassCue User Journeys and Screen Map

Status: Initial phone-first interaction design drafted on 17 July 2026.

## Navigation model

Use four primary destinations in a phone bottom navigation:

1. **Today** — urgent classes, attendance actions, and fee dues.
2. **Children** — each child's schedule, enrollments, attendance, and fee summary.
3. **Fees** — upcoming dues, overdue items, payments, and package balances.
4. **More** — contacts, reminder preferences, archived enrollments, and account settings.

## Screen map

### Today

- Today's date and a concise household highlight.
- Sections grouped by child.
- Upcoming and recently completed class sessions.
- Quick actions for attendance, lateness, schedule changes, and reminder sharing.
- Fees due soon or overdue.
- A small AI insights area containing suggestions only, never automatic changes.

### Children

- Child list with next class, attendance rate, and paid/due summary.
- Child detail with upcoming schedule, active enrollments, attendance history, lateness, makeup balance, and fees.
- Add or edit child.

### Enrollment detail

- Subject, institute, schedule, location or online link, contacts, fee arrangement, and reminder timing.
- Upcoming and past sessions.
- Attendance and fee summary.
- Edit future recurrence.
- Archive enrollment.

### Session detail

- Scheduled date, start time, location, and linked enrollment.
- Schedule state: scheduled, cancelled, rescheduled, holiday, or makeup.
- Attendance state: on time, late, or absent when applicable.
- Minutes-late input shown only when late is selected.
- Link to an original, replacement, or makeup session.
- Share reminder action.

### Fees

- Due soon, overdue, and paid sections.
- Child and currency shown on every item.
- Separate totals by currency.
- Package session balance where applicable.

### Fee detail

- Fee period or package, calculation breakdown, previous payment, adjustments, and final confirmed amount.
- Parent override and adjustment reason.
- Mark paid with payment date and method.
- Class-specific reminder timing.
- AI explanation or suggestion shown as a reviewable proposal.

### Contacts and settings

- Reusable contacts with roles and linked enrollments.
- Add, edit, link, or unlink a contact without duplicating it.
- Notification permission and household defaults.
- Archived enrollment access.

## Core journeys

### Journey 1: First-time setup

1. Parent creates the first child.
2. Parent creates or selects reusable contacts.
3. Parent adds an enrollment with subject, institute, recurring schedule, location, fee arrangement, currency, and reminders.
4. ClassCue previews generated sessions and the first expected fee.
5. Parent confirms the setup.
6. Today shows the child's next relevant actions.

### Journey 2: Daily check

1. Parent opens Today.
2. Parent sees classes and fee dues grouped by child.
3. Parent opens a class for details or shares its reminder.
4. After class, parent records attendance with a quick action.

### Journey 3: Record a late arrival

1. Parent opens the relevant session.
2. Parent selects late.
3. Parent enters minutes late.
4. ClassCue shows the resulting punctuality record.
5. Parent confirms and saves it.

### Journey 4: Cancel and arrange a makeup

1. Parent opens the original session and chooses a schedule change.
2. Parent applies the change to this session only.
3. Parent marks the original session cancelled.
4. Parent optionally creates a replacement makeup session.
5. ClassCue links both sessions while leaving attendance separate.

### Journey 5: Change the recurring schedule

1. Parent opens an enrollment or future session.
2. Parent changes the recurrence day or time.
3. Parent chooses to apply it to this and future sessions.
4. ClassCue previews affected future sessions.
5. Parent confirms the change; historical sessions remain unchanged.

### Journey 6: Review and pay a fee

1. Parent opens a due fee.
2. ClassCue shows the suggested amount and calculation.
3. AI may explain unusual discounts, cancellations, or carry-forward sessions.
4. Parent accepts the amount or overrides it with a reason.
5. Parent records the payment date and method.
6. The fee moves to paid and related reminders stop.

### Journey 7: Act on a reminder

1. The parent receives a phone notification.
2. Opening it goes directly to the relevant session or fee.
3. The parent can act, adjust reminder timing, or share the reminder.
4. Sharing uses the phone share menu and requires an explicit parent action.

### Journey 8: Review an AI suggestion

1. ClassCue identifies a fee, reminder, attendance, or lateness pattern.
2. It explains the evidence and proposed action.
3. The parent accepts, edits, or dismisses the suggestion.
4. Only an accepted proposal changes a record.

## Interaction rules

- Today is urgent and brief; Children holds the detailed history.
- Quick actions must not hide consequential changes.
- Schedule state, attendance state, and punctuality are edited separately.
- Any change affecting future sessions includes a preview before confirmation.
- Destructive actions use archive or explicit confirmation rather than silent deletion.
- AI suggestions always show evidence, proposed changes, and confirmation controls.
