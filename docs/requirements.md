# ClassCue Product Requirements

Status: Initial requirements confirmed through user discussion on 16 July 2026.

## Product purpose

ClassCue helps a parent see which child has which extracurricular class and when, track attendance and punctuality, manage flexible fees, and receive timely reminders.

## Primary user and product shape

- The primary user is a parent.
- The first version supports one parent account and multiple children.
- The experience should be designed primarily for phone access.
- Information is organized by child, with today's classes and fee dues highlighted first.
- Each child has a separate enrollment, even when siblings attend the same activity.

## Children, contacts, and classes

- Setup starts by adding children, then creating each child's class enrollments.
- A class stores its subject, institute, schedule, fee arrangement, currency, and relevant contacts.
- Contacts are reusable records so the same person or institute details can be linked to multiple children and classes without duplication.
- A class can have multiple contacts with roles such as teacher, administration, payment support, or other support.
- The teacher is the primary contact.
- A contact can include a name, role, phone number, email address, and notes.
- An enrollment can be archived without deleting its attendance or payment history.

## Scheduling

- The parent creates a recurring schedule once, and ClassCue generates future sessions.
- A parent can change one session only or change that session and future sessions in the recurrence.
- Session-level exceptions include cancellation, rescheduling, holidays, and makeup classes.
- Related changes should remain linked. For example, a cancelled session can be linked to the makeup session that replaces it.

## Attendance and punctuality

- Attendance states include on time, late, absent, cancelled, rescheduled, and makeup.
- On time is the default for an attended session.
- When a child is late, the parent records the number of minutes late.
- Punctuality is tracked separately from schedule changes and session type.
- The primary attendance insight is attendance rate.
- Supporting insights include late arrivals and cancelled or makeup session balances.

## Fees and payments

- Supported fee models include:
  - monthly fees, including the expected number of sessions in the month;
  - prepaid session packages;
  - term fees; and
  - per-session fees.
- Each class or fee arrangement can use its own currency.
- ClassCue may suggest the next amount due using the previous payment and the configured fee arrangement.
- The parent can override the suggested amount and record an adjustment reason.
- Calculations must accommodate discounts for longer payment periods, cancellations, makeup or carry-forward sessions, and classes that do not compensate for missed sessions.
- Prepaid arrangements track purchased, used, cancelled, compensated, and remaining sessions.
- The first version tracks due and paid states plus payment method.
- Receipt attachment is desirable but not essential for the first release.
- The primary fee insights are amounts paid and currently due.

## Reminders and sharing

- Phone notifications are required.
- Reminder types include upcoming classes, upcoming fee dues, and overdue fees.
- Reminder timing is configured separately for each class and each fee arrangement.
- An upcoming-class reminder includes the child, class time, location or online link, and primary teacher contact.
- Overdue-fee reminders can repeat until the fee is marked paid, using a parent-selected frequency.
- A reminder can be shared manually through the phone's share menu with a child or another parent.
- A shared reminder includes the child, class or fee, date, and time.

## AI assistance and parent control

- AI should help the parent:
  - interpret mixed fee arrangements;
  - suggest fee calculations and reminders;
  - identify attendance, punctuality, and payment patterns; and
  - later, help track a child's learning progress.
- AI may analyze information and propose actions, but it must not change schedules, attendance, payments, or other records without parent confirmation.
- AI must not share information or reminders without parent confirmation.

## Future scope

- Track topics taught, learning progress, and homework after a low-friction way to communicate with teachers is designed.
- Support exports and formal reports such as PDFs or spreadsheets.
- Expand receipt handling and other supporting payment records.
- Consider broader family access after the one-parent workflow is proven.

## Explicit first-release boundaries

- Parent-managed only; tutors do not enter data in the first version.
- Extracurricular classes are the primary use case.
- Learning progress and homework are future capabilities, not core first-release workflows.
- ClassCue tracks fees and payments; payment processing is not currently required.
