/**
 * CourseWelcome — a warm welcome page for the start of any course.
 *
 * Personalized greeting, expectations, and encouragement. Good candidate for
 * the very first lesson of any course. Long enough to feel like real content
 * without being overwhelming.
 */
import { Sparkles, Compass, Target, MessageCircle, Rocket, Clock, ExternalLink } from 'lucide-react';

export default function CourseWelcome({ student, lesson }) {
  const firstName = (student?.name || 'there').split(' ')[0];

  return (
    <article className="max-w-3xl mx-auto py-8 px-4 sm:px-6 space-y-10">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="space-y-4 pb-8 border-b border-border">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
          <Sparkles className="h-3.5 w-3.5" /> Welcome
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight">
          Welcome aboard, {firstName}.
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
          You've just taken the first step in something new. Whether this course is a
          career move, a side interest, or something in between — you've shown up, and
          that already puts you ahead of most people who thought about doing this and
          didn't. This page walks you through what to expect and how to get the most
          out of what's ahead.
        </p>
      </header>

      {/* ── Section 1: What this course is ────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Compass className="h-5 w-5 text-primary" /> What This Course Is
        </h2>
        <p className="leading-relaxed text-foreground/90">
          This is a self-paced learning experience. That means you set the tempo — but
          the material is structured so that following it in order will get you to a
          real, usable skill by the end. Every lesson builds on the one before it.
        </p>
        <p className="leading-relaxed text-foreground/90">
          Some lessons are videos, some are readings, some are quizzes to check your
          understanding. All of them matter. Don't skip the quizzes — they exist
          because writing something down or picking an answer is the moment your brain
          decides whether a concept was actually understood or just watched.
        </p>
      </section>

      {/* ── Section 2: What we expect from you ────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" /> What We Expect From You
        </h2>
        <p className="leading-relaxed text-foreground/90">
          Show up regularly. Even 20 minutes three times a week is enough — but
          spaced-out attention beats an occasional five-hour session every time.
          Consistency is what turns "I watched a course" into "I know this."
        </p>
        <p className="leading-relaxed text-foreground/90">
          Come with questions. If something doesn't make sense, that's a signal, not a
          failure. The instructor and the community are here to help — asking is what
          moves you forward. Silence is what keeps you stuck.
        </p>
        <p className="leading-relaxed text-foreground/90">
          Bring what you learn out of the browser. Practice by hand. Explain a concept
          to someone else — the moments you fumble are the exact places you need to
          revisit. Learning is not a spectator sport.
        </p>
      </section>

      {/* ── Section 3: How to get help ────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" /> How to Get Help
        </h2>
        <p className="leading-relaxed text-foreground/90">
          Every lesson has a discussion thread underneath it. If you're stuck for more
          than 20 minutes on a single problem, that's your cue to post there. Chances
          are someone else has hit the same wall — and if not, an instructor or peer
          will help you through it.
        </p>
        <p className="leading-relaxed text-foreground/90">
          When you post, tell us what you tried, not just what's broken. "I tried X
          and expected Y but got Z" gets a useful answer in minutes. "It doesn't work"
          usually just gets more questions.
        </p>
        <aside className="rounded-xl border border-primary/30 bg-primary/5 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Rocket className="h-4 w-4 text-primary" />
            <p className="font-bold text-primary">Quick tip</p>
          </div>
          <p className="text-sm text-foreground/90">
            When something works — a demo runs, a concept clicks — pause for 30 seconds
            and write down what you just did. Future-you will thank present-you when
            you need to remember how something works two weeks from now.
          </p>
        </aside>
      </section>

      {/* ── Section 4: What comes next ────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" /> What Comes Next
        </h2>
        <p className="leading-relaxed text-foreground/90">
          The rest of this course walks you through the material step by step. Take
          notes. Do the exercises. When you finish, there's a final quiz — pass it,
          and you earn a certificate you can share on{' '}
          <a
            href="https://www.linkedin.com/"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2 hover:text-primary/80 inline-flex items-center gap-1"
          >
            LinkedIn <ExternalLink className="h-3 w-3" />
          </a>{' '}
          or add to your CV.
        </p>
        <p className="leading-relaxed text-foreground/90">
          But honestly — the certificate is not the point. The skill is the point.
          If a piece of knowledge from this course helps you get a job, build
          something you're proud of, or teach someone else, that's the real prize.
          The paper is just a bonus.
        </p>
      </section>

      {/* ── Closing ───────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-muted/30 p-6 sm:p-8 text-center space-y-3">
        <h3 className="text-xl font-bold">Ready when you are, {firstName}.</h3>
        <p className="text-sm text-muted-foreground max-w-prose mx-auto leading-relaxed">
          Take a breath, click Next when you're ready, and let's begin.
        </p>
      </section>
    </article>
  );
}
