/**
 * CppStructureIntroLesson — a real teaching lesson (not just a welcome page).
 *
 * Topic: Anatomy of a C++ Program — the first proper lesson of the
 * "C++ Programming for Beginners" course. Explains #include, main(),
 * statements, braces, and comments using a real worked example, then
 * gives the student a small hands-on challenge.
 *
 * Every custom lesson component in the registry receives:
 *   - student: { id, name, email, avatar, role, ... }
 *   - lesson:  { id, title, order, is_final, component_key, ... }
 */
import {
  Code2, Terminal, Lightbulb, AlertTriangle, CheckCircle2,
  ChevronRight, Sparkles, HelpCircle, Target,
} from 'lucide-react';

// Small reusable code-block component — monospace, dark, line numbers optional
function CodeBlock({ code, highlightLines = [] }) {
  const lines = code.trim().split('\n');
  return (
    <div className="rounded-xl overflow-hidden border border-border bg-slate-950 my-4 shadow-sm">
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-900 border-b border-slate-800">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
        </div>
        <span className="text-[11px] font-mono text-slate-400 ml-2">main.cpp</span>
      </div>
      <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed">
        <code className="font-mono">
          {lines.map((line, i) => (
            <div
              key={i}
              className={
                highlightLines.includes(i + 1)
                  ? 'bg-primary/10 -mx-4 px-4 border-l-2 border-primary text-slate-100'
                  : 'text-slate-300'
              }
            >
              <span className="inline-block w-6 text-slate-600 select-none">{i + 1}</span>
              {line || ' '}
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}

function Callout({ icon: Icon, tone = 'primary', title, children }) {
  const tones = {
    primary: 'border-primary/30 bg-primary/5 text-primary',
    warning: 'border-warning/30 bg-warning/5 text-warning',
    success: 'border-success/30 bg-success/5 text-success',
  };
  return (
    <aside className={`rounded-xl border p-5 my-5 ${tones[tone]}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4" />
        <p className="font-bold">{title}</p>
      </div>
      <div className="text-sm text-foreground/90 leading-relaxed space-y-2">{children}</div>
    </aside>
  );
}

export default function CppStructureIntroLesson({ student, lesson }) {
  const firstName = (student?.name || 'there').split(' ')[0];

  const helloWorld = `#include <iostream>

int main() {
    std::cout << "Hello, world!";
    return 0;
}`;

  const withComments = `#include <iostream>
// This program prints a short greeting to the screen

int main() {
    std::cout << "Hello, world!" << std::endl;
    return 0;
}`;

  return (
    <article className="max-w-3xl mx-auto py-8 px-4 sm:px-6 space-y-10">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="space-y-4 pb-8 border-b border-border">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
          <Code2 className="h-3.5 w-3.5" /> Lesson · C++ Basics
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight">
          Anatomy of a C++ Program
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
          Hi <span className="font-semibold text-foreground">{firstName}</span> — every C++ program,
          no matter how big, is built from the same handful of moving parts. Once you can read
          the five lines below and know exactly what each one is doing, you're no longer
          intimidated by C++ code — you're reading it.
        </p>
      </header>

      {/* ── Section 1: What "running" a program means ─────────────── */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Terminal className="h-5 w-5 text-primary" /> What Happens When You Run This
        </h2>
        <p className="leading-relaxed text-foreground/90">
          C++ is a <strong>compiled</strong> language. That means before your program can run,
          a separate program called a <em>compiler</em> reads your source code and translates
          it into machine code — instructions the processor can execute directly. This is
          different from languages like Python or JavaScript, which are read and run line by
          line by an interpreter.
        </p>
        <p className="leading-relaxed text-foreground/90">
          Practically, this means there are two steps between "code you wrote" and "program
          that runs": compiling (translating your code) and executing (running the translated
          result). If your code has a typo or breaks a grammar rule of C++, the compiler stops
          you right there with an error — before the program ever runs.
        </p>
      </section>

      {/* ── Section 2: The minimal program ─────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Code2 className="h-5 w-5 text-primary" /> The Smallest Real C++ Program
        </h2>
        <p className="leading-relaxed text-foreground/90">
          Here is a complete, valid C++ program. It's short, but every line has a job:
        </p>
        <CodeBlock code={helloWorld} highlightLines={[1, 3, 4, 5]} />
        <p className="leading-relaxed text-foreground/90">
          Run this, and it prints exactly one thing to the screen: <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-sm">Hello, world!</code>.
          Let's take it apart line by line.
        </p>
      </section>

      {/* ── Section 3: Line by line breakdown ──────────────────────── */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <ChevronRight className="h-5 w-5 text-primary" /> Breaking It Down
        </h2>

        <div className="space-y-5">
          <div className="flex gap-4">
            <div className="shrink-0 h-8 w-8 rounded-full bg-primary/10 text-primary font-mono font-bold text-sm flex items-center justify-center">1</div>
            <div className="space-y-1">
              <p className="font-bold font-mono text-sm">#include &lt;iostream&gt;</p>
              <p className="text-sm text-foreground/80 leading-relaxed">
                This line doesn't do anything when your program runs — it happens before
                compiling even starts. It tells the compiler "pull in the tools for handling
                input and output," because printing text to the screen isn't built into the
                core language itself. It's part of the C++ <em>standard library</em>, and you
                have to ask for it explicitly.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="shrink-0 h-8 w-8 rounded-full bg-primary/10 text-primary font-mono font-bold text-sm flex items-center justify-center">3</div>
            <div className="space-y-1">
              <p className="font-bold font-mono text-sm">int main() {'{'}</p>
              <p className="text-sm text-foreground/80 leading-relaxed">
                Every C++ program needs exactly one function named <code className="px-1 rounded bg-muted font-mono text-xs">main</code> —
                it's the entry point. When your program starts, this is the first code that
                runs. The <code className="px-1 rounded bg-muted font-mono text-xs">int</code> before it
                means this function will hand back a whole number when it finishes — you'll see
                why in a moment. The opening curly brace <code className="px-1 rounded bg-muted font-mono text-xs">{'{'}</code> marks
                "everything inside main starts here."
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="shrink-0 h-8 w-8 rounded-full bg-primary/10 text-primary font-mono font-bold text-sm flex items-center justify-center">4</div>
            <div className="space-y-1">
              <p className="font-bold font-mono text-sm">std::cout &lt;&lt; "Hello, world!";</p>
              <p className="text-sm text-foreground/80 leading-relaxed">
                This is a <em>statement</em> — a single complete instruction, always ending in
                a semicolon. <code className="px-1 rounded bg-muted font-mono text-xs">std::cout</code> represents
                "the standard output" (your screen). The <code className="px-1 rounded bg-muted font-mono text-xs">{'<<'}</code> operator
                sends whatever's on its right into that output stream. So this line means:
                "send the text Hello, world! to the screen."
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="shrink-0 h-8 w-8 rounded-full bg-primary/10 text-primary font-mono font-bold text-sm flex items-center justify-center">5</div>
            <div className="space-y-1">
              <p className="font-bold font-mono text-sm">return 0;</p>
              <p className="text-sm text-foreground/80 leading-relaxed">
                Remember that <code className="px-1 rounded bg-muted font-mono text-xs">int</code> from
                line 3? This is where main hands that number back — to the operating system,
                not to your screen. By convention, <code className="px-1 rounded bg-muted font-mono text-xs">0</code> means
                "everything went fine." Any other number is normally used to signal that
                something went wrong. You won't see this number when you run the program —
                it's read by whatever launched your program, not printed to the console.
              </p>
            </div>
          </div>
        </div>

        <Callout icon={Lightbulb} title="Why the curly braces matter">
          <p>
            The opening <code className="px-1 rounded bg-muted font-mono text-xs">{'{'}</code> and
            closing <code className="px-1 rounded bg-muted font-mono text-xs">{'}'}</code> define
            a <em>block</em> — everything main is responsible for. Forget the closing brace, and
            the compiler won't know where main ends; that's one of the most common beginner
            errors, and the error message it gives you can look scarier than the mistake
            actually is.
          </p>
        </Callout>
      </section>

      {/* ── Section 4: Comments ────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" /> Leaving Notes for Yourself: Comments
        </h2>
        <p className="leading-relaxed text-foreground/90">
          Anything after <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-sm">//</code> on
          a line is a <em>comment</em> — the compiler ignores it completely. Comments exist
          purely for humans reading the code later (including future-you).
        </p>
        <CodeBlock code={withComments} highlightLines={[2]} />
        <p className="leading-relaxed text-foreground/90">
          Notice this version also uses <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-sm">std::endl</code> after
          the text — that inserts a line break, similar to pressing Enter, so anything printed
          after it starts on a fresh line.
        </p>
      </section>

      {/* ── Section 5: Try it yourself ─────────────────────────────── */}
      <Callout icon={Target} tone="success" title="Try It Yourself">
        <p>Open any C++ compiler (or an online one if you don't have one installed yet) and:</p>
        <ol className="list-decimal list-inside space-y-1 mt-2">
          <li>Type out the "Hello, world!" program exactly as shown above.</li>
          <li>Run it, and confirm you see the greeting printed.</li>
          <li>Change the text between the quotes to a greeting of your own, and run it again.</li>
          <li>Add a second <code className="px-1 rounded bg-muted/60 font-mono text-xs">std::cout</code> line
            before <code className="px-1 rounded bg-muted/60 font-mono text-xs">return 0;</code> that
            prints a second line of text.</li>
        </ol>
        <p className="pt-1">
          If it compiles and prints both lines, you've just written and understood your first
          real C++ program from the ground up — not copied blindly, but actually understood.
        </p>
      </Callout>

      {/* ── Section 6: Common mistakes ──────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning" /> Common First-Timer Mistakes
        </h2>
        <ul className="space-y-2">
          {[
            'Forgetting the semicolon at the end of a statement — this is the single most common beginner error.',
            'Mismatched curly braces — every { needs exactly one matching }.',
            'Forgetting #include <iostream> and then wondering why std::cout doesn\'t work.',
            'Writing cout instead of std::cout without a "using namespace std;" line above it.',
          ].map((text, i) => (
            <li key={i} className="flex gap-2 text-sm text-foreground/90">
              <span className="text-warning font-bold shrink-0">•</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Section 7: Quick self-check ─────────────────────────────── */}
      <Callout icon={HelpCircle} tone="primary" title="Quick Self-Check (not graded)">
        <p>Before moving to the next lesson, see if you can answer these out loud:</p>
        <ul className="list-disc list-inside space-y-1 mt-2">
          <li>What does the compiler do that an interpreter doesn't?</li>
          <li>Why does main() need curly braces?</li>
          <li>What is std::cout, in your own words?</li>
          <li>What does the semicolon at the end of a statement actually do?</li>
        </ul>
        <p className="pt-1">
          If any of these feel shaky, re-read the matching section above before continuing —
          this lesson is the foundation everything else in the course builds on.
        </p>
      </Callout>

      {/* ── Closing ──────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-muted/30 p-6 sm:p-8 text-center space-y-3">
        <h3 className="text-xl font-bold">Nice work, {firstName}.</h3>
        <p className="text-sm text-muted-foreground max-w-prose mx-auto leading-relaxed">
          You now understand the skeleton every C++ program shares. The next lessons build on
          this directly — variables, which live inside main(), are next.
        </p>
      </section>
    </article>
  );
}
