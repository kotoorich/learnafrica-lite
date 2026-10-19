/**
 * HowToStudyGuide — sample custom lesson component.
 *
 * A long-form reading page: headings, paragraphs, hyperlinks, callouts.
 * Full width, scrollable, matches the existing LearnAfrica theme (Tailwind).
 *
 * Every custom lesson component in the registry receives the same two props:
 *   - student: { id, name, email, avatar, role, ... } — the logged-in user
 *   - lesson:  { id, title, order, is_final, ... }   — the lesson metadata
 *
 * These let the component personalize content (e.g. address student by name).
 */
import { BookOpen, Target, Clock, Users, Lightbulb, ExternalLink, Sparkles, CheckCircle2 } from 'lucide-react';

export default function HowToStudyGuide({ student, lesson }) {
  const firstName = (student?.name || 'there').split(' ')[0];

  return (
    <article className="max-w-3xl mx-auto py-8 px-4 sm:px-6 space-y-10">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="space-y-4 pb-8 border-b border-border">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
          <BookOpen className="h-3.5 w-3.5" /> Study Guide
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight">
          How to Get the Most Out of This Course
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
          Hi <span className="font-semibold text-foreground">{firstName}</span> — welcome. Before you dive
          into the lessons ahead, take a few minutes to read through this guide. The
          students who finish courses and actually apply what they learn all share a
          few habits in common. This page walks you through them.
        </p>
      </header>

      {/* ── Section 1: Why this matters ────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" /> Why How You Study Matters
        </h2>
        <p className="leading-relaxed text-foreground/90">
          Enrolling in a course is the easy part. Finishing it, understanding the
          material, and being able to use it in your own work — that's the hard part.
          Research on how adults learn consistently shows that the difference between
          students who succeed and those who drop off is not intelligence or talent.
          It's method.
        </p>
        <p className="leading-relaxed text-foreground/90">
          Passive learning — watching videos while doing something else, skipping
          ahead, treating a course like Netflix — feels productive but produces almost
          no lasting knowledge. Active learning takes more effort in the moment but
          means the material actually sticks. The sections below explain how to make
          your learning active.
        </p>
        <p className="text-sm text-muted-foreground">
          For a deeper dive into the science behind this, see the classic paper{' '}
          <a
            href="https://en.wikipedia.org/wiki/Learning_pyramid"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2 hover:text-primary/80 inline-flex items-center gap-1"
          >
            The Learning Pyramid <ExternalLink className="h-3 w-3" />
          </a>
          {' '}and the well-known{' '}
          <a
            href="https://en.wikipedia.org/wiki/Feynman_Technique"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2 hover:text-primary/80 inline-flex items-center gap-1"
          >
            Feynman Technique <ExternalLink className="h-3 w-3" />
          </a>.
        </p>
      </section>

      {/* ── Section 2: Set up a routine ───────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" /> Build a Study Routine
        </h2>
        <p className="leading-relaxed text-foreground/90">
          Consistency beats intensity every time. A student who studies for 30 minutes
          daily will outperform one who does five-hour marathons on weekends. Your
          brain consolidates information during rest — spacing your sessions out gives
          it time to do that work.
        </p>
        <p className="leading-relaxed text-foreground/90">
          Pick a fixed time and place. Same seat, same time of day. It sounds small,
          but the brain wires study habits to environmental cues. After a week or two,
          sitting down in that spot at that time will trigger a "study mode" mental
          state without any effort from you.
        </p>

        {/* Callout: recommended pattern */}
        <aside className="rounded-xl border border-primary/30 bg-primary/5 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <p className="font-bold text-primary">Recommended Pattern</p>
          </div>
          <ul className="space-y-2 text-sm text-foreground/90">
            <li className="flex gap-2">
              <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
              <span>Study 45 minutes, then take a 15-minute walk or break</span>
            </li>
            <li className="flex gap-2">
              <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
              <span>Aim for 3–5 sessions per week — not necessarily daily</span>
            </li>
            <li className="flex gap-2">
              <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
              <span>End each session by writing one thing you learned in your own words</span>
            </li>
            <li className="flex gap-2">
              <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
              <span>Review the previous session's notes at the start of the next one</span>
            </li>
          </ul>
        </aside>

        <p className="text-sm text-muted-foreground">
          If you want a proven technique for structured study blocks, look up the{' '}
          <a
            href="https://en.wikipedia.org/wiki/Pomodoro_Technique"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2 hover:text-primary/80 inline-flex items-center gap-1"
          >
            Pomodoro Technique <ExternalLink className="h-3 w-3" />
          </a>.
        </p>
      </section>

      {/* ── Section 3: Active learning ────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" /> Learn Actively, Not Passively
        </h2>
        <p className="leading-relaxed text-foreground/90">
          The single biggest predictor of whether you'll retain what you learn is how
          actively you engage with it. Video lessons and readings are inputs — they
          only turn into skill when you do something with them.
        </p>
        <p className="leading-relaxed text-foreground/90">
          After each lesson, ask yourself three questions: <em>What did I just learn?</em>
          {' '}<em>Where would I use this?</em> <em>What am I still confused about?</em>{' '}
          Write your answers down — even one sentence each. This habit alone will
          double your retention.
        </p>
        <p className="leading-relaxed text-foreground/90">
          For coding or technical courses, do not just watch — type the examples
          yourself, break them on purpose, and then fix them. For business or theory
          courses, take one concept per lesson and try to explain it out loud to
          someone else (or a rubber duck). If you cannot explain it, you do not yet
          understand it.
        </p>
        <p className="text-sm text-muted-foreground">
          If you're new to note-taking systems, the{' '}
          <a
            href="https://www.cornell.edu/video/the-cornell-note-taking-system"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2 hover:text-primary/80 inline-flex items-center gap-1"
          >
            Cornell Note-Taking System <ExternalLink className="h-3 w-3" />
          </a>
          {' '}is a good starting point, or try{' '}
          <a
            href="https://www.buildingasecondbrain.com/"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2 hover:text-primary/80 inline-flex items-center gap-1"
          >
            Building a Second Brain <ExternalLink className="h-3 w-3" />
          </a>{' '}for a more modern digital approach.
        </p>
      </section>

      {/* ── Section 4: Community ──────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" /> Learn With Others
        </h2>
        <p className="leading-relaxed text-foreground/90">
          The lonely learner is the one most likely to quit. Even a small connection —
          a WhatsApp group of two or three classmates, a friend you check in with once
          a week — dramatically raises your odds of finishing. Learning is social.
          Isolation is where motivation goes to die.
        </p>
        <p className="leading-relaxed text-foreground/90">
          When you get stuck, ask. Post a question in the community discussion,
          message the instructor, or bring it up with a peer. The 15 minutes you save
          not banging your head against a problem alone is worth far more than any
          pride you'll spend admitting confusion.
        </p>
        <p className="leading-relaxed text-foreground/90">
          Reversing the flow works too. Explaining something to someone else — even
          badly — is one of the most effective ways to lock in knowledge. If you
          understand a concept, find someone who doesn't and teach it to them. You'll
          be shocked how many gaps in your own understanding surface when you have to
          put it into words.
        </p>
      </section>

      {/* ── Section 5: What to expect ─────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" /> What to Expect Ahead
        </h2>
        <p className="leading-relaxed text-foreground/90">
          This course is structured to move you from foundational concepts to real
          practical application. Early lessons build the vocabulary and mental models
          you need. Later lessons ask you to use those models to solve problems. The
          quiz at the end is not a hurdle — it is a chance to confirm that the
          material has landed, and to earn the certificate you can share with
          employers and peers.
        </p>
        <p className="leading-relaxed text-foreground/90">
          Some lessons will feel easy. Some will feel like a wall. Both are normal.
          The wall lessons are usually the ones where the most learning happens — the
          discomfort is your brain wiring new connections. Push through them, and if
          you get stuck for more than 20 minutes, come back the next day. Sleep does
          real work on hard problems.
        </p>
        <p className="leading-relaxed text-foreground/90">
          Reach out to the instructor when you need to. That's what they're here for.
          The community discussion is another great place to ask questions — often a
          peer has hit the same wall you're hitting, and someone else has already
          answered.
        </p>
      </section>

      {/* ── Closing ───────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-muted/30 p-6 sm:p-8 text-center space-y-3">
        <h3 className="text-xl font-bold">You've got this, {firstName}.</h3>
        <p className="text-sm text-muted-foreground max-w-prose mx-auto leading-relaxed">
          Finishing a course is a real accomplishment. Show up consistently, engage
          actively, ask questions when you need to, and by the end of this course
          you'll have something concrete to show for it. When you're ready, move on
          to the next lesson.
        </p>
      </section>
    </article>
  );
}
