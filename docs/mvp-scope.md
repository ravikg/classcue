# ClassCue MVP Scope

Status: Drafted from the confirmed product requirements on 17 July 2026.

## MVP objective

Prove that a parent can manage multiple children's extracurricular schedules, attendance, punctuality, fees, and reminders from a phone without relying on spreadsheets or memory.

## Success criteria

The MVP succeeds when a parent can:

1. add a child and create a recurring class enrollment;
2. see today's important classes and fee dues, grouped by child;
3. record attendance, including minutes late;
4. cancel or reschedule one session without damaging the recurring schedule;
5. link a cancelled session to a makeup session;
6. understand what fee is due and why;
7. record a payment and payment method;
8. receive and manually share useful reminders; and
9. review an AI suggestion before accepting or rejecting it.

## Included in the MVP

### Parent and family setup

- One parent account.
- Multiple child profiles.
- Reusable contacts with teacher, administration, payment-support, or other roles.
- Separate enrollment for each child and class.
- Archive enrollments while preserving history.

### Scheduling

- Recurring weekly class schedules.
- Generated future sessions.
- Edit one session or the selected session and future sessions.
- Cancelled, rescheduled, holiday, and makeup sessions.
- Link an original session to its replacement or makeup session.
- Class location or online link.

### Attendance

- Keep session status, attendance, and punctuality as separate fields.
- Record attended, absent, or not-yet-recorded attendance for sessions that take place.
- Record on-time or late punctuality for attended sessions.
- Default an attended session to on time.
- Record minutes late.
- Show attendance rate, late-arrival count, and makeup balance.

### Fees

- Monthly, term, prepaid-package, and per-session fee models.
- Currency selected per fee arrangement.
- Suggested amount based on the configured arrangement, previous payment, and relevant session changes.
- Parent override with an adjustment reason.
- Due and paid states.
- Payment amount, date, and method.
- Purchased, used, compensated, and remaining session balances for packages.
- Paid and due totals grouped by child and currency.

### Reminders and sharing

- Phone notifications for upcoming classes, upcoming fee dues, and overdue fees.
- Reminder timing configured independently for each class and fee arrangement.
- Repeating overdue reminders until the fee is marked paid.
- Manual sharing through the phone share menu.

### AI assistance

- Explain a suggested fee amount in plain language.
- Suggest useful reminder timing from the class or fee context.
- Highlight attendance, lateness, and fee patterns.
- Present every proposed record change for parent confirmation.
- Never change records or share information automatically.

## Useful if time permits

- Receipt attachment.
- More detailed notification preferences.
- A lightweight household summary across all children.
- Additional payment-status detail beyond due and paid.

## Explicitly deferred

- Tutor accounts or tutor-entered information.
- Multiple parent accounts.
- Homework, topics taught, and learning-progress tracking.
- Payment processing or bank integration.
- School-system or calendar integrations.
- Formal PDF or spreadsheet exports.
- Automated sharing or messaging.

## MVP quality requirements

- Phone-first responsive experience.
- Fast common actions that can be completed with one hand.
- Clear distinction between scheduled state, attendance state, and punctuality.
- Clear fee calculations with visible parent overrides.
- Historical records are preserved when schedules or enrollments change.
- Currency values are never silently combined across currencies.
- AI-generated content is visibly labeled and requires confirmation.
- Empty, loading, validation, permission, and error states are understandable.
