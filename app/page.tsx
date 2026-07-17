import { getChatGPTUser, chatGPTSignInPath } from "./chatgpt-auth";
import { ClassCueApp } from "./ClassCueApp";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();

  if (!user) {
    return (
      <main className="signin-page">
        <section className="signin-card">
          <div className="brand-mark" aria-hidden="true">C</div>
          <p className="eyebrow">ClassCue for parents</p>
          <h1>Every class, calmly accounted for.</h1>
          <p className="signin-copy">
            Keep children’s schedules, attendance, punctuality, fees, and reminders together—without another spreadsheet.
          </p>
          <a className="primary-button signin-button" href={chatGPTSignInPath("/")}>Sign in to ClassCue</a>
          <div className="trust-row" aria-label="ClassCue principles">
            <span>Private by default</span>
            <span>Parent controlled</span>
            <span>Phone first</span>
          </div>
        </section>
      </main>
    );
  }

  return <ClassCueApp displayName={user.displayName} />;
}
