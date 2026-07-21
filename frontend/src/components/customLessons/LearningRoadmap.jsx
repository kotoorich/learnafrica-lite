/**
 * LearningRoadmap — a preview of what students will learn across the course.
 *
 * Good for placement near the start of a course, right after Welcome, to help
 * students see the big picture before they dive into individual lessons.
 *
 * Props:
 *   - student: { id, name, email, avatar, role, ... }
 *   - lesson:  { id, title, order, is_final, ... }
 */
import { Map, CheckCircle2, Zap, Target, GraduationCap, ExternalLink } from 'lucide-react';

export default function LearningRoadmap({ student, lesson }) {
  const firstName = (student?.name || 'friend').split(' ')[0];

  const milestones = [
    {
      phase: 'Weeks 1–2',
      title: 'The Fundamentals',
      description:
        "You'll start with the core concepts — the vocabulary and mental models everything else in this course is built on. Expect short lessons that focus on clarity over depth. If you already have some background, feel free to skim, but don't skip: the language used later assumes you've been through these.",
      icon: Zap,
    },
    {
      phase: 'Weeks 3–4',
      title: 'Practical Applications',
      description:
        "Once the vocabulary is in place, we shift to using it. You'll start building small examples, breaking them, and fixing them. This is usually where students say 'oh, that's what that meant' — the concepts start clicking because you're applying them.",
      icon: Target,
    },
    {
      phase: 'Weeks 5–6',
      title: 'Deeper Techniques',
      description:
        "This is where we go from 'can do it' to 'understands it'. The lessons in this phase introduce more advanced patterns and edge cases. You'll be surprised how much the earlier material makes sense in retrospect once these ideas land.",
      icon: Map,
    },
    {
      phase: 'Final Week',
      title: 'Real-World Practice + Assessment',
      description:
        "You'll work through a capstone-style challenge that puts together everything you've learned, followed by the final quiz. Passing the quiz earns you your certificate — proof of the skills you've built.",
      icon: GraduationCap,
    },
  ];

  return (
    <article className="max-w-3xl mx-auto py-8 px-4 sm:px-6 space-y-10">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="space-y-4 pb-8 border-b border-border">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
          <Map className="h-3.5 w-3.5" /> Your Roadmap
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight">
          Here's what's ahead, {firstName}.
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
          Before you dive into the individual lessons, it helps to see the shape of
          the whole journey. This page lays out the four phases of the course, what
          you'll build in each, and what to expect emotionally along the way. Bookmark
          this — a lot of students come back to it mid-course when they need a reminder
          of where they're headed.
        </p>
      </header>

      {/* ── Milestones ─────────────────────────────────────────────── */}
      <section className="space-y-6">
        {milestones.map((m, i) => (
          <div key={i} className="relative pl-12">
            {/* Vertical line for all but the last */}
            {i < milestones.length - 1 && (
              <div className="absolute left-[19px] top-12 bottom-[-24px] w-px bg-border" />
            )}
            {/* Icon bubble */}
            <div className="absolute left-0 top-0 h-10 w-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
              <m.icon className="h-4 w-4 text-primary" />
            </div>
            <div className="pt-1 space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-primary">{m.phase}</p>
              <h2 className="text-xl font-bold">{m.title}</h2>
              <p className="leading-relaxed text-foreground/90">{m.description}</p>
            </div>
          </div>
        ))}
      </section>

      {/* ── What you'll come away with ─────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-primary" /> What you'll come away with
        </h2>
        <p className="leading-relaxed text-foreground/90">
          By the end of this course, you won't just have watched some videos. You'll
          have built things you can point at. You'll have a vocabulary for talking
          about the topic with confidence — in interviews, in meetings, in your own
          projects. And you'll have a certificate that says you finished, which is
          worth more than most people realise.
        </p>
        <p className="leading-relaxed text-foreground/90">
          For anyone continuing beyond this course, the resources you'll want to look
          at next include{' '}
          <a
            href="https://roadmap.sh"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2 hover:text-primary/80 inline-flex items-center gap-1"
          >
            roadmap.sh <ExternalLink className="h-3 w-3" />
          </a>{' '}for curated learning tracks, and{' '}
          <a
            href="https://www.freecodecamp.org/"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2 hover:text-primary/80 inline-flex items-center gap-1"
          >
            freeCodeCamp <ExternalLink className="h-3 w-3" />
          </a>{' '}for hands-on practice.
        </p>
      </section>

      {/* ── One more thing ────────────────────────────────────────── */}
      <section className="rounded-xl border border-primary/30 bg-primary/5 p-6 sm:p-8 text-center space-y-3">
        <h3 className="text-xl font-bold">One more thing before you start.</h3>
        <p className="text-sm text-muted-foreground max-w-prose mx-auto leading-relaxed">
          Progress isn't always linear. Some weeks you'll feel unstoppable. Others
          you'll feel like nothing's clicking. That's normal — it's what learning
          actually looks like when you're honest about it. Keep going. The valleys
          are where the growth happens.
        </p>
      </section>
    </article>
  );
}
