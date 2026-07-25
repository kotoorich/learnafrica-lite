/**
 * CppWelcomeLesson — orientation page for "C++ Programming for Beginners".
 * component_key suggestion: cpp-beginner-welcome
 */
import { Code2, Compass, Target, Rocket, Clock, MessageCircle } from 'lucide-react';

export default function CppWelcomeLesson({ student, lesson }) {
  const firstName = (student?.name || 'there').split(' ')[0];

  return (
    <article className="max-w-3xl mx-auto py-8 px-4 sm:px-6 space-y-10">
      <header className="space-y-4 pb-8 border-b border-border">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
          <Code2 className="h-3.5 w-3.5" /> Welcome
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight">
          Welcome to C++, {firstName}.
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
          C++ powers everything from game engines to operating systems to the software running
          in cars and spacecraft. It has a reputation for being hard — and it's true that it
          doesn't hide much from you. But that's also the best reason to learn it: once you
          understand C++, most other languages feel easy by comparison, because you'll actually
          understand what's happening under the hood instead of trusting magic.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Compass className="h-5 w-5 text-primary" /> What This Course Covers
        </h2>
        <p className="leading-relaxed text-foreground/90">
          This Beginner track takes you from "what even is a program" to writing a complete,
          working game (a number-guessing program) using variables, input/output, decisions,
          and loops. Every lesson builds directly on the one before it — nothing here is filler.
        </p>
        <p className="leading-relaxed text-foreground/90">
          You'll see two kinds of lessons: reading lessons like this one (with real code you can
          run), and short videos for a few topics that are easier to watch than read. Both count
          — don't skip the videos just because there's no text to scroll past.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" /> One Thing That Actually Matters
        </h2>
        <p className="leading-relaxed text-foreground/90">
          Type the code out yourself. Don't copy-paste. Typing forces your hands and eyes to
          notice every character — the semicolons, the braces, the exact spelling — and that
          repetition is how the syntax stops feeling foreign. Get a compiler running today (an
          online one is fine to start) before you go further than this page.
        </p>
      </section>

      <section className="rounded-xl border border-primary/30 bg-primary/5 p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Rocket className="h-4 w-4 text-primary" />
          <p className="font-bold text-primary">By the end of this course you will have</p>
        </div>
        <ul className="text-sm text-foreground/90 space-y-1.5 list-disc list-inside">
          <li>Written and run real C++ programs from scratch, not just filled in blanks</li>
          <li>A working mental model of variables, types, operators, and control flow</li>
          <li>A finished project — a playable number-guessing game — you built yourself</li>
          <li>A certificate, and a solid foundation for the Intermediate track</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" /> When You Get Stuck
        </h2>
        <p className="leading-relaxed text-foreground/90">
          You will get a compiler error at some point that makes no sense. Everyone does. Read
          it slowly, look at the line number it mentions, and check the lesson's "Common
          Mistakes" section first — most beginner errors are one of the same handful of causes.
          If you're still stuck after 20 minutes, post in the lesson discussion. That's what
          it's there for.
        </p>
      </section>

      <section className="rounded-xl border border-border bg-muted/30 p-6 sm:p-8 text-center space-y-3">
        <div className="flex items-center justify-center gap-2 text-muted-foreground text-xs font-bold uppercase tracking-widest">
          <Clock className="h-3.5 w-3.5" /> ~4 weeks, at your own pace
        </div>
        <h3 className="text-xl font-bold">Let's write your first program, {firstName}.</h3>
        <p className="text-sm text-muted-foreground max-w-prose mx-auto leading-relaxed">
          Click Next when you're ready to begin.
        </p>
      </section>
    </article>
  );
}
