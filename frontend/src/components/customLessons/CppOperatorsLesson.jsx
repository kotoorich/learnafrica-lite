/**
 * CppOperatorsLesson — teaching lesson: Operators.
 * component_key suggestion: cpp-operators
 */
import { Calculator, Lightbulb, Target } from 'lucide-react';

function CodeBlock({ code, highlightLines = [] }) {
  const lines = code.trim().split('\n');
  return (
    <div className="rounded-xl overflow-hidden border border-border bg-slate-950 my-4 shadow-sm">
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-900 border-b border-slate-800">
        <div className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500/70" /><span className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" /><span className="h-2.5 w-2.5 rounded-full bg-green-500/70" /></div>
        <span className="text-[11px] font-mono text-slate-400 ml-2">main.cpp</span>
      </div>
      <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed">
        <code className="font-mono">
          {lines.map((line, i) => (
            <div key={i} className={highlightLines.includes(i + 1) ? 'bg-primary/10 -mx-4 px-4 border-l-2 border-primary text-slate-100' : 'text-slate-300'}>
              <span className="inline-block w-6 text-slate-600 select-none">{i + 1}</span>{line || ' '}
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}

function Callout({ icon: Icon, tone = 'primary', title, children }) {
  const tones = { primary: 'border-primary/30 bg-primary/5 text-primary', warning: 'border-warning/30 bg-warning/5 text-warning', success: 'border-success/30 bg-success/5 text-success' };
  return (
    <aside className={`rounded-xl border p-5 my-5 ${tones[tone]}`}>
      <div className="flex items-center gap-2 mb-2"><Icon className="h-4 w-4" /><p className="font-bold">{title}</p></div>
      <div className="text-sm text-foreground/90 leading-relaxed space-y-2">{children}</div>
    </aside>
  );
}

export default function CppOperatorsLesson({ student, lesson }) {
  const firstName = (student?.name || 'there').split(' ')[0];

  const arithCode = `int a = 10, b = 3;

a + b;   // 13
a - b;   // 7
a * b;   // 30
a / b;   // 3   <-- integer division! not 3.333
a % b;   // 1   <-- remainder ("modulo")`;

  const relCode = `int a = 10, b = 3;

a == b;   // false — is equal to
a != b;   // true  — is not equal to
a > b;    // true
a <= b;   // false`;

  const incCode = `int score = 5;
score++;      // score is now 6  (post-increment)
++score;      // score is now 7  (pre-increment)
score += 10;  // score is now 17 (shorthand for score = score + 10)`;

  return (
    <article className="max-w-3xl mx-auto py-8 px-4 sm:px-6 space-y-10">
      <header className="space-y-4 pb-8 border-b border-border">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
          <Calculator className="h-3.5 w-3.5" /> Lesson · Operators
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight">Operators</h1>
        <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
          {firstName}, operators are the symbols that do the actual work on your variables —
          math, comparisons, and quick shortcuts for common patterns. You've already seen one:
          the assignment operator, <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-sm">=</code>.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Arithmetic Operators</h2>
        <CodeBlock code={arithCode} highlightLines={[5]} />
        <Callout icon={Lightbulb} title="Integer division trap">
          <p>
            When both numbers are <code className="px-1 rounded bg-muted/60 font-mono text-xs">int</code>, division
            throws away the decimal part entirely — <code className="px-1 rounded bg-muted/60 font-mono text-xs">10 / 3</code> gives{' '}
            <code className="px-1 rounded bg-muted/60 font-mono text-xs">3</code>, not{' '}
            <code className="px-1 rounded bg-muted/60 font-mono text-xs">3.33</code>. To get a decimal result, at least one
            of the numbers needs to be a <code className="px-1 rounded bg-muted/60 font-mono text-xs">float</code> or{' '}
            <code className="px-1 rounded bg-muted/60 font-mono text-xs">double</code>. This trips up nearly every
            beginner at least once.
          </p>
        </Callout>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Relational & Logical Operators</h2>
        <p className="leading-relaxed text-foreground/90">
          These compare values and always produce a <code className="px-1 rounded bg-muted font-mono text-xs">bool</code> —
          true or false. You'll use these constantly once you get to conditionals.
        </p>
        <CodeBlock code={relCode} />
        <p className="leading-relaxed text-foreground/90">
          The big one to watch: <code className="px-1 rounded bg-muted font-mono text-xs">==</code> checks
          equality, while a single <code className="px-1 rounded bg-muted font-mono text-xs">=</code> assigns a value.
          Using one <code className="px-1 rounded bg-muted font-mono text-xs">=</code> when you meant{' '}
          <code className="px-1 rounded bg-muted font-mono text-xs">==</code> is a classic bug — the compiler often won't
          even warn you.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Increment, Decrement & Shorthand</h2>
        <CodeBlock code={incCode} />
        <p className="leading-relaxed text-foreground/90">
          <code className="px-1 rounded bg-muted font-mono text-xs">score++</code> and{' '}
          <code className="px-1 rounded bg-muted font-mono text-xs">++score</code> both add 1 — the difference between
          them only matters when you use the result immediately in the same expression, which you'll
          run into later. For now, know both exist and both add 1.
        </p>
      </section>

      <Callout icon={Target} tone="success" title="Try It Yourself">
        <p>
          Declare two int variables with your own values. Print the result of all five arithmetic
          operators on them, then print the result of comparing them with <code className="px-1 rounded bg-muted/60 font-mono text-xs">&gt;</code>.
        </p>
      </Callout>

      <section className="rounded-xl border border-border bg-muted/30 p-6 sm:p-8 text-center space-y-3">
        <h3 className="text-xl font-bold">Great, {firstName}.</h3>
        <p className="text-sm text-muted-foreground max-w-prose mx-auto leading-relaxed">
          Next: getting input from the user and printing formatted output — the last piece before
          you build your first real interactive program.
        </p>
      </section>
    </article>
  );
}
